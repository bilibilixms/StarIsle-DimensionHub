package cn.starisle.favorite.api;

import cn.starisle.catalog.api.ProductVisibility;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FavoriteService {
    private final JdbcClient jdbc;
    private final ProductVisibility products;

    public FavoriteService(JdbcClient jdbc, ProductVisibility products) {
        this.jdbc = jdbc;
        this.products = products;
    }

    public Set<String> savedIds(long buyerId) {
        return Set.copyOf(jdbc.sql("""
                SELECT product_id FROM buyer_favorite WHERE buyer_id = :buyer AND is_favorite = TRUE
                """).param("buyer", buyerId).query((row, index) -> row.getString("product_id")).list());
    }

    @Transactional
    public void add(long buyerId, long productId) {
        if (products.visibleIds(Set.of(productId)).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "该商品当前不可收藏");
        }
        jdbc.sql("""
                INSERT INTO buyer_favorite (buyer_id, product_id, is_favorite)
                VALUES (:buyer, :product, TRUE) ON DUPLICATE KEY UPDATE is_favorite = TRUE
                """).param("buyer", buyerId).param("product", productId).update();
    }

    public void remove(long buyerId, long productId) {
        jdbc.sql("""
                UPDATE buyer_favorite SET is_favorite = FALSE WHERE buyer_id = :buyer AND product_id = :product
                """).param("buyer", buyerId).param("product", productId).update();
    }

    @Transactional
    public void importLegacy(long buyerId, Set<Long> productIds) {
        for (long productId : products.visibleIds(productIds)) {
            // Keep an explicit cancellation when a device imports older local favorites.
            jdbc.sql("""
                    INSERT INTO buyer_favorite (buyer_id, product_id, is_favorite)
                    VALUES (:buyer, :product, TRUE) ON DUPLICATE KEY UPDATE is_favorite = is_favorite
                    """).param("buyer", buyerId).param("product", productId).update();
        }
    }
}
