package cn.starisle.catalog.api;

public record MerchantProduct(String id, String title, String price, int stock, String coverUrl, String status) {}
