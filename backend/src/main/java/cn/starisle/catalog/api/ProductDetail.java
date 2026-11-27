package cn.starisle.catalog.api;

import java.util.List;

public record ProductDetail(String id, String shopId, String shopName, String title, String subtitle,
                            String description, String category, List<String> tags, List<String> images,
                            String price, int stock, int sold, String coverUrl, String videoUrl, String status,
                            long managementVersion, List<Sku> skus) {
    public ProductDetail withSkus(List<Sku> skus) {
        return new ProductDetail(id, shopId, shopName, title, subtitle, description, category, tags, images,
                price, stock, sold, coverUrl, videoUrl, status, managementVersion, skus);
    }

    public record Sku(String id, String name, String price, int stock, int sold) {}
}
