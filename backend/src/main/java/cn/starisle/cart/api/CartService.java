package cn.starisle.cart.api;

import cn.starisle.catalog.api.ProductVisibility;
import cn.starisle.catalog.api.ProductVisibility.AvailableSku;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CartService {
    private final JdbcClient jdbc;
    private final ProductVisibility products;

    public CartService(JdbcClient jdbc, ProductVisibility products) {
        this.jdbc = jdbc;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public CartView view(long buyerId) {
        long version = jdbc.sql("SELECT cart_version FROM app_account WHERE id = :buyer")
                .param("buyer", buyerId).query(Long.class).optional().orElseThrow(CartService::missingAccount);
        var items = jdbc.sql("""
                SELECT product_id, sku_id, title, sku_name, quantity, selected FROM buyer_cart_item
                WHERE buyer_id = :buyer AND quantity > 0 ORDER BY product_id, sku_id
                """).param("buyer", buyerId).query((row, index) -> new CartView.Item(row.getString("product_id"),
                row.getString("sku_id"), row.getString("title"), row.getString("sku_name"),
                row.getInt("quantity"), row.getBoolean("selected"))).list();
        return new CartView(version, items);
    }

    @Transactional
    public void save(long buyerId, long productId, long skuId, int quantity, boolean selected, long version) {
        ensureVersion(lock(buyerId), version);
        var existing = jdbc.sql("""
                SELECT quantity, selected FROM buyer_cart_item WHERE buyer_id = :buyer AND product_id = :product AND sku_id = :sku
                """).param("buyer", buyerId).param("product", productId).param("sku", skuId)
                .query(ItemState.class).optional().orElse(new ItemState(0, false));
        if (existing.quantity() == quantity && existing.selected() == selected) return;
        if (quantity > existing.quantity()) {
            var sku = products.visibleSku(productId, skuId)
                    .orElseThrow(() -> conflict("商品已下架或规格已调整，请重新选择"));
            if (quantity > sku.stock()) throw conflict("库存不足，仅剩 " + sku.stock() + " 件");
            jdbc.sql("""
                    INSERT INTO buyer_cart_item (buyer_id, product_id, sku_id, title, sku_name, quantity, selected)
                    VALUES (:buyer, :product, :sku, :title, :name, :quantity, :selected)
                    ON DUPLICATE KEY UPDATE title = :title, sku_name = :name, quantity = :quantity, selected = :selected
                    """).param("buyer", buyerId).param("product", productId).param("sku", skuId)
                    .param("title", sku.title()).param("name", sku.name())
                    .param("quantity", quantity).param("selected", selected).update();
        } else {
            jdbc.sql("""
                    UPDATE buyer_cart_item SET quantity = :quantity, selected = :selected
                    WHERE buyer_id = :buyer AND product_id = :product AND sku_id = :sku
                    """).param("buyer", buyerId).param("product", productId).param("sku", skuId)
                    .param("quantity", quantity).param("selected", selected).update();
        }
        incrementVersion(buyerId);
    }

    @Transactional
    public void remove(long buyerId, long productId, long skuId, long version) {
        ensureVersion(lock(buyerId), version);
        int removed = jdbc.sql("""
                UPDATE buyer_cart_item SET quantity = 0, selected = FALSE
                WHERE buyer_id = :buyer AND product_id = :product AND sku_id = :sku AND quantity > 0
                """).param("buyer", buyerId).param("product", productId).param("sku", skuId).update();
        if (removed > 0) incrementVersion(buyerId);
    }

    @Transactional
    public void importLegacy(long buyerId, List<CartController.LegacyItem> items) {
        lock(buyerId);
        // Quantity zero keeps a removal from an earlier import or checkout.
        var known = new HashSet<>(jdbc.sql("SELECT product_id, sku_id FROM buyer_cart_item WHERE buyer_id = :buyer")
                .param("buyer", buyerId).query(LineKey.class).list());
        boolean changed = false;
        for (var item : items) {
            if (!known.add(new LineKey(item.productId(), item.skuId()))) continue;
            var sku = products.visibleSku(item.productId(), item.skuId()).orElse(null);
            if (sku != null) {
                importItem(buyerId, item, sku);
                changed = true;
            }
        }
        if (changed) incrementVersion(buyerId);
    }

    private void importItem(long buyerId, CartController.LegacyItem item, AvailableSku sku) {
        jdbc.sql("""
                INSERT INTO buyer_cart_item (buyer_id, product_id, sku_id, title, sku_name, quantity, selected)
                VALUES (:buyer, :product, :sku, :title, :name, :quantity, :selected)
                """).param("buyer", buyerId).param("product", item.productId()).param("sku", item.skuId())
                .param("title", sku.title()).param("name", sku.name())
                .param("quantity", item.quantity()).param("selected", item.selected()).update();
    }

    /** The buyer row also serializes cart checkout with edits from other devices. */
    public long lock(long buyerId) {
        return jdbc.sql("SELECT cart_version FROM app_account WHERE id = :buyer FOR UPDATE")
                .param("buyer", buyerId).query(Long.class).optional().orElseThrow(CartService::missingAccount);
    }

    public void verifyCheckout(long buyerId, long actual, long expected, List<Selection> requested) {
        ensureVersion(actual, expected);
        Set<Selection> selected = jdbc.sql("""
                SELECT product_id, sku_id, quantity FROM buyer_cart_item WHERE buyer_id = :buyer AND selected = TRUE AND quantity > 0
                """).param("buyer", buyerId).query(Selection.class).list().stream().collect(Collectors.toSet());
        if (selected.size() != requested.size() || !selected.equals(new HashSet<>(requested))) {
            throw conflict("购物车商品已更新，请返回购物车重新结算");
        }
    }

    public void clearPurchased(long buyerId) {
        jdbc.sql("""
                UPDATE buyer_cart_item SET quantity = 0, selected = FALSE WHERE buyer_id = :buyer AND selected = TRUE AND quantity > 0
                """).param("buyer", buyerId).update();
        incrementVersion(buyerId);
    }

    private void incrementVersion(long buyerId) {
        jdbc.sql("UPDATE app_account SET cart_version = cart_version + 1 WHERE id = :buyer")
                .param("buyer", buyerId).update();
    }

    private static void ensureVersion(long actual, long expected) {
        if (actual != expected) throw conflict("购物车已更新，请刷新后重试");
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException missingAccount() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录已失效，请重新登录");
    }

    public record Selection(long productId, long skuId, int quantity) {}
    private record LineKey(long productId, long skuId) {}
    private record ItemState(int quantity, boolean selected) {}
}
