package cn.starisle.order.internal;

import cn.starisle.order.api.AddressBook;
import cn.starisle.order.api.AddressController.AddressInput;
import cn.starisle.order.api.OrderController.Recipient;
import cn.starisle.shared.Sha256;
import java.security.MessageDigest;
import java.sql.Types;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
public class BuyerAddresses {
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public BuyerAddresses(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public AddressBook book(long buyerId) {
        long revision = jdbc.sql("SELECT address_book_version FROM app_account WHERE id = :buyer")
                .param("buyer", buyerId).query(Long.class).optional().orElseThrow(BuyerAddresses::missingAccount);
        var records = jdbc.sql("""
                SELECT id, name, phone, address, is_default FROM buyer_address WHERE buyer_id = :buyer ORDER BY id
                """).param("buyer", buyerId).query((row, index) -> new Entry(
                new AddressBook.Address(row.getString("id"), row.getString("name"), row.getString("phone"),
                        row.getString("address")), row.getBoolean("is_default"))).list();
        return new AddressBook(revision, records.stream().map(Entry::address).toList(),
                records.stream().filter(Entry::preferred).findFirst().map(entry -> entry.address().id()).orElse(null));
    }

    @Transactional
    public AddressBook.Change importLegacy(long buyerId, Recipient recipient) {
        var fields = clean(recipient);
        // Older devices can share a local default ID even after editing its contents independently.
        String key = "legacy-" + HexFormat.of().formatHex(Sha256.digest(json.writeValueAsBytes(fields)));
        return add(buyerId, new AddressInput(fields, false), key);
    }

    @Transactional
    public AddressBook.Change add(long buyerId, AddressInput input, String operationKey) {
        lockBook(buyerId);
        var recipient = clean(input.recipient());
        byte[] digest = Sha256.digest(json.writeValueAsBytes(new AddressInput(recipient, input.makeDefault())));
        var existing = jdbc.sql("""
                SELECT address_id, payload_digest FROM buyer_address_creation WHERE buyer_id = :buyer AND operation_key = :key
                """).param("buyer", buyerId).param("key", operationKey).query(Creation.class).optional();
        if (existing.isPresent()) {
            var creation = existing.orElseThrow();
            if (!MessageDigest.isEqual(digest, creation.payloadDigest())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "该地址保存请求已用于其他内容");
            }
            return new AddressBook.Change(book(buyerId), Long.toString(creation.addressId()));
        }
        boolean preferred = input.makeDefault() || defaultId(buyerId) == null;
        if (preferred) clearDefault(buyerId);
        var key = new GeneratedKeyHolder();
        jdbc.sql("""
                INSERT INTO buyer_address (buyer_id, name, phone, address, is_default)
                VALUES (:buyer, :name, :phone, :address, :preferred)
                """).param("buyer", buyerId).param("name", recipient.name()).param("phone", recipient.phone())
                .param("address", recipient.address()).param("preferred", preferred ? Boolean.TRUE : null, Types.BOOLEAN)
                .update(key, "id");
        long id = key.getKey().longValue();
        jdbc.sql("""
                INSERT INTO buyer_address_creation (buyer_id, operation_key, address_id, payload_digest)
                VALUES (:buyer, :key, :id, :digest)
                """).param("buyer", buyerId).param("key", operationKey).param("id", id).param("digest", digest).update();
        return new AddressBook.Change(updatedBook(buyerId), Long.toString(id));
    }

    @Transactional
    public AddressBook.Change update(long buyerId, long id, AddressInput input) {
        lockBook(buyerId);
        boolean wasDefault = requireAddress(buyerId, id);
        var recipient = clean(input.recipient());
        jdbc.sql("""
                UPDATE buyer_address SET name = :name, phone = :phone, address = :address
                WHERE buyer_id = :buyer AND id = :id
                """).param("buyer", buyerId).param("id", id).param("name", recipient.name())
                .param("phone", recipient.phone()).param("address", recipient.address()).update();
        if (input.makeDefault() && !wasDefault) replaceDefault(buyerId, id);
        if (!input.makeDefault() && wasDefault) {
            Long alternative = firstOther(buyerId, id);
            if (alternative != null) replaceDefault(buyerId, alternative);
        }
        return new AddressBook.Change(updatedBook(buyerId), Long.toString(id));
    }

    @Transactional
    public AddressBook setDefault(long buyerId, long id) {
        lockBook(buyerId);
        if (requireAddress(buyerId, id)) return book(buyerId);
        replaceDefault(buyerId, id);
        return updatedBook(buyerId);
    }

    @Transactional
    public AddressBook delete(long buyerId, long id) {
        lockBook(buyerId);
        boolean wasDefault = requireAddress(buyerId, id);
        jdbc.sql("DELETE FROM buyer_address WHERE buyer_id = :buyer AND id = :id")
                .param("buyer", buyerId).param("id", id).update();
        if (wasDefault) {
            Long next = firstOther(buyerId, id);
            if (next != null) replaceDefault(buyerId, next);
        }
        return updatedBook(buyerId);
    }

    private void lockBook(long buyerId) {
        jdbc.sql("SELECT id FROM app_account WHERE id = :buyer FOR UPDATE")
                .param("buyer", buyerId).query(Long.class).optional().orElseThrow(BuyerAddresses::missingAccount);
    }

    private AddressBook updatedBook(long buyerId) {
        jdbc.sql("UPDATE app_account SET address_book_version = address_book_version + 1 WHERE id = :buyer")
                .param("buyer", buyerId).update();
        return book(buyerId);
    }

    private boolean requireAddress(long buyerId, long id) {
        return jdbc.sql("SELECT COALESCE(is_default, FALSE) FROM buyer_address WHERE buyer_id = :buyer AND id = :id")
                .param("buyer", buyerId).param("id", id).query(Boolean.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "收货地址不存在"));
    }

    private Long defaultId(long buyerId) {
        return jdbc.sql("SELECT id FROM buyer_address WHERE buyer_id = :buyer AND is_default = TRUE")
                .param("buyer", buyerId).query(Long.class).optional().orElse(null);
    }

    private Long firstOther(long buyerId, long id) {
        return jdbc.sql("SELECT id FROM buyer_address WHERE buyer_id = :buyer AND id <> :id ORDER BY id LIMIT 1")
                .param("buyer", buyerId).param("id", id).query(Long.class).optional().orElse(null);
    }

    private void replaceDefault(long buyerId, long id) {
        clearDefault(buyerId);
        jdbc.sql("UPDATE buyer_address SET is_default = TRUE WHERE buyer_id = :buyer AND id = :id")
                .param("buyer", buyerId).param("id", id).update();
    }

    private void clearDefault(long buyerId) {
        jdbc.sql("UPDATE buyer_address SET is_default = NULL WHERE buyer_id = :buyer AND is_default = TRUE")
                .param("buyer", buyerId).update();
    }

    private static Recipient clean(Recipient recipient) {
        return new Recipient(recipient.name().strip(), recipient.phone(), recipient.address().strip());
    }

    private static ResponseStatusException missingAccount() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录已失效，请重新登录");
    }

    private record Entry(AddressBook.Address address, boolean preferred) {}
    private record Creation(long addressId, byte[] payloadDigest) {}
}
