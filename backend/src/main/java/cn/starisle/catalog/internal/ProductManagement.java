package cn.starisle.catalog.internal;

import cn.starisle.catalog.api.MerchantProduct;
import cn.starisle.catalog.api.MerchantProductController.CreateProduct;
import cn.starisle.catalog.api.MerchantProductController.CreateSku;
import cn.starisle.catalog.api.ProductDetail;
import cn.starisle.shared.Sha256;
import cn.starisle.shared.api.PageResult;
import cn.starisle.shop.api.ShopService;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.sql.Types;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class ProductManagement {
    private final JdbcClient jdbc;
    private final ShopService shops;
    private final ProductQuery products;
    private final ObjectMapper json;

    public ProductManagement(JdbcClient jdbc, ShopService shops, ProductQuery products, ObjectMapper json) {
        this.jdbc = jdbc;
        this.shops = shops;
        this.products = products;
        this.json = json;
    }

    @Transactional
    public ProductDetail create(long ownerId, CreateProduct request, String operationKey) {
        var shop = shops.lockOwnedShop(ownerId);
        byte[] digest = operationKey == null ? null : Sha256.digest(json.writeValueAsBytes(request));
        if (operationKey != null) {
            var existing = jdbc.sql("""
                    SELECT id, creation_digest FROM catalog_product WHERE shop_id = :shop AND creation_key = :key
                    """).param("shop", shop.id()).param("key", operationKey).query(Creation.class).optional();
            if (existing.isPresent()) {
                var creation = existing.orElseThrow();
                if (!MessageDigest.isEqual(creation.creationDigest(), digest)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "该发布请求已用于其他商品");
                }
                return products.ownedDetail(creation.id(), shop.id());
            }
        }
        if (request.published()) shop.requireActive();
        var price = request.skus().stream().map(CreateSku::price).min(BigDecimal::compareTo).orElseThrow();
        int stock = request.skus().stream().mapToInt(CreateSku::stock).sum();
        var key = new GeneratedKeyHolder();
        jdbc.sql("""
                INSERT INTO catalog_product
                    (shop_id, title, subtitle, description, category, tags, images, cover_url, stock, price, status,
                     creation_key, creation_digest)
                VALUES (:shop, :title, :subtitle, :description, :category, :tags, :images, :cover, :stock, :price, :status,
                        :key, :digest)
                """).param("shop", shop.id()).param("title", request.title().strip())
                .param("subtitle", request.subtitle() == null ? "" : request.subtitle().strip())
                .param("description", request.description() == null ? "" : request.description().strip())
                .param("category", request.category() == null ? "周边" : request.category())
                .param("tags", json.writeValueAsString(request.tags() == null ? List.of() : request.tags()))
                .param("images", json.writeValueAsString(request.images() == null ? List.of() : request.images()))
                .param("cover", request.coverUrl(), Types.VARCHAR).param("stock", stock).param("price", price)
                .param("status", request.published() ? "PUBLISHED" : "DRAFT")
                .param("key", operationKey, Types.VARCHAR).param("digest", digest, Types.BINARY).update(key, "id");
        long productId = key.getKey().longValue();
        try {
            for (var sku : request.skus()) {
                jdbc.sql("INSERT INTO catalog_sku (product_id, name, price, stock) VALUES (:product, :name, :price, :stock)")
                        .param("product", productId).param("name", sku.name().strip())
                        .param("price", sku.price()).param("stock", sku.stock()).update();
            }
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "商品规格名称不能重复", exception);
        }
        return products.ownedDetail(productId, shop.id());
    }

    @Transactional(readOnly = true)
    public PageResult<MerchantProduct> list(long ownerId, int page, int size) {
        var shop = shops.findOwnedShop(ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "尚未开通店铺"));
        return products.ownedList(shop.id(), page, size);
    }

    @Transactional(readOnly = true)
    public ProductDetail detail(long ownerId, long productId) {
        var shop = shops.findOwnedShop(ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "尚未开通店铺"));
        return products.ownedDetail(productId, shop.id());
    }

    @Transactional
    public ProductDetail setPublished(long ownerId, long productId, boolean published) {
        var shop = shops.lockOwnedShop(ownerId);
        var current = products.ownedDetail(productId, shop.id());
        if (published) shop.requireActive();
        String status = published ? "PUBLISHED" : "DRAFT";
        if (status.equals(current.status())) return current;
        if ("ARCHIVED".equals(current.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "已归档商品不能修改上架状态");
        }
        jdbc.sql("UPDATE catalog_product SET status = :status WHERE id = :id AND shop_id = :shop")
                .param("status", status).param("id", productId).param("shop", shop.id()).update();
        return products.ownedDetail(productId, shop.id());
    }

    private record Creation(long id, byte[] creationDigest) {}
}
