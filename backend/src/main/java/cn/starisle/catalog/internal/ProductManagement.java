package cn.starisle.catalog.internal;

import cn.starisle.catalog.api.MerchantProduct;
import cn.starisle.catalog.api.MerchantProductController.CreateProduct;
import cn.starisle.catalog.api.MerchantProductController.CreateSku;
import cn.starisle.catalog.api.MerchantProductController.EditProduct;
import cn.starisle.catalog.api.MerchantProductController.EditSku;
import cn.starisle.catalog.api.ProductDetail;
import cn.starisle.shared.Sha256;
import cn.starisle.shared.api.PageResult;
import cn.starisle.shop.api.ShopService;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
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
    private final ProductImages images;
    private final ObjectMapper json;

    public ProductManagement(JdbcClient jdbc, ShopService shops, ProductQuery products, ProductImages images,
                             ObjectMapper json) {
        this.jdbc = jdbc;
        this.shops = shops;
        this.products = products;
        this.images = images;
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
        boolean publish = Boolean.TRUE.equals(request.published());
        if (publish) shop.requireActive();
        var gallery = gallery(shop.id(), request.images(), request.coverUrl());
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
                .param("images", json.writeValueAsString(gallery.images()))
                .param("cover", gallery.cover(), Types.VARCHAR).param("stock", stock).param("price", price)
                .param("status", publish ? "PUBLISHED" : "DRAFT")
                .param("key", operationKey, Types.VARCHAR).param("digest", digest, Types.BINARY).update(key, "id");
        long productId = key.getKey().longValue();
        insertSkus(productId, request.skus().stream()
                .map(sku -> new SavedSku(null, sku.name(), sku.price(), sku.stock(), 0)).toList());
        return products.ownedDetail(productId, shop.id());
    }

    @Transactional
    public ProductDetail edit(long ownerId, long productId, EditProduct request, String operationKey) {
        // Checkout uses the same shop lock before taking product or SKU locks.
        var shop = shops.lockOwnedShop(ownerId);
        var current = products.ownedDetail(productId, shop.id());
        byte[] digest = operationKey == null ? null : Sha256.digest(json.writeValueAsBytes(request));
        if (operationKey != null) {
            var previousEdit = jdbc.sql("SELECT last_edit_key, last_edit_digest FROM catalog_product WHERE id = :id")
                    .param("id", productId).query(EditReceipt.class).single();
            if (operationKey.equals(previousEdit.lastEditKey())) {
                if (!MessageDigest.isEqual(previousEdit.lastEditDigest(), digest)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "该编辑请求已用于其他改动");
                }
                return current;
            }
        }
        if ("ARCHIVED".equals(current.status()) || request.expectedVersion() != current.managementVersion()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "商品资料已变化，请重新打开编辑");
        }
        if (request.published()) shop.requireActive();
        var gallery = gallery(shop.id(), request.images(), request.coverUrl());
        var skus = editedSkus(current, request.skus());
        var price = skus.stream().map(SavedSku::price).min(BigDecimal::compareTo).orElseThrow();
        int stock = skus.stream().mapToInt(SavedSku::stock).sum();

        // Existing SKU IDs and sales are carried forward, including when two SKU names swap.
        jdbc.sql("DELETE FROM catalog_sku WHERE product_id = :id").param("id", productId).update();
        insertSkus(productId, skus);
        jdbc.sql("""
                UPDATE catalog_product SET title = :title, subtitle = :subtitle, description = :description,
                    category = :category, tags = :tags, images = :images, cover_url = :cover, price = :price,
                    stock = :stock, status = :status, management_version = management_version + 1,
                    last_edit_key = :key, last_edit_digest = :digest
                WHERE id = :id
                """).param("id", productId).param("title", request.title().strip())
                .param("subtitle", request.subtitle() == null ? "" : request.subtitle().strip())
                .param("description", request.description() == null ? "" : request.description().strip())
                .param("category", request.category() == null ? "周边" : request.category())
                .param("tags", json.writeValueAsString(request.tags() == null ? List.of() : request.tags()))
                .param("images", json.writeValueAsString(gallery.images())).param("cover", gallery.cover(), Types.VARCHAR)
                .param("price", price).param("stock", stock).param("status", request.published() ? "PUBLISHED" : "DRAFT")
                .param("key", operationKey, Types.VARCHAR).param("digest", digest, Types.BINARY).update();
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
        jdbc.sql("""
                UPDATE catalog_product SET status = :status, management_version = management_version + 1
                WHERE id = :id AND shop_id = :shop
                """)
                .param("status", status).param("id", productId).param("shop", shop.id()).update();
        return products.ownedDetail(productId, shop.id());
    }

    private List<SavedSku> editedSkus(ProductDetail current, List<EditSku> changes) {
        var remaining = new HashMap<Long, ProductDetail.Sku>();
        for (var sku : current.skus()) remaining.put(Long.parseLong(sku.id()), sku);
        var result = new ArrayList<SavedSku>();
        for (var change : changes) {
            if (change.id() == null) {
                if (change.stock() == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请填写新规格的库存");
                }
                result.add(new SavedSku(null, change.name(), change.price(), change.stock(), 0));
                continue;
            }
            var old = remaining.remove(change.id());
            if (old == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "商品规格已变化，请重新打开编辑");
            }
            if (change.stock() != null && (change.expectedStock() == null || change.expectedStock() != old.stock())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "商品库存已变化，请重新打开编辑");
            }
            int stock = change.stock() == null ? old.stock() : change.stock();
            result.add(new SavedSku(change.id(), change.name(), change.price(), stock, old.sold()));
        }
        return result;
    }

    private void insertSkus(long productId, List<SavedSku> skus) {
        try {
            for (var sku : skus) {
                jdbc.sql("""
                        INSERT INTO catalog_sku (id, product_id, name, price, stock, sold)
                        VALUES (:id, :product, :name, :price, :stock, :sold)
                        """).param("id", sku.id(), Types.BIGINT).param("product", productId)
                        .param("name", sku.name().strip()).param("price", sku.price())
                        .param("stock", sku.stock()).param("sold", sku.sold()).update();
            }
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "商品规格名称不能重复", exception);
        }
    }

    private Gallery gallery(long shopId, List<String> requestedImages, String requestedCover) {
        var gallery = requestedImages == null ? List.<String>of()
                : requestedImages.stream().map(value -> images.normalize(value, shopId)).toList();
        String cover = images.normalize(requestedCover, shopId);
        return new Gallery(cover == null && !gallery.isEmpty() ? gallery.getFirst() : cover, gallery);
    }

    private record Creation(long id, byte[] creationDigest) {}

    private record EditReceipt(String lastEditKey, byte[] lastEditDigest) {}

    private record SavedSku(Long id, String name, BigDecimal price, int stock, int sold) {}

    private record Gallery(String cover, List<String> images) {}
}
