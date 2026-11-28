package cn.starisle.cart.api;

import java.util.List;

public record CartView(long version, List<Item> items) {
    public record Item(String productId, String skuId, String title, String variantName, int quantity, boolean selected) {}
}
