package cn.starisle.catalog.api;

import cn.starisle.shop.api.ShopService;
import cn.starisle.shop.api.ShopService.ShopProfile;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class InventoryService {
    private final JdbcClient jdbc;
    private final ShopService shops;

    public InventoryService(JdbcClient jdbc, ShopService shops) {
        this.jdbc = jdbc;
        this.shops = shops;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public List<ReservedItem> reserve(List<Line> requested) {
        var products = new TreeMap<Long, Map<Long, Line>>();
        for (var line : requested) {
            products.computeIfAbsent(line.productId(), unused -> new TreeMap<>()).merge(line.skuId(), line, this::combine);
        }
        // Merchant changes and checkouts both acquire shop locks before touching a product.
        var shopIds = jdbc.sql("SELECT DISTINCT shop_id FROM catalog_product WHERE id IN (:ids) ORDER BY shop_id")
                .param("ids", products.keySet()).query(Long.class).list();
        var lockedShops = new HashMap<Long, ShopProfile>();
        for (long id : shopIds) {
            var shop = shops.lockProfile(id).orElseThrow(InventoryService::unavailable);
            if (!"ACTIVE".equals(shop.status())) throw unavailable();
            lockedShops.put(id, shop);
        }
        var items = new ArrayList<ReservedItem>();
        for (var entry : products.entrySet()) {
            long productId = entry.getKey();
            var product = jdbc.sql("""
                    SELECT shop_id, title, cover_url, status FROM catalog_product WHERE id = :id FOR UPDATE
                    """).param("id", productId).query(Product.class).optional().orElseThrow(InventoryService::unavailable);
            var shop = lockedShops.get(product.shopId());
            if (shop == null || !"PUBLISHED".equals(product.status())) throw unavailable();
            int quantity = 0;
            for (var line : entry.getValue().values()) {
                var sku = jdbc.sql("""
                        SELECT name, price FROM catalog_sku WHERE id = :sku AND product_id = :product FOR UPDATE
                        """).param("sku", line.skuId()).param("product", productId).query(Sku.class)
                        .optional().orElseThrow(() -> conflict("商品规格已调整，请重新选择"));
                long price = sku.price().movePointRight(2).longValueExact();
                if (price != line.expectedPrice() || (line.variantName() != null && !sku.name().equals(line.variantName()))) {
                    throw conflict("商品价格或规格已变化，请重新确认");
                }
                int updated = jdbc.sql("""
                        UPDATE catalog_sku SET stock = stock - :quantity, sold = sold + :quantity
                        WHERE id = :id AND stock >= :quantity
                        """).param("quantity", line.quantity()).param("id", line.skuId()).update();
                if (updated != 1) throw conflict("商品库存不足，请调整数量");
                quantity += line.quantity();
                items.add(new ReservedItem(productId, line.skuId(), product.shopId(), shop.name(),
                        product.title(), product.coverUrl(), sku.name(), price, line.quantity()));
            }
            int updated = jdbc.sql("""
                    UPDATE catalog_product SET stock = stock - :quantity, sold = sold + :quantity
                    WHERE id = :id AND stock >= :quantity
                    """).param("quantity", quantity).param("id", productId).update();
            if (updated != 1) throw conflict("商品库存不足，请调整数量");
        }
        return items;
    }

    private Line combine(Line first, Line second) {
        int quantity = first.quantity() + second.quantity();
        if (first.expectedPrice() != second.expectedPrice()
                || !java.util.Objects.equals(first.variantName(), second.variantName()) || quantity > 999_999) {
            throw conflict("同一规格的价格或购买数量有误");
        }
        return new Line(first.productId(), first.skuId(), quantity, first.expectedPrice(), first.variantName());
    }

    private static ResponseStatusException unavailable() {
        return conflict("商品已下架或店铺暂停营业");
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    public record Line(long productId, long skuId, int quantity, long expectedPrice, String variantName) {}

    public record ReservedItem(long productId, long skuId, long shopId, String shopName, String title,
                               String coverUrl, String variant, long unitPrice, int quantity) {}

    private record Product(long shopId, String title, String coverUrl, String status) {}

    private record Sku(String name, BigDecimal price) {}
}
