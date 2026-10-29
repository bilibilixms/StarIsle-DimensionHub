package cn.starisle.catalog.api;

import cn.starisle.catalog.internal.ProductQuery;
import cn.starisle.shared.api.ApiResponse;
import cn.starisle.shared.api.PageResult;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProductController {
    private final ProductQuery products;

    public ProductController(ProductQuery products) {
        this.products = products;
    }

    @Operation(summary = "查询已上架商品", description = "只返回正常营业店铺的已上架商品；价格和 ID 使用字符串。")
    @GetMapping("/api/v1/products")
    public ApiResponse<PageResult<ProductView>> list(
            @RequestParam(defaultValue = "") @Size(max = 100) String q,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.ok(products.list(q, page, size));
    }
}
