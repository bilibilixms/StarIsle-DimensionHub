package cn.starisle.catalog.internal;

import cn.starisle.catalog.api.MerchantProduct;
import cn.starisle.catalog.api.ProductDetail;
import cn.starisle.catalog.api.ProductView;
import cn.starisle.shared.api.PageResult;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductQuery {
    private static final String VISIBLE_PRODUCTS = """
            FROM catalog_product p JOIN merchant_shop s ON s.id = p.shop_id
            WHERE p.status = 'PUBLISHED' AND s.status = 'ACTIVE'
            """;
    private static final String SEARCH = " AND (:q = '' OR LOCATE(:q, p.title) > 0) ";
    private static final String DETAIL_COLUMNS = """
            SELECT p.id, p.shop_id, s.name AS shop_name, p.title, p.description,
                   p.price, p.stock, p.cover_url, p.status
            """;
    private final JdbcClient jdbc;

    public ProductQuery(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public PageResult<ProductView> list(String keyword, int page, int size) {
        String q = keyword.strip();
        long total = jdbc.sql("SELECT COUNT(*) " + VISIBLE_PRODUCTS + SEARCH)
                .param("q", q).query(Long.class).single();
        var items = jdbc.sql("SELECT p.id, p.title, p.price, p.cover_url, s.name AS shop_name "
                        + VISIBLE_PRODUCTS + SEARCH + " ORDER BY p.id DESC LIMIT :size OFFSET :offset")
                .param("q", q).param("size", size).param("offset", (long) (page - 1) * size)
                .query((rs, row) -> new ProductView(rs.getString("id"), rs.getString("title"),
                        rs.getBigDecimal("price").toPlainString(), rs.getString("cover_url"),
                        rs.getString("shop_name")))
                .list();
        return new PageResult<>(items, total, page, size);
    }

    @Transactional(readOnly = true)
    public ProductDetail detail(long productId) {
        var row = jdbc.sql(DETAIL_COLUMNS + VISIBLE_PRODUCTS + " AND p.id = :id")
                .param("id", productId).query(this::mapDetail).optional().orElseThrow(ProductQuery::notFound);
        return loadSkus(row, productId);
    }

    ProductDetail ownedDetail(long productId, long shopId) {
        var row = jdbc.sql(DETAIL_COLUMNS + """
                FROM catalog_product p JOIN merchant_shop s ON s.id = p.shop_id
                WHERE p.id = :id AND p.shop_id = :shopId
                """).param("id", productId).param("shopId", shopId)
                .query(this::mapDetail).optional().orElseThrow(ProductQuery::notFound);
        return loadSkus(row, productId);
    }

    PageResult<MerchantProduct> ownedList(long shopId, int page, int size) {
        long total = jdbc.sql("SELECT COUNT(*) FROM catalog_product WHERE shop_id = :shopId")
                .param("shopId", shopId).query(Long.class).single();
        var items = jdbc.sql("""
                SELECT id, title, price, stock, cover_url, status FROM catalog_product
                WHERE shop_id = :shopId ORDER BY id DESC LIMIT :size OFFSET :offset
                """).param("shopId", shopId).param("size", size).param("offset", (long) (page - 1) * size)
                .query((rs, row) -> new MerchantProduct(rs.getString("id"), rs.getString("title"),
                        rs.getBigDecimal("price").toPlainString(), rs.getInt("stock"), rs.getString("cover_url"),
                        rs.getString("status"))).list();
        return new PageResult<>(items, total, page, size);
    }

    private ProductDetail mapDetail(ResultSet rs, int row) throws SQLException {
        return new ProductDetail(rs.getString("id"), rs.getString("shop_id"), rs.getString("shop_name"),
                rs.getString("title"), rs.getString("description"), rs.getBigDecimal("price").toPlainString(),
                rs.getInt("stock"), rs.getString("cover_url"), rs.getString("status"), null);
    }

    private ProductDetail loadSkus(ProductDetail product, long productId) {
        var skus = jdbc.sql("SELECT id, name, price, stock FROM catalog_sku WHERE product_id = :id ORDER BY id")
                .param("id", productId).query((rs, row) -> new ProductDetail.Sku(rs.getString("id"),
                        rs.getString("name"), rs.getBigDecimal("price").toPlainString(), rs.getInt("stock")))
                .list();
        return new ProductDetail(product.id(), product.shopId(), product.shopName(), product.title(),
                product.description(), product.price(), product.stock(), product.coverUrl(), product.status(), skus);
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "商品不存在或不可访问");
    }
}
