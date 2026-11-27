package cn.starisle.catalog.api;

import java.util.List;

public record ProductDetail(String id, String shopId, String shopName, String title, String description,
                            String price, int stock, String coverUrl, String status, List<Sku> skus) {
    public record Sku(String id, String name, String price, int stock) {}
}
