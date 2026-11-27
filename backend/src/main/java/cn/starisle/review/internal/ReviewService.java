package cn.starisle.review.internal;

import cn.starisle.catalog.api.CatalogImages;
import cn.starisle.review.api.ReviewController.Submission;
import cn.starisle.review.api.ReviewView;
import cn.starisle.shared.Sha256;
import cn.starisle.shop.api.ShopService;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class ReviewService {
    private static final String VIEWS = """
            SELECT r.id, r.order_item_id, o.id AS order_id, o.buyer_id, o.shop_id, o.status AS order_status,
                   i.product_id, i.title, i.variant, r.author, r.rating, r.content, r.images, r.created_at,
                   r.reply_content, r.replied_at
            FROM product_review r
            JOIN market_order_item i ON i.id = r.order_item_id
            JOIN market_order o ON o.id = i.order_id
            """;
    private final JdbcClient jdbc;
    private final CatalogImages images;
    private final ShopService shops;
    private final ObjectMapper json;

    public ReviewService(JdbcClient jdbc, CatalogImages images, ShopService shops, ObjectMapper json) {
        this.jdbc = jdbc;
        this.images = images;
        this.shops = shops;
        this.json = json;
    }

    @Transactional
    public String submit(long buyerId, long orderId, long itemId, String operationKey, Submission request) {
        // Serialize with receipt and refund updates to bind eligibility to the committed order state.
        var order = jdbc.sql("""
                SELECT status, buyer_name FROM market_order WHERE id = :id AND buyer_id = :buyer FOR UPDATE
                """).param("id", orderId).param("buyer", buyerId).query(ReviewOrder.class).optional()
                .orElseThrow(() -> notFound("订单不存在或不可访问"));
        if (jdbc.sql("SELECT id FROM market_order_item WHERE id = :id AND order_id = :order")
                .param("id", itemId).param("order", orderId).query(Long.class).optional().isEmpty()) {
            throw notFound("该商品不在本订单中");
        }
        var existing = jdbc.sql("""
                SELECT id, operation_key, payload_digest FROM product_review WHERE order_item_id = :id
                """).param("id", itemId).query(SubmissionReceipt.class).optional();
        if (existing.isEmpty() && !"COMPLETED".equals(order.status())) {
            throw conflict("请确认收货且售后结束后再评价");
        }
        if (existing.isPresent() && !operationKey.equals(existing.orElseThrow().operationKey())) {
            throw conflict("该订单商品已评价，请勿重复提交");
        }
        var paths = images.normalizeReview(request.images(), buyerId);
        String content = request.content().strip();
        byte[] digest = Sha256.digest(json.writeValueAsBytes(new Submission(request.rating(), content, paths)));
        if (existing.isPresent()) {
            var receipt = existing.orElseThrow();
            if (!MessageDigest.isEqual(digest, receipt.payloadDigest())) {
                throw conflict("该评价请求已用于其他内容");
            }
            return Long.toString(receipt.id());
        }

        var key = new GeneratedKeyHolder();
        jdbc.sql("""
                INSERT INTO product_review (order_item_id, operation_key, payload_digest, author, rating, content, images)
                VALUES (:item, :key, :digest, :author, :rating, :content, :images)
                """).param("item", itemId).param("key", operationKey).param("digest", digest)
                .param("author", mask(order.buyerName())).param("rating", request.rating().intValueExact()).param("content", content)
                .param("images", json.writeValueAsString(paths)).update(key, "id");
        return key.getKey().toString();
    }

    @Transactional
    public void reply(long ownerId, long id, String operationKey, String content) {
        long shopId = shops.findOwnedShop(ownerId).orElseThrow(() -> notFound("评价不存在或不可访问")).id();
        var previous = jdbc.sql("""
                SELECT r.reply_content, r.reply_operation_key FROM product_review r
                JOIN market_order_item i ON i.id = r.order_item_id JOIN market_order o ON o.id = i.order_id
                WHERE r.id = :id AND o.shop_id = :shop FOR UPDATE OF r
                """).param("id", id).param("shop", shopId).query(ReplyReceipt.class).optional()
                .orElseThrow(() -> notFound("评价不存在或不可访问"));
        if (previous.replyContent() != null) {
            if (operationKey.equals(previous.replyOperationKey()) && content.equals(previous.replyContent())) return;
            throw conflict("这条评价已经回复");
        }
        jdbc.sql("""
                UPDATE product_review SET reply_content = :content, replied_at = CURRENT_TIMESTAMP(6),
                    reply_operation_key = :key WHERE id = :id
                """).param("id", id).param("content", content).param("key", operationKey).update();
    }

    public List<ReviewView> marketplace(Long buyerId, Long shopId) {
        if (shopId != null) {
            return jdbc.sql(VIEWS + " WHERE o.shop_id = :shop ORDER BY r.id DESC").param("shop", shopId)
                    .query((row, index) -> project(row, null)).list();
        }
        return jdbc.sql(VIEWS + """
                JOIN merchant_shop s ON s.id = o.shop_id
                LEFT JOIN catalog_product p ON p.id = i.product_id AND p.shop_id = o.shop_id
                WHERE (p.status = 'PUBLISHED' AND s.status = 'ACTIVE') OR o.buyer_id = :buyer
                ORDER BY r.id DESC
                """).param("buyer", buyerId, Types.BIGINT).query((row, index) -> project(row, buyerId)).list();
    }

    private ReviewView project(ResultSet row, Long buyerId) throws SQLException {
        boolean ownOrder = buyerId != null && buyerId == row.getLong("buyer_id");
        String reply = row.getString("reply_content");
        return new ReviewView(row.getString("id"), ownOrder ? row.getString("order_id") : null,
                ownOrder ? row.getString("order_item_id") : null, row.getString("shop_id"), row.getString("product_id"),
                row.getString("title"), row.getString("variant"), row.getString("author"), row.getInt("rating"),
                row.getString("content"), List.of(json.readValue(row.getString("images"), String[].class)),
                row.getTimestamp("created_at").toInstant().toString(),
                reply == null ? null : new ReviewView.Reply(reply, row.getTimestamp("replied_at").toInstant().toString()),
                "REFUNDED".equals(row.getString("order_status")));
    }

    private static String mask(String name) {
        if (name.isBlank()) return "用***户";
        int first = name.codePointAt(0);
        String last = name.length() == Character.charCount(first) ? "" : Character.toString(name.codePointBefore(name.length()));
        return Character.toString(first) + "***" + last;
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    private record ReviewOrder(String status, String buyerName) {}
    private record SubmissionReceipt(long id, String operationKey, byte[] payloadDigest) {}
    private record ReplyReceipt(String replyContent, String replyOperationKey) {}
}
