package cn.starisle.catalog.internal;

import cn.starisle.catalog.api.ProductView;
import cn.starisle.shared.api.PageResult;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductQuery {
    private static final String VISIBLE_PRODUCTS = """
            FROM catalog_product p JOIN merchant_shop s ON s.id = p.shop_id
            WHERE p.status = 'PUBLISHED' AND s.status = 'ACTIVE'
              AND (:q = '' OR LOCATE(:q, p.title) > 0)
            """;
    private final JdbcClient jdbc;

    public ProductQuery(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public PageResult<ProductView> list(String keyword, int page, int size) {
        String q = keyword.strip();
        long total = jdbc.sql("SELECT COUNT(*) " + VISIBLE_PRODUCTS)
                .param("q", q).query(Long.class).single();
        var items = jdbc.sql("SELECT p.id, p.title, p.price, p.cover_url, s.name AS shop_name "
                        + VISIBLE_PRODUCTS + " ORDER BY p.id DESC LIMIT :size OFFSET :offset")
                .param("q", q).param("size", size).param("offset", (long) (page - 1) * size)
                .query((rs, row) -> new ProductView(rs.getString("id"), rs.getString("title"),
                        rs.getBigDecimal("price").toPlainString(), rs.getString("cover_url"),
                        rs.getString("shop_name")))
                .list();
        return new PageResult<>(items, total, page, size);
    }
}
