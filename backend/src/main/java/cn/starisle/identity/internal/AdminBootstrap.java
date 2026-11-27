package cn.starisle.identity.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
final class AdminBootstrap implements ApplicationRunner {
    private final AccountService accounts;
    private final String phone;
    private final String password;

    AdminBootstrap(AccountService accounts, @Value("${starisle.admin.phone}") String phone,
                   @Value("${starisle.admin.password}") String password) {
        this.accounts = accounts;
        this.phone = phone;
        this.password = password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (phone.isBlank() && password.isEmpty()) return;
        if (!phone.matches("1[0-9]{10}") || password.isBlank() || password.length() < 12 || password.length() > 128) {
            throw new IllegalStateException("管理员初始化需要合法手机号及 12–128 位密码");
        }
        accounts.provisionAdmin(phone, password);
    }
}
