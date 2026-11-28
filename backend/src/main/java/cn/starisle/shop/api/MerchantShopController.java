package cn.starisle.shop.api;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.shared.api.ApiResponse;
import cn.starisle.shop.api.ShopService.ShopProfile;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MerchantShopController {
    private final ShopService shops;

    public MerchantShopController(ShopService shops) {
        this.shops = shops;
    }

    @PutMapping("/api/v1/merchant/shop")
    public ApiResponse<ShopProfile> update(@AuthenticationPrincipal CurrentAccount account,
                                           @Valid @RequestBody ShopUpdate update) {
        return ApiResponse.ok(shops.updateProfile(account.id(), update.name(), update.description()));
    }

    public record ShopUpdate(@NotBlank @Size(max = 20) String name,
                             @NotBlank @Size(max = 50) String description) {}
}
