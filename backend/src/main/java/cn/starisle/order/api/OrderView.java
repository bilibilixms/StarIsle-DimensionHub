package cn.starisle.order.api;

import java.util.List;

public record OrderView(String id, String shopId, String shopName, String buyerId, String buyer,
                        Recipient recipient, long amount, String status, String carrier, String tracking,
                        String createdAt, String shippedAt, String completedAt, List<Item> items) {
    public OrderView withItems(List<Item> items) {
        return new OrderView(id, shopId, shopName, buyerId, buyer, recipient, amount, status, carrier, tracking,
                createdAt, shippedAt, completedAt, items);
    }

    public record Recipient(String name, String phone, String address) {}

    public record Item(String productId, String skuId, String title, String variant, String coverUrl,
                       long unitPrice, int quantity) {}
}
