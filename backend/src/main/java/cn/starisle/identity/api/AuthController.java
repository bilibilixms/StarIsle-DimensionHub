package cn.starisle.identity.api;

import cn.starisle.identity.internal.AccountService;
import cn.starisle.identity.internal.AccountService.Session;
import cn.starisle.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AccountService accounts;

    public AuthController(AccountService accounts) {
        this.accounts = accounts;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<Session> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(accounts.register(request.phone(), request.password(), request.role(), request.shopName()));
    }

    @PostMapping("/login")
    public ApiResponse<Session> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(accounts.login(request.phone(), request.password(), request.role()));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        accounts.logout(authorization);
        return ApiResponse.ok(null);
    }

    public record RegisterRequest(@NotNull @Pattern(regexp = "1[0-9]{10}") String phone,
                                  @NotNull @Size(min = 6, max = 128) String password,
                                  @NotNull @Pattern(regexp = "user|merchant") String role,
                                  @Size(max = 100) String shopName) {}

    public record LoginRequest(@NotNull @Pattern(regexp = "1[0-9]{10}") String phone,
                               @NotNull @Size(min = 6, max = 128) String password,
                               @NotNull @Pattern(regexp = "user|merchant|admin") String role) {}
}
