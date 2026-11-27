package cn.starisle.order.api;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.order.api.OrderController.Recipient;
import cn.starisle.order.internal.RefundService;
import cn.starisle.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RefundController {
    private final RefundService refunds;

    public RefundController(RefundService refunds) {
        this.refunds = refunds;
    }

    @PostMapping("/api/v1/orders/{id}/refunds")
    public ApiResponse<RefundView> request(@AuthenticationPrincipal CurrentAccount buyer, @PathVariable @Positive long id,
                                           @RequestHeader("X-Idempotency-Key")
                                           @Pattern(regexp = "[A-Za-z0-9-]{8,100}") String operationKey,
                                           @Valid @RequestBody Application request) {
        return ApiResponse.ok(refunds.request(buyer.id(), id, operationKey, request.type(), request.reason().strip()));
    }

    @PostMapping("/api/v1/orders/{id}/refunds/{refundId}/cancel")
    public ApiResponse<RefundView> cancel(@AuthenticationPrincipal CurrentAccount buyer, @PathVariable @Positive long id,
                                          @PathVariable @Positive long refundId) {
        return ApiResponse.ok(refunds.cancel(buyer.id(), id, refundId));
    }

    @PostMapping("/api/v1/orders/{id}/refunds/{refundId}/shipment")
    public ApiResponse<RefundView> shipment(@AuthenticationPrincipal CurrentAccount buyer, @PathVariable @Positive long id,
                                            @PathVariable @Positive long refundId, @Valid @RequestBody Shipment request) {
        return ApiResponse.ok(refunds.returnShipment(buyer.id(), id, refundId,
                request.carrier().strip(), request.tracking().strip()));
    }

    @PostMapping("/api/v1/merchant/orders/{id}/refunds/{refundId}/decision")
    public ApiResponse<RefundView> decide(@AuthenticationPrincipal CurrentAccount merchant, @PathVariable @Positive long id,
                                          @PathVariable @Positive long refundId, @Valid @RequestBody Decision request) {
        return ApiResponse.ok(refunds.decide(merchant.id(), id, refundId, request.approve(), request.reply(), request.returnAddress()));
    }

    @PostMapping("/api/v1/merchant/orders/{id}/refunds/{refundId}/receipt")
    public ApiResponse<RefundView> receive(@AuthenticationPrincipal CurrentAccount merchant, @PathVariable @Positive long id,
                                           @PathVariable @Positive long refundId, @Valid @RequestBody Receipt request) {
        return ApiResponse.ok(refunds.receiveReturn(merchant.id(), id, refundId, request.restock()));
    }

    public record Application(@NotNull @Pattern(regexp = "REFUND_ONLY|RETURN_REFUND") String type,
                               @NotBlank @Size(max = 200) String reason) {}

    public record Decision(@NotNull Boolean approve, @Size(max = 200) String reply, @Valid Recipient returnAddress) {}

    public record Shipment(@NotBlank @Size(max = 30) String carrier,
                           @NotBlank @Size(max = 32) String tracking) {}

    public record Receipt(@NotNull Boolean restock) {}
}
