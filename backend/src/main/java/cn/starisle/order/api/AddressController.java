package cn.starisle.order.api;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.order.api.OrderController.Recipient;
import cn.starisle.order.internal.BuyerAddresses;
import cn.starisle.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders/addresses")
public class AddressController {
    private final BuyerAddresses addresses;

    public AddressController(BuyerAddresses addresses) {
        this.addresses = addresses;
    }

    @GetMapping
    public ApiResponse<AddressBook> list(@AuthenticationPrincipal CurrentAccount buyer) {
        return ApiResponse.ok(addresses.book(buyer.id()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<AddressBook.Change> add(@AuthenticationPrincipal CurrentAccount buyer,
                                               @RequestHeader("X-Idempotency-Key")
                                               @Pattern(regexp = "[A-Za-z0-9-]{8,100}") String key,
                                               @Valid @RequestBody AddressInput input) {
        return ApiResponse.ok(addresses.add(buyer.id(), input, key));
    }

    @PostMapping("/import")
    public ApiResponse<AddressBook.Change> importLegacy(@AuthenticationPrincipal CurrentAccount buyer,
                                                        @Valid @RequestBody Recipient recipient) {
        return ApiResponse.ok(addresses.importLegacy(buyer.id(), recipient));
    }

    @PutMapping("/{id}")
    public ApiResponse<AddressBook.Change> update(@AuthenticationPrincipal CurrentAccount buyer,
                                                  @PathVariable @Positive long id,
                                                  @Valid @RequestBody AddressInput input) {
        return ApiResponse.ok(addresses.update(buyer.id(), id, input));
    }

    @PutMapping("/{id}/default")
    public ApiResponse<AddressBook> setDefault(@AuthenticationPrincipal CurrentAccount buyer,
                                               @PathVariable @Positive long id) {
        return ApiResponse.ok(addresses.setDefault(buyer.id(), id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<AddressBook> delete(@AuthenticationPrincipal CurrentAccount buyer,
                                           @PathVariable @Positive long id) {
        return ApiResponse.ok(addresses.delete(buyer.id(), id));
    }

    public record AddressInput(@NotNull @Valid Recipient recipient, boolean makeDefault) {}
}
