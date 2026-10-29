package cn.starisle.catalog.api;

/** IDs and decimal prices travel as strings to preserve precision in JavaScript. */
public record ProductView(String id, String title, String price, String coverUrl, String shopName) {}
