package cn.starisle.review.api;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.review.internal.ReviewService;
import cn.starisle.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReviewController {
    private final ReviewService reviews;

    public ReviewController(ReviewService reviews) {
        this.reviews = reviews;
    }

    @PostMapping("/api/v1/orders/{orderId}/items/{itemId}/review")
    public ApiResponse<String> submit(@AuthenticationPrincipal CurrentAccount buyer,
                                     @PathVariable @Positive long orderId, @PathVariable @Positive long itemId,
                                     @RequestHeader("X-Idempotency-Key")
                                     @Pattern(regexp = "[A-Za-z0-9-]{8,100}") String operationKey,
                                     @Valid @RequestBody Submission request) {
        return ApiResponse.ok(reviews.submit(buyer.id(), orderId, itemId, operationKey, request));
    }

    @PostMapping("/api/v1/merchant/reviews/{id}/reply")
    public ApiResponse<Void> reply(@AuthenticationPrincipal CurrentAccount merchant, @PathVariable @Positive long id,
                                   @RequestHeader("X-Idempotency-Key")
                                   @Pattern(regexp = "[A-Za-z0-9-]{8,100}") String operationKey,
                                   @Valid @RequestBody Reply request) {
        reviews.reply(merchant.id(), id, operationKey, request.content().strip());
        return ApiResponse.ok(null);
    }

    public record Submission(@NotNull @Min(1) @Max(5) @Digits(integer = 1, fraction = 0) BigDecimal rating,
                             @NotBlank @Size(max = 500) String content,
                             @Size(max = 3) List<@NotBlank @Size(max = 1024) String> images) {}

    public record Reply(@NotBlank @Size(max = 500) String content) {}
}
