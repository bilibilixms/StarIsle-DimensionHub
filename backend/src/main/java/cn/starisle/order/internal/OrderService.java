package cn.starisle.order.internal;

import cn.starisle.catalog.api.InventoryService;
import cn.starisle.catalog.api.InventoryService.ReservedItem;
import cn.starisle.identity.internal.AccountService;
import cn.starisle.order.api.OrderController.Checkout;
import cn.starisle.order.api.OrderView;
import cn.starisle.shared.Sha256;
import cn.starisle.shop.api.ShopService;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class OrderService {
    private static final long MAX_SAFE_AMOUNT = 9_007_199_254_740_991L;
    private final JdbcClient jdbc;
    private final InventoryService inventory;
    private final AccountService accounts;
    private final ShopService shops;
    private final RefundService refunds;
    private final ObjectMapper json;

    public OrderService(JdbcClient jdbc, InventoryService inventory, AccountService accounts,
                        ShopService shops, RefundService refunds, ObjectMapper json) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.accounts = accounts;
        this.shops = shops;
        this.refunds = refunds;
        this.json = json;
    }

    @Transactional
    public List<String> checkout(long buyerId, String operationKey, Checkout request) {
        byte[] digest = Sha256.digest(json.writeValueAsBytes(request));
        jdbc.sql("""
                INSERT INTO order_checkout (buyer_id, operation_key, payload_digest) VALUES (:buyer, :key, :digest)
                ON DUPLICATE KEY UPDATE id = id
                """).param("buyer", buyerId).param("key", operationKey).param("digest", digest).update();
        var saved = jdbc.sql("""
                SELECT id, payload_digest FROM order_checkout WHERE buyer_id = :buyer AND operation_key = :key FOR UPDATE
                """).param("buyer", buyerId).param("key", operationKey).query(CheckoutReceipt.class).single();
        if (!MessageDigest.isEqual(saved.payloadDigest(), digest)) {
            throw conflict("该支付请求已用于其他订单");
        }
        var existing = jdbc.sql("SELECT id FROM market_order WHERE checkout_id = :id ORDER BY id")
                .param("id", saved.id()).query((row, index) -> row.getString("id")).list();
        if (!existing.isEmpty()) return existing;

        var items = inventory.reserve(request.items().stream().map(item -> new InventoryService.Line(
                item.productId(), item.skuId(), item.quantity(), item.expectedPrice(), item.variantName())).toList());
        var grouped = items.stream().collect(Collectors.groupingBy(ReservedItem::shopId, LinkedHashMap::new,
                Collectors.toList()));
        var ids = new ArrayList<String>();
        long totalAmount = 0;
        String buyer = accounts.buyerName(buyerId);
        for (var entry : grouped.entrySet()) {
            long amount = entry.getValue().stream().mapToLong(item -> item.unitPrice() * item.quantity())
                    .reduce(0, OrderService::addAmount);
            totalAmount = addAmount(totalAmount, amount);
            var key = new GeneratedKeyHolder();
            jdbc.sql("""
                    INSERT INTO market_order
                        (checkout_id, buyer_id, shop_id, shop_name, buyer_name, recipient_name, recipient_phone,
                         recipient_address, amount_cents)
                    VALUES (:checkout, :buyerId, :shop, :shopName, :buyer, :name, :phone, :address, :amount)
                    """).param("checkout", saved.id()).param("buyerId", buyerId).param("shop", entry.getKey())
                    .param("shopName", entry.getValue().getFirst().shopName()).param("buyer", buyer)
                    .param("name", request.recipient().name().strip()).param("phone", request.recipient().phone())
                    .param("address", request.recipient().address().strip()).param("amount", amount)
                    .update(key, "id");
            long orderId = key.getKey().longValue();
            for (var item : entry.getValue()) {
                jdbc.sql("""
                        INSERT INTO market_order_item
                            (order_id, product_id, sku_id, title, variant, cover_url, unit_price_cents, quantity)
                        VALUES (:orderId, :product, :sku, :title, :variant, :cover, :price, :quantity)
                        """).param("orderId", orderId).param("product", item.productId()).param("sku", item.skuId())
                        .param("title", item.title()).param("variant", item.variant())
                        .param("cover", item.coverUrl(), Types.VARCHAR).param("price", item.unitPrice())
                        .param("quantity", item.quantity()).update();
            }
            ids.add(Long.toString(orderId));
        }
        return ids;
    }

    @Transactional
    public void ship(long ownerId, long orderId, String carrier, String tracking) {
        long shopId = shops.findOwnedShop(ownerId).orElseThrow(OrderService::notFound).id();
        var order = jdbc.sql("""
                SELECT status, carrier, tracking FROM market_order WHERE id = :id AND shop_id = :shop FOR UPDATE
                """).param("id", orderId).param("shop", shopId).query(ShipmentState.class)
                .optional().orElseThrow(OrderService::notFound);
        if ("REFUND_PENDING".equals(order.status()) || "REFUNDED".equals(order.status())) {
            throw conflict("该订单正在售后或已退款，无法发货");
        }
        if ("PAID".equals(order.status())) {
            jdbc.sql("""
                    UPDATE market_order SET status = 'SHIPPED', carrier = :carrier, tracking = :tracking,
                        shipped_at = CURRENT_TIMESTAMP(6) WHERE id = :id
                    """).param("carrier", carrier).param("tracking", tracking).param("id", orderId).update();
        } else if (!Objects.equals(order.carrier(), carrier) || !Objects.equals(order.tracking(), tracking)) {
            throw conflict("订单已发货，物流信息已记录");
        }
    }

    @Transactional
    public void receive(long buyerId, long orderId) {
        String status = jdbc.sql("SELECT status FROM market_order WHERE id = :id AND buyer_id = :buyer FOR UPDATE")
                .param("id", orderId).param("buyer", buyerId).query(String.class)
                .optional().orElseThrow(OrderService::notFound);
        if ("COMPLETED".equals(status)) return;
        if (!"SHIPPED".equals(status)) throw conflict("订单发货后才能确认收货");
        jdbc.sql("UPDATE market_order SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP(6) WHERE id = :id")
                .param("id", orderId).update();
    }

    public List<OrderView> marketplace(long id, boolean merchant) {
        var query = merchant
                ? jdbc.sql("SELECT * FROM market_order WHERE shop_id = :owner ORDER BY id DESC")
                : jdbc.sql("SELECT * FROM market_order WHERE buyer_id = :owner ORDER BY id DESC");
        var orders = query.param("owner", id).query(this::mapOrder).list();
        if (orders.isEmpty()) return orders;
        var ids = orders.stream().map(order -> Long.parseLong(order.id())).toList();
        var items = jdbc.sql("""
                SELECT id, order_id, product_id, sku_id, title, variant, cover_url, unit_price_cents, quantity
                FROM market_order_item WHERE order_id IN (:ids) ORDER BY id
                """).param("ids", ids)
                .query((row, index) -> new OrderItem(row.getString("order_id"),
                        new OrderView.Item(row.getString("id"), row.getString("product_id"), row.getString("sku_id"),
                                row.getString("title"), row.getString("variant"), row.getString("cover_url"),
                                row.getLong("unit_price_cents"), row.getInt("quantity"))))
                .list().stream().collect(Collectors.groupingBy(OrderItem::orderId,
                        Collectors.mapping(OrderItem::item, Collectors.toList())));
        var afterSales = refunds.forOrders(ids);
        return orders.stream().map(order -> order.withDetails(items.get(order.id()),
                afterSales.getOrDefault(Long.parseLong(order.id()), List.of()))).toList();
    }

    private OrderView mapOrder(ResultSet row, int index) throws SQLException {
        return new OrderView(row.getString("id"), row.getString("shop_id"), row.getString("shop_name"),
                row.getString("buyer_id"), row.getString("buyer_name"), new OrderView.Recipient(
                        row.getString("recipient_name"), row.getString("recipient_phone"), row.getString("recipient_address")),
                row.getLong("amount_cents"), row.getString("status"), row.getString("carrier"),
                row.getString("tracking"), instant(row.getTimestamp("created_at")),
                instant(row.getTimestamp("shipped_at")), instant(row.getTimestamp("completed_at")), List.of(), null, List.of());
    }

    private static String instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant().toString();
    }

    private static long addAmount(long left, long right) {
        if (right > MAX_SAFE_AMOUNT - left) throw conflict("订单金额超过单次交易上限");
        return left + right;
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "订单不存在或不可访问");
    }

    private record CheckoutReceipt(long id, byte[] payloadDigest) {}

    private record ShipmentState(String status, String carrier, String tracking) {}

    private record OrderItem(String orderId, OrderView.Item item) {}
}
