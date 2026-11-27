package cn.starisle.identity.api;

import cn.starisle.identity.internal.AccountService;
import cn.starisle.identity.internal.AccountService.Session;
import cn.starisle.shared.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local-demo")
public class LocalDemoLoginController {
    private final AccountService accounts;

    public LocalDemoLoginController(AccountService accounts) {
        this.accounts = accounts;
    }

    @PostMapping("/api/v1/auth/quick-login")
    public ApiResponse<Session> login(@Valid @RequestBody Request request) {
        return ApiResponse.ok(accounts.quickLogin(request.role()));
    }

    public record Request(@NotNull @Pattern(regexp = "user|merchant") String role) {}
}
