package cn.starisle.cart.api;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/cart")
public class CartController {
    private final CartService cart;

    public CartController(CartService cart) {
        this.cart = cart;
    }

    @GetMapping
    public ApiResponse<CartView> read(@AuthenticationPrincipal CurrentAccount buyer) {
        return ApiResponse.ok(cart.view(buyer.id()));
    }

    @PutMapping("/items/{productId}/{skuId}")
    public ApiResponse<Void> save(@AuthenticationPrincipal CurrentAccount buyer,
                                  @PathVariable @Positive long productId, @PathVariable @Positive long skuId,
                                  @Valid @RequestBody CartUpdate update) {
        cart.save(buyer.id(), productId, skuId, update.quantity(), update.selected(), update.version());
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/items/{productId}/{skuId}")
    public ApiResponse<Void> remove(@AuthenticationPrincipal CurrentAccount buyer,
                                    @PathVariable @Positive long productId, @PathVariable @Positive long skuId,
                                    @RequestParam @PositiveOrZero long version) {
        cart.remove(buyer.id(), productId, skuId, version);
        return ApiResponse.ok(null);
    }

    @PostMapping("/import")
    public ApiResponse<Void> importLegacy(@AuthenticationPrincipal CurrentAccount buyer, @Valid @RequestBody LegacyCart legacy) {
        cart.importLegacy(buyer.id(), legacy.items());
        return ApiResponse.ok(null);
    }

    public record CartUpdate(@NotNull @Positive @Max(999_999) Integer quantity, @NotNull Boolean selected,
                             @NotNull @PositiveOrZero Long version) {}

    public record LegacyCart(@NotNull @Size(max = 100) List<@NotNull @Valid LegacyItem> items) {}

    public record LegacyItem(@NotNull @Positive Long productId, @NotNull @Positive Long skuId,
                             @NotNull @Positive @Max(999_999) Integer quantity, @NotNull Boolean selected) {}
}
