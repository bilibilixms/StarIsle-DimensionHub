package cn.starisle.identity.internal;

import java.net.InetAddress;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("local-demo")
final class LocalDemoBootstrap implements ApplicationRunner {
    private final AccountService accounts;
    private final InetAddress address;

    LocalDemoBootstrap(AccountService accounts, @Value("${server.address}") InetAddress address) {
        this.accounts = accounts;
        this.address = address;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!address.isLoopbackAddress()) {
            throw new IllegalStateException("local-demo 配置需要监听本地环回地址");
        }
        accounts.provisionDemo("13800000000", "user", null);
        accounts.provisionDemo("13800000009", "merchant", "小小稻");
    }
}
