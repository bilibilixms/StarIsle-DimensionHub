package cn.starisle.order.internal;

import cn.starisle.catalog.api.InventoryService;
import cn.starisle.order.api.OrderController.Recipient;
import cn.starisle.order.api.OrderView;
import cn.starisle.order.api.RefundView;
import cn.starisle.shop.api.ShopService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RefundService {
    private static final Set<String> ELIGIBLE = Set.of("PAID", "SHIPPED", "COMPLETED");
    private final JdbcClient jdbc;
    private final ShopService shops;
    private final InventoryService inventory;

    public RefundService(JdbcClient jdbc, ShopService shops, InventoryService inventory) {
        this.jdbc = jdbc;
        this.shops = shops;
        this.inventory = inventory;
    }

    @Transactional
    public RefundView request(long buyerId, long orderId, String operationKey, String type, String reason) {
        var order = lockOrder(orderId, buyerId, false);
        var previous = jdbc.sql("SELECT * FROM market_order_refund WHERE order_id = :id AND operation_key = :key")
                .param("id", orderId).param("key", operationKey).query(this::mapRefund).optional();
        if (previous.isPresent()) {
            var refund = previous.orElseThrow();
            if (!refund.type().equals(type) || !refund.reason().equals(reason)) {
                throw conflict("该申请请求已用于其他售后内容");
            }
            return refund;
        }
        if (!ELIGIBLE.contains(order.status())) throw conflict("当前订单不能重复申请售后");
        if ("PAID".equals(order.status()) && "RETURN_REFUND".equals(type)) {
            throw badRequest("未发货订单无需退货");
        }
        var key = new GeneratedKeyHolder();
        jdbc.sql("""
                INSERT INTO market_order_refund (order_id, operation_key, original_status, type, reason)
                VALUES (:order, :key, :original, :type, :reason)
                """).param("order", orderId).param("key", operationKey).param("original", order.status())
                .param("type", type).param("reason", reason).update(key, "id");
        setOrderStatus(orderId, "REFUND_PENDING");
        return refund(orderId, key.getKey().longValue());
    }

    @Transactional
    public RefundView cancel(long buyerId, long orderId, long refundId) {
        var order = lockOrder(orderId, buyerId, false);
        var refund = refund(orderId, refundId);
        if ("CANCELLED".equals(refund.status())) return refund;
        if (!"REFUND_PENDING".equals(order.status()) || !Set.of("PENDING", "WAIT_RETURN").contains(refund.status())) {
            throw conflict("售后状态已变化，寄出后无法撤销");
        }
        jdbc.sql("""
                UPDATE market_order_refund SET status = 'CANCELLED', resolved_at = CURRENT_TIMESTAMP(6) WHERE id = :id
                """).param("id", refundId).update();
        setOrderStatus(orderId, refund.originalStatus());
        return refund(orderId, refundId);
    }

    @Transactional
    public RefundView decide(long ownerId, long orderId, long refundId, boolean approve, String reply, Recipient address) {
        // Lock the shop before the order and inventory so that checkout and catalog edits can serialize safely.
        long shopId = shops.lockOwnedShop(ownerId).id();
        var order = lockOrder(orderId, shopId, true);
        var refund = refund(orderId, refundId);
        if (!approve) {
            if (reply == null || reply.isBlank()) throw badRequest("请填写拒绝原因");
            String reason = reply.strip();
            if ("REJECTED".equals(refund.status()) && reason.equals(refund.reply())) return refund;
            requireStatus(order, refund, "PENDING");
            jdbc.sql("""
                    UPDATE market_order_refund SET status = 'REJECTED', reply = :reason,
                        resolved_at = CURRENT_TIMESTAMP(6) WHERE id = :id
                    """).param("id", refundId).param("reason", reason).update();
            setOrderStatus(orderId, refund.originalStatus());
        } else if ("RETURN_REFUND".equals(refund.type())) {
            if (address == null) throw badRequest("请填写完整的退货地址");
            var normalized = new OrderView.Recipient(address.name().strip(), address.phone(), address.address().strip());
            if (normalized.equals(refund.returnAddress())) return refund;
            requireStatus(order, refund, "PENDING");
            jdbc.sql("""
                    UPDATE market_order_refund SET status = 'WAIT_RETURN', accepted_at = CURRENT_TIMESTAMP(6),
                        return_name = :name, return_phone = :phone, return_address = :address, reply = :reply
                    WHERE id = :id
                    """).param("id", refundId).param("name", normalized.name()).param("phone", normalized.phone())
                    .param("address", normalized.address()).param("reply", "商家同意退货，请按地址寄回商品").update();
        } else {
            if ("APPROVED".equals(refund.status())) return refund;
            requireStatus(order, refund, "PENDING");
            finish(orderId, refundId, shopId, "PAID".equals(refund.originalStatus()), "商家同意整单退款");
        }
        return refund(orderId, refundId);
    }

    @Transactional
    public RefundView returnShipment(long buyerId, long orderId, long refundId, String carrier, String tracking) {
        var order = lockOrder(orderId, buyerId, false);
        var refund = refund(orderId, refundId);
        if (!tracking.matches("[A-Za-z0-9]{8,24}")) throw badRequest("请填写 8–24 位字母或数字物流单号");
        if (carrier.equals(refund.returnCarrier()) && tracking.equals(refund.returnTracking())) return refund;
        requireStatus(order, refund, "WAIT_RETURN");
        jdbc.sql("""
                UPDATE market_order_refund SET status = 'WAIT_RECEIPT', returned_at = CURRENT_TIMESTAMP(6),
                    return_carrier = :carrier, return_tracking = :tracking WHERE id = :id
                """).param("id", refundId).param("carrier", carrier).param("tracking", tracking).update();
        return refund(orderId, refundId);
    }

    @Transactional
    public RefundView receiveReturn(long ownerId, long orderId, long refundId, boolean restock) {
        long shopId = shops.lockOwnedShop(ownerId).id();
        var order = lockOrder(orderId, shopId, true);
        var refund = refund(orderId, refundId);
        if ("RETURN_REFUND".equals(refund.type()) && "APPROVED".equals(refund.status())
                && Objects.equals(refund.restocked(), restock)) return refund;
        requireStatus(order, refund, "WAIT_RECEIPT");
        finish(orderId, refundId, shopId, restock, "商家确认收到退货，模拟退款完成");
        return refund(orderId, refundId);
    }

    Map<Long, List<RefundView>> forOrders(List<Long> ids) {
        return jdbc.sql("SELECT * FROM market_order_refund WHERE order_id IN (:ids) ORDER BY id")
                .param("ids", ids).query((row, index) -> new OrderRefund(row.getLong("order_id"), mapRefund(row, index)))
                .list().stream().collect(Collectors.groupingBy(OrderRefund::orderId,
                        Collectors.mapping(OrderRefund::refund, Collectors.toList())));
    }

    private void finish(long orderId, long refundId, long shopId, boolean restock, String reply) {
        var items = jdbc.sql("""
                SELECT product_id, sku_id, quantity FROM market_order_item WHERE order_id = :id ORDER BY product_id, sku_id
                """).param("id", orderId).query(InventoryService.RefundLine.class).list();
        inventory.completeRefund(shopId, items, restock);
        jdbc.sql("""
                UPDATE market_order_refund SET status = 'APPROVED', reply = :reply, restocked = :restocked,
                    resolved_at = CURRENT_TIMESTAMP(6) WHERE id = :id
                """).param("id", refundId).param("reply", reply).param("restocked", restock).update();
        setOrderStatus(orderId, "REFUNDED");
    }

    private OrderState lockOrder(long orderId, long actorId, boolean merchant) {
        var query = merchant
                ? jdbc.sql("SELECT status FROM market_order WHERE id = :id AND shop_id = :actor FOR UPDATE")
                : jdbc.sql("SELECT status FROM market_order WHERE id = :id AND buyer_id = :actor FOR UPDATE");
        return query.param("id", orderId).param("actor", actorId).query(OrderState.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "订单不存在或不可访问"));
    }

    private RefundView refund(long orderId, long refundId) {
        return jdbc.sql("SELECT * FROM market_order_refund WHERE id = :id AND order_id = :order")
                .param("id", refundId).param("order", orderId).query(this::mapRefund).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "售后申请不存在"));
    }

    private void setOrderStatus(long id, String status) {
        jdbc.sql("UPDATE market_order SET status = :status WHERE id = :id")
                .param("status", status).param("id", id).update();
    }

    private RefundView mapRefund(ResultSet row, int index) throws SQLException {
        String returnName = row.getString("return_name");
        return new RefundView(row.getString("id"), row.getString("type"), row.getString("original_status"),
                row.getString("status"), row.getString("reason"), row.getString("reply"),
                instant(row.getTimestamp("requested_at")), instant(row.getTimestamp("accepted_at")),
                instant(row.getTimestamp("returned_at")), instant(row.getTimestamp("resolved_at")),
                returnName == null ? null : new OrderView.Recipient(returnName, row.getString("return_phone"),
                        row.getString("return_address")),
                row.getString("return_carrier"), row.getString("return_tracking"), row.getObject("restocked", Boolean.class));
    }

    private static void requireStatus(OrderState order, RefundView refund, String status) {
        if (!"REFUND_PENDING".equals(order.status()) || !status.equals(refund.status())) {
            throw conflict("售后状态已变化，请刷新后重试");
        }
    }

    private static String instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant().toString();
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record OrderState(String status) {}
    private record OrderRefund(long orderId, RefundView refund) {}
}
