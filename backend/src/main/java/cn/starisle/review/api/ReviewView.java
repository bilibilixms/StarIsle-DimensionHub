package cn.starisle.review.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReviewView(String id, String orderId, String itemKey, String shopId, String productId,
                         String productTitle, String variant, String author, int rating, String content,
                         List<String> images, String createdAt, Reply reply, boolean refunded) {
    public record Reply(String content, String createdAt) {}
}
