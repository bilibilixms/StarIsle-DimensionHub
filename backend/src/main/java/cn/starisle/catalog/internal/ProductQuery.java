package cn.starisle.catalog.internal;

import cn.starisle.catalog.api.MerchantProduct;
import cn.starisle.catalog.api.ProductDetail;
import cn.starisle.catalog.api.ProductView;
import cn.starisle.catalog.api.ProductVisibility;
import cn.starisle.shared.api.PageResult;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class ProductQuery implements ProductVisibility {
    private static final String PRODUCTS_AND_SHOPS =
            " FROM catalog_product p JOIN merchant_shop s ON s.id = p.shop_id ";
    private static final String PUBLIC_STATUS = """
            WHERE p.status = 'PUBLISHED' AND s.status = 'ACTIVE'
            """;
    private static final String VISIBLE_PRODUCTS = PRODUCTS_AND_SHOPS + PUBLIC_STATUS;
    private static final String SEARCH = " AND (:q = '' OR LOCATE(:q, p.title) > 0) ";
    private static final String DETAIL_COLUMNS = """
            SELECT p.id, p.shop_id, s.name AS shop_name, p.title, p.subtitle, p.description,
                   p.category, p.tags, p.images, p.price, p.stock, p.sold, p.cover_url, p.video_id, p.status,
                   p.management_version
            """;
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public ProductQuery(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
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
        return loadSkus(List.of(row)).getFirst();
    }

    @Override
    public List<Long> visibleIds(Set<Long> productIds) {
        if (productIds.isEmpty()) return List.of();
        return jdbc.sql("SELECT p.id " + VISIBLE_PRODUCTS + " AND p.id IN (:ids) ORDER BY p.id")
                .param("ids", productIds).query(Long.class).list();
    }

    @Override
    public Optional<AvailableSku> visibleSku(long productId, long skuId) {
        return jdbc.sql("SELECT p.title, sk.name, sk.stock " + PRODUCTS_AND_SHOPS
                + "JOIN catalog_sku sk ON sk.product_id = p.id " + PUBLIC_STATUS
                + " AND p.id = :product AND sk.id = :sku").param("product", productId).param("sku", skuId)
                .query(AvailableSku.class).optional();
    }

    ProductDetail ownedDetail(long productId, long shopId) {
        var row = jdbc.sql(DETAIL_COLUMNS + """
                FROM catalog_product p JOIN merchant_shop s ON s.id = p.shop_id
                WHERE p.id = :id AND p.shop_id = :shopId
                """).param("id", productId).param("shopId", shopId)
                .query(this::mapDetail).optional().orElseThrow(ProductQuery::notFound);
        return loadSkus(List.of(row)).getFirst();
    }

    public List<ProductDetail> marketplace(Long shopId) {
        var query = shopId == null
                ? jdbc.sql(DETAIL_COLUMNS + VISIBLE_PRODUCTS + " ORDER BY p.id DESC")
                : jdbc.sql(DETAIL_COLUMNS + """
                        FROM catalog_product p JOIN merchant_shop s ON s.id = p.shop_id
                        WHERE p.shop_id = :shopId AND p.status <> 'ARCHIVED' ORDER BY p.id DESC
                        """).param("shopId", shopId);
        return loadSkus(query.query(this::mapDetail).list());
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
                rs.getString("title"), rs.getString("subtitle"), rs.getString("description"), rs.getString("category"),
                textList(rs.getString("tags")), textList(rs.getString("images")), rs.getBigDecimal("price").toPlainString(),
                rs.getInt("stock"), rs.getInt("sold"), rs.getString("cover_url"),
                ProductVideos.url(rs.getString("video_id")), rs.getString("status"),
                rs.getLong("management_version"), List.of());
    }

    private List<ProductDetail> loadSkus(List<ProductDetail> products) {
        if (products.isEmpty()) return products;
        var ids = products.stream().map(product -> Long.parseLong(product.id())).toList();
        var skus = jdbc.sql("""
                SELECT id, product_id, name, price, stock, sold FROM catalog_sku WHERE product_id IN (:ids) ORDER BY id
                """).param("ids", ids).query((rs, row) -> new ProductSku(rs.getString("product_id"),
                        new ProductDetail.Sku(rs.getString("id"), rs.getString("name"),
                                rs.getBigDecimal("price").toPlainString(), rs.getInt("stock"), rs.getInt("sold"))))
                .list().stream().collect(Collectors.groupingBy(ProductSku::productId,
                        Collectors.mapping(ProductSku::sku, Collectors.toList())));
        return products.stream().map(product -> product.withSkus(skus.getOrDefault(product.id(), List.of()))).toList();
    }

    private List<String> textList(String value) {
        return value == null ? List.of() : List.of(json.readValue(value, String[].class));
    }

    private record ProductSku(String productId, ProductDetail.Sku sku) {}

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "商品不存在或不可访问");
    }
}
