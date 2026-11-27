package cn.starisle.order.api;

import java.util.List;

public record OrderView(String id, String shopId, String shopName, String buyerId, String buyer,
                        Recipient recipient, long amount, String status, String carrier, String tracking,
                        String createdAt, String shippedAt, String completedAt, List<Item> items,
                        RefundView refund, List<RefundView> refundHistory) {
    public OrderView withDetails(List<Item> items, List<RefundView> refunds) {
        return new OrderView(id, shopId, shopName, buyerId, buyer, recipient, amount, status, carrier, tracking,
                createdAt, shippedAt, completedAt, items,
                refunds.isEmpty() ? null : refunds.getLast(),
                refunds.isEmpty() ? List.of() : refunds.subList(0, refunds.size() - 1));
    }

    public record Recipient(String name, String phone, String address) {}

    public record Item(String productId, String skuId, String title, String variant, String coverUrl,
                       long unitPrice, int quantity) {}
}
