package cn.starisle.marketplace.api;

import cn.starisle.catalog.api.ProductDetail;
import cn.starisle.catalog.internal.ProductQuery;
import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.order.api.AddressBook;
import cn.starisle.order.api.OrderView;
import cn.starisle.order.internal.BuyerAddresses;
import cn.starisle.order.internal.OrderService;
import cn.starisle.review.api.ReviewView;
import cn.starisle.review.internal.ReviewService;
import cn.starisle.shared.api.ApiResponse;
import cn.starisle.shop.api.ShopService;
import cn.starisle.shop.api.ShopService.ShopProfile;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class MarketplaceController {
    private final ProductQuery products;
    private final ShopService shops;
    private final OrderService orders;
    private final ReviewService reviews;
    private final BuyerAddresses addresses;

    public MarketplaceController(ProductQuery products, ShopService shops, OrderService orders, ReviewService reviews,
                                 BuyerAddresses addresses) {
        this.products = products;
        this.shops = shops;
        this.orders = orders;
        this.reviews = reviews;
        this.addresses = addresses;
    }

    @GetMapping("/api/v1/marketplace")
    @Transactional(readOnly = true)
    public ApiResponse<Snapshot> read(@AuthenticationPrincipal CurrentAccount account,
                                     @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        if (account == null && authorization != null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录已失效，请重新登录");
        }
        if (account != null && "merchant".equals(account.role())) {
            var shop = shops.ownedProfile(account.id())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "尚未开通店铺"));
            long shopId = Long.parseLong(shop.id());
            return ApiResponse.ok(new Snapshot(products.marketplace(shopId), List.of(shop), orders.marketplace(shopId, true),
                    reviews.marketplace(null, shopId), null));
        }
        Long buyerId = account != null && "user".equals(account.role()) ? account.id() : null;
        var purchases = buyerId == null ? List.<OrderView>of() : orders.marketplace(buyerId, false);
        return ApiResponse.ok(new Snapshot(products.marketplace(null), shops.activeProfiles(), purchases,
                reviews.marketplace(buyerId, null), buyerId == null ? null : addresses.book(buyerId)));
    }

    public record Snapshot(List<ProductDetail> products, List<ShopProfile> shops, List<OrderView> orders,
                           List<ReviewView> reviews,
                           @JsonInclude(JsonInclude.Include.NON_NULL) AddressBook addressBook) {}
}
