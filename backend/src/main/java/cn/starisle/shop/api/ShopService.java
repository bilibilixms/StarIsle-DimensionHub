package cn.starisle.shop.api;

import cn.starisle.shared.api.PageResult;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ShopService {
    private final JdbcClient jdbc;

    public ShopService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void openPendingShop(long ownerId, String name) {
        jdbc.sql("INSERT INTO merchant_shop (name, owner_account_id) VALUES (:name, :owner)")
                .param("name", name).param("owner", ownerId).update();
    }

    public Optional<Shop> findOwnedShop(long ownerId) {
        return jdbc.sql("SELECT id, status FROM merchant_shop WHERE owner_account_id = :owner")
                .param("owner", ownerId).query(Shop.class).optional();
    }

    public Shop lockOwnedShop(long ownerId) {
        return jdbc.sql("SELECT id, status FROM merchant_shop WHERE owner_account_id = :owner FOR UPDATE")
                .param("owner", ownerId).query(Shop.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "尚未开通店铺"));
    }

    public Optional<ShopProfile> ownedProfile(long ownerId) {
        return jdbc.sql("SELECT id, name, description, status FROM merchant_shop WHERE owner_account_id = :owner")
                .param("owner", ownerId).query(this::mapProfile).optional();
    }

    @Transactional
    public ShopProfile updateProfile(long ownerId, String name, String description) {
        var shop = lockOwnedShop(ownerId);
        String displayName = name.strip();
        String introduction = description.strip();
        jdbc.sql("UPDATE merchant_shop SET name = :name, description = :description WHERE id = :id")
                .param("id", shop.id()).param("name", displayName).param("description", introduction).update();
        return new ShopProfile(Long.toString(shop.id()), displayName, introduction, shop.status());
    }

    public Optional<ShopProfile> lockProfile(long shopId) {
        return jdbc.sql("SELECT id, name, description, status FROM merchant_shop WHERE id = :id FOR UPDATE")
                .param("id", shopId).query(this::mapProfile).optional();
    }

    public List<ShopProfile> activeProfiles() {
        return jdbc.sql("SELECT id, name, description, status FROM merchant_shop WHERE status = 'ACTIVE' ORDER BY id")
                .query(this::mapProfile).list();
    }

    private ShopProfile mapProfile(java.sql.ResultSet row, int index) throws java.sql.SQLException {
        return new ShopProfile(row.getString("id"), row.getString("name"), row.getString("description"),
                row.getString("status"));
    }

    public record ShopProfile(String id, String name, String description, String status) {}

    @Transactional(readOnly = true)
    public PageResult<PendingShop> pendingShops(int page, int size) {
        long total = jdbc.sql("SELECT COUNT(*) FROM merchant_shop WHERE status = 'PENDING'")
                .query(Long.class).single();
        var items = jdbc.sql("""
                SELECT id, name FROM merchant_shop WHERE status = 'PENDING'
                ORDER BY id LIMIT :size OFFSET :offset
                """).param("size", size).param("offset", (long) (page - 1) * size)
                .query((row, index) -> new PendingShop(row.getString("id"), row.getString("name"))).list();
        return new PageResult<>(items, total, page, size);
    }

    @Transactional
    public void approve(long id) {
        var shop = jdbc.sql("SELECT id, status FROM merchant_shop WHERE id = :id FOR UPDATE")
                .param("id", id).query(Shop.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "店铺不存在"));
        if ("ACTIVE".equals(shop.status())) return;
        if (!"PENDING".equals(shop.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "当前店铺状态不可审核");
        }
        jdbc.sql("UPDATE merchant_shop SET status = 'ACTIVE' WHERE id = :id").param("id", id).update();
    }

    public record PendingShop(String id, String name) {}

    public record Shop(long id, String status) {
        public void requireActive() {
            if (!"ACTIVE".equals(status)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "店铺营业后方可上架商品");
            }
        }
    }
}
