package cn.starisle.order.api;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.order.internal.OrderService;
import cn.starisle.shared.api.ApiResponse;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrderController {
    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    @PostMapping("/api/v1/orders/checkout")
    public ApiResponse<List<String>> checkout(@AuthenticationPrincipal CurrentAccount account,
                                             @RequestHeader("X-Idempotency-Key")
                                             @Pattern(regexp = "[A-Za-z0-9-]{8,100}") String operationKey,
                                             @Valid @RequestBody Checkout request) {
        return ApiResponse.ok(orders.checkout(account.id(), operationKey, request));
    }

    @PostMapping("/api/v1/merchant/orders/{id}/shipment")
    public ApiResponse<Void> ship(@AuthenticationPrincipal CurrentAccount account, @PathVariable @Positive long id,
                                  @Valid @RequestBody Shipment request) {
        orders.ship(account.id(), id, request.carrier().strip(), request.tracking().strip());
        return ApiResponse.ok(null);
    }

    @PostMapping("/api/v1/orders/{id}/receipt")
    public ApiResponse<Void> receive(@AuthenticationPrincipal CurrentAccount account, @PathVariable @Positive long id) {
        orders.receive(account.id(), id);
        return ApiResponse.ok(null);
    }

    public record Checkout(@NotNull @Size(min = 1, max = 100) List<@NotNull @Valid Line> items,
                           @NotNull @Valid Recipient recipient,
                           @JsonInclude(JsonInclude.Include.NON_NULL) @PositiveOrZero Long cartVersion) {}

    public record Line(@NotNull @Positive Long productId, @NotNull @Positive Long skuId,
                       @NotNull @Positive @Max(999_999) Integer quantity,
                       @NotNull @PositiveOrZero @Max(999_999_999_999L) Long expectedPrice,
                       @Size(max = 48) String variantName) {}

    public record Recipient(@NotBlank @Size(max = 30) String name,
                            @NotNull @Pattern(regexp = "1[0-9]{10}") String phone,
                            @NotBlank @Size(max = 200) String address) {}

    public record Shipment(@NotBlank @Size(max = 40) String carrier,
                           @NotBlank @Size(max = 64) String tracking) {}
}
