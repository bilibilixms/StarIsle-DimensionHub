package cn.starisle.catalog.api;

import cn.starisle.catalog.internal.ProductManagement;
import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.shared.api.ApiResponse;
import cn.starisle.shared.api.PageResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/merchant/products")
public class MerchantProductController {
    private final ProductManagement products;

    public MerchantProductController(ProductManagement products) {
        this.products = products;
    }

    @GetMapping
    public ApiResponse<PageResult<MerchantProduct>> list(@AuthenticationPrincipal CurrentAccount account,
                                                         @RequestParam(defaultValue = "1") @Min(1) int page,
                                                         @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.ok(products.list(account.id(), page, size));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ProductDetail> create(@AuthenticationPrincipal CurrentAccount account,
                                             @Valid @RequestBody CreateProduct request) {
        return ApiResponse.ok(products.create(account.id(), request));
    }

    @GetMapping("/{id}")
    public ApiResponse<ProductDetail> detail(@AuthenticationPrincipal CurrentAccount account,
                                             @PathVariable @Positive long id) {
        return ApiResponse.ok(products.detail(account.id(), id));
    }

    @PatchMapping("/{id}/publication")
    public ApiResponse<ProductDetail> publication(@AuthenticationPrincipal CurrentAccount account,
                                                  @PathVariable @Positive long id,
                                                  @Valid @RequestBody Publication request) {
        return ApiResponse.ok(products.setPublished(account.id(), id, request.published()));
    }

    public record CreateProduct(@NotBlank @Size(max = 200) String title,
                                @Size(max = 2000) String description,
                                @Size(max = 1024) String coverUrl,
                                boolean published,
                                @NotNull @Size(min = 1, max = 12) List<@NotNull @Valid CreateSku> skus) {}

    public record CreateSku(@NotBlank @Size(max = 48) String name,
                            @NotNull @PositiveOrZero @Digits(integer = 10, fraction = 2) BigDecimal price,
                            @NotNull @PositiveOrZero @Max(1_000_000) Integer stock) {}

    public record Publication(@NotNull Boolean published) {}
}
