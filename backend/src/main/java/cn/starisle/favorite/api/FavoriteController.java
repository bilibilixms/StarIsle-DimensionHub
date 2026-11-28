package cn.starisle.favorite.api;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/favorites")
public class FavoriteController {
    private final FavoriteService favorites;

    public FavoriteController(FavoriteService favorites) {
        this.favorites = favorites;
    }

    @PutMapping("/{productId}")
    public ApiResponse<Void> add(@AuthenticationPrincipal CurrentAccount buyer, @PathVariable @Positive long productId) {
        favorites.add(buyer.id(), productId);
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/{productId}")
    public ApiResponse<Void> remove(@AuthenticationPrincipal CurrentAccount buyer, @PathVariable @Positive long productId) {
        favorites.remove(buyer.id(), productId);
        return ApiResponse.ok(null);
    }

    @PostMapping("/import")
    public ApiResponse<Void> importLegacy(@AuthenticationPrincipal CurrentAccount buyer, @Valid @RequestBody LegacyFavorites form) {
        try {
            var ids = form.productIds().stream().map(Long::valueOf).collect(Collectors.toSet());
            favorites.importLegacy(buyer.id(), ids);
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "商品编号无效", exception);
        }
        return ApiResponse.ok(null);
    }

    public record LegacyFavorites(
            @NotNull @Size(max = 100) List<@NotNull @Pattern(regexp = "[1-9][0-9]{0,18}") String> productIds) {}
}
