package cn.starisle.catalog.api;

import cn.starisle.catalog.internal.ProductManagement;
import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.shared.api.ApiResponse;
import cn.starisle.shared.api.PageResult;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
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
                                             @RequestHeader(value = "X-Idempotency-Key", required = false)
                                             @Pattern(regexp = "[A-Za-z0-9-]{8,100}") String operationKey,
                                             @Valid @RequestBody CreateProduct request) {
        return ApiResponse.ok(products.create(account.id(), request, operationKey));
    }

    @GetMapping("/{id}")
    public ApiResponse<ProductDetail> detail(@AuthenticationPrincipal CurrentAccount account,
                                             @PathVariable @Positive long id) {
        return ApiResponse.ok(products.detail(account.id(), id));
    }

    @PutMapping("/{id}")
    public ApiResponse<ProductDetail> edit(@AuthenticationPrincipal CurrentAccount account,
                                           @PathVariable @Positive long id,
                                           @RequestHeader(value = "X-Idempotency-Key", required = false)
                                           @Pattern(regexp = "[A-Za-z0-9-]{8,100}") String operationKey,
                                           @Valid @RequestBody EditProduct request) {
        return ApiResponse.ok(products.edit(account.id(), id, request, operationKey));
    }

    @RequestMapping(path = "/{id}/publication", method = {RequestMethod.PATCH, RequestMethod.PUT})
    public ApiResponse<ProductDetail> publication(@AuthenticationPrincipal CurrentAccount account,
                                                  @PathVariable @Positive long id,
                                                  @Valid @RequestBody Publication request) {
        return ApiResponse.ok(products.setPublished(account.id(), id, request.published()));
    }

    public record CreateProduct(@NotBlank @Size(max = 200) String title,
                                @Size(max = 120) String subtitle,
                                @Size(max = 2000) String description,
                                @Size(max = 1024) String coverUrl,
                                @Pattern(regexp = "周边|画作") String category,
                                @Size(max = 10) List<@NotBlank @Size(max = 24) String> tags,
                                @Size(max = 6) List<@NotBlank @Size(max = 1024) String> images,
                                @JsonInclude(JsonInclude.Include.NON_NULL) @Size(max = 1024) String videoUrl,
                                Boolean published,
                                @NotNull @Size(min = 1, max = 12) List<@NotNull @Valid CreateSku> skus) {}

    public record CreateSku(@NotBlank @Size(max = 48) String name,
                            @NotNull @PositiveOrZero @Digits(integer = 10, fraction = 2) BigDecimal price,
                            @NotNull @PositiveOrZero @Max(1_000_000) Integer stock) {}

    public record EditProduct(@NotNull @PositiveOrZero Long expectedVersion,
                              @NotBlank @Size(max = 200) String title,
                              @Size(max = 120) String subtitle,
                              @Size(max = 2000) String description,
                              @Size(max = 1024) String coverUrl,
                              @Pattern(regexp = "周边|画作") String category,
                              @Size(max = 10) List<@NotBlank @Size(max = 24) String> tags,
                              @Size(max = 6) List<@NotBlank @Size(max = 1024) String> images,
                              @JsonInclude(JsonInclude.Include.NON_NULL) @Size(max = 1024) String videoUrl,
                              @NotNull Boolean published,
                              @NotNull @Size(min = 1, max = 12) List<@NotNull @Valid EditSku> skus) {}

    public record EditSku(@Positive Long id, @NotBlank @Size(max = 48) String name,
                          @NotNull @PositiveOrZero @Digits(integer = 10, fraction = 2) BigDecimal price,
                          @PositiveOrZero @Max(1_000_000) Integer stock,
                          @PositiveOrZero @Max(1_000_000) Integer expectedStock) {}

    public record Publication(@NotNull Boolean published) {}
}
