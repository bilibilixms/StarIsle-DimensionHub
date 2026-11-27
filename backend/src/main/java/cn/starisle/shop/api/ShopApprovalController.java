package cn.starisle.shop.api;

import cn.starisle.shared.api.ApiResponse;
import cn.starisle.shared.api.PageResult;
import cn.starisle.shop.api.ShopService.PendingShop;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/shops")
public class ShopApprovalController {
    private final ShopService shops;

    public ShopApprovalController(ShopService shops) {
        this.shops = shops;
    }

    @GetMapping("/pending")
    public ApiResponse<PageResult<PendingShop>> pending(@RequestParam(defaultValue = "1") @Min(1) int page,
                                                       @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.ok(shops.pendingShops(page, size));
    }

    @PostMapping("/{id}/approve")
    public ApiResponse<Void> approve(@PathVariable @Positive long id) {
        shops.approve(id);
        return ApiResponse.ok(null);
    }
}
