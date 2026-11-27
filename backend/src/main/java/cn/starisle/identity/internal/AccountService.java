package cn.starisle.identity.internal;

import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.shared.Sha256;
import cn.starisle.shop.api.ShopService;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Duration SESSION_DURATION = Duration.ofDays(7);
    private final JdbcClient jdbc;
    private final ShopService shops;
    private final PasswordEncoder passwords;
    private final String missingAccountHash;

    public AccountService(JdbcClient jdbc, ShopService shops, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.shops = shops;
        this.passwords = passwords;
        this.missingAccountHash = passwords.encode(newToken());
    }

    @Transactional
    public Session register(String phone, String password, String role, String shopName) {
        jdbc.sql("""
                INSERT INTO app_account (phone, password_hash) VALUES (:phone, :hash)
                ON DUPLICATE KEY UPDATE id = id
                """).param("phone", phone).param("hash", passwords.encode(password)).update();
        var account = accountByPhone(phone).orElseThrow();
        if (!passwords.matches(password, account.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "开通新身份需使用原密码");
        }
        if (account.demoAccount() || hasRole(account.id(), "admin")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "请使用其他账号注册");
        }
        if (hasRole(account.id(), role)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "此身份已注册，请直接登录");
        }
        addRole(account.id(), role);
        if ("merchant".equals(role)) {
            String name = shopName == null || shopName.isBlank() ? "星屿小店" + phone.substring(7) : shopName.strip();
            shops.openPendingShop(account.id(), name);
        }
        return issue(account, role);
    }

    @Transactional
    public Session login(String phone, String password, String role) {
        var account = accountByPhone(phone);
        String hash = account.map(Credentials::passwordHash).orElse(missingAccountHash);
        if (!passwords.matches(password, hash) || account.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "手机号或密码不正确");
        }
        var credentials = account.orElseThrow();
        if (!hasRole(credentials.id(), role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "该账号尚未开通此身份");
        }
        return issue(credentials, role);
    }

    @Transactional
    public void provisionAdmin(String phone, String password) {
        try {
            jdbc.sql("INSERT INTO app_account (phone, password_hash) VALUES (:phone, :hash)")
                    .param("phone", phone).param("hash", passwords.encode(password)).update();
        } catch (DuplicateKeyException exception) {
            var account = accountByPhone(phone).orElseThrow();
            if (!hasRole(account.id(), "admin") || !passwords.matches(password, account.passwordHash())) {
                throw new IllegalStateException("管理员配置与现有账号冲突");
            }
            return;
        }
        addRole(accountByPhone(phone).orElseThrow().id(), "admin");
    }

    @Transactional
    public void provisionDemo(String phone, String role, String shopName) {
        jdbc.sql("""
                INSERT INTO app_account (phone, password_hash, demo_account) VALUES (:phone, :hash, TRUE)
                ON DUPLICATE KEY UPDATE id = id
                """).param("phone", phone).param("hash", passwords.encode(newToken())).update();
        var account = accountByPhone(phone).orElseThrow();
        if (!account.demoAccount()) {
            throw new IllegalStateException("演示手机号已被普通账号使用");
        }
        if (hasRole(account.id(), role)) return;
        addRole(account.id(), role);
        if ("merchant".equals(role)) {
            shops.openPendingShop(account.id(), shopName);
            shops.approve(shops.findOwnedShop(account.id()).orElseThrow().id());
        }
    }

    @Transactional
    public Session quickLogin(String role) {
        if (!"user".equals(role) && !"merchant".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "不支持该演示身份");
        }
        String phone = "user".equals(role) ? "13800000000" : "13800000009";
        var account = accountByPhone(phone).filter(Credentials::demoAccount)
                .filter(value -> hasRole(value.id(), role))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "演示账号不可用"));
        return issue(account, role);
    }

    public Optional<CurrentAccount> authenticate(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) return Optional.empty();
        String token = authorization.substring(7);
        if (!TOKEN.matcher(token).matches()) return Optional.empty();
        return jdbc.sql("""
                SELECT account_id AS id, role FROM app_account_session
                WHERE token_digest = :token AND expires_at > CURRENT_TIMESTAMP(6)
                """).param("token", digest(token)).query(CurrentAccount.class).optional();
    }

    public void logout(String authorization) {
        jdbc.sql("DELETE FROM app_account_session WHERE token_digest = :token")
                .param("token", digest(authorization.substring(7))).update();
    }

    public String buyerName(long accountId) {
        String phone = jdbc.sql("SELECT phone FROM app_account WHERE id = :id")
                .param("id", accountId).query(String.class).single();
        return "星屿同学" + phone.substring(7);
    }

    public Session session(CurrentAccount current, String authorization) {
        String token = authorization.substring(7);
        var session = jdbc.sql("""
                SELECT a.id, a.phone, s.expires_at FROM app_account_session s
                JOIN app_account a ON a.id = s.account_id
                WHERE s.token_digest = :token AND s.expires_at > CURRENT_TIMESTAMP(6)
                """).param("token", digest(token))
                .query((row, index) -> sessionView(token, row.getTimestamp("expires_at").toInstant(),
                        current.role(), row.getLong("id"), row.getString("phone")))
                .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录已失效"));
        return session;
    }

    private Optional<Credentials> accountByPhone(String phone) {
        return jdbc.sql("SELECT id, phone, password_hash, demo_account FROM app_account WHERE phone = :phone")
                .param("phone", phone).query(Credentials.class).optional();
    }

    private boolean hasRole(long accountId, String role) {
        return jdbc.sql("SELECT role FROM app_account_role WHERE account_id = :account AND role = :role")
                .param("account", accountId).param("role", role).query(String.class).optional().isPresent();
    }

    private void addRole(long accountId, String role) {
        jdbc.sql("INSERT INTO app_account_role (account_id, role) VALUES (:account, :role)")
                .param("account", accountId).param("role", role).update();
    }

    private Session issue(Credentials account, String role) {
        String token = newToken();
        Instant expiresAt = Instant.now().plus(SESSION_DURATION);
        jdbc.sql("""
                INSERT INTO app_account_session (token_digest, account_id, role, expires_at)
                VALUES (:token, :account, :role, :expiresAt)
                """).param("token", digest(token)).param("account", account.id()).param("role", role)
                .param("expiresAt", Timestamp.from(expiresAt)).update();
        return sessionView(token, expiresAt, role, account.id(), account.phone());
    }

    private Session sessionView(String token, Instant expiresAt, String role, long accountId, String phone) {
        var shop = "merchant".equals(role) ? shops.findOwnedShop(accountId).orElse(null) : null;
        return new Session(token, expiresAt.toEpochMilli(), role, String.valueOf(accountId), phone,
                shop == null ? null : String.valueOf(shop.id()), shop == null ? null : shop.status());
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] digest(String token) {
        return Sha256.digest(token.getBytes(StandardCharsets.US_ASCII));
    }

    private record Credentials(long id, String phone, String passwordHash, boolean demoAccount) {}

    public record Session(String token, long expiresAt, String role, String accountId, String phone,
                          String shopId, String shopStatus) {}
}
