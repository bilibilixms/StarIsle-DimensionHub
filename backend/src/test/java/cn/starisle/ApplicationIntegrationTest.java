package cn.starisle;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.Executors;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import java.sql.SQLException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicationIntegrationTest {
    private static final String ADMIN_PHONE = "13800000099";
    private static final String ADMIN_PASSWORD = "integration-admin-password";
    @TempDir static Path imageDirectory;
    @Container
    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4");

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:8.2-alpine")
            .withExposedPorts(6379).withCommand("redis-server", "--requirepass", "integration-password");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("spring.data.redis.password", () -> "integration-password");
        registry.add("springdoc.api-docs.enabled", () -> true);
        registry.add("springdoc.swagger-ui.enabled", () -> true);
        registry.add("starisle.admin.phone", () -> ADMIN_PHONE);
        registry.add("starisle.admin.password", () -> ADMIN_PASSWORD);
        registry.add("starisle.catalog.images-directory", () -> imageDirectory.toString());
        registry.add("starisle.catalog.videos-directory", () -> imageDirectory.resolve("videos").toString());
    }

    @LocalServerPort int port;
    @Autowired JdbcClient jdbc;
    @Autowired StringRedisTemplate redis;
    @Autowired ObjectMapper json;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void seedIsolatedDatabase() {
        jdbc.sql("DELETE FROM market_order").update();
        jdbc.sql("DELETE FROM order_checkout").update();
        jdbc.sql("DELETE FROM catalog_product").update();
        jdbc.sql("DELETE FROM merchant_shop").update();
        jdbc.sql("DELETE FROM app_account_session").update();
        jdbc.sql("DELETE FROM app_account WHERE phone <> :admin").param("admin", ADMIN_PHONE).update();
        jdbc.sql("INSERT INTO merchant_shop(id,name,status) VALUES (1,'星屿小铺','ACTIVE'),(2,'停业店铺','DISABLED')").update();
        jdbc.sql("""
                INSERT INTO catalog_product(id,shop_id,title,price,stock,status) VALUES
                (9007199254740993,1,'星屿徽章',19.90,10,'PUBLISHED'),
                (2,1,'草稿徽章',9.90,10,'DRAFT'),
                (3,2,'隐藏徽章',29.90,10,'PUBLISHED'),
                (4,1,'星屿明信片',8.00,10,'PUBLISHED')
                """).update();
    }

    @Test
    void catalogFiltersVisibilityAndPreservesMoneyAndLargeIds() throws Exception {
        var response = get("/api/v1/products?q=" + java.net.URLEncoder.encode("徽章", java.nio.charset.StandardCharsets.UTF_8));
        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = json.readTree(response.body());
        assertThat(body.path("data").path("total").asLong()).isEqualTo(1);
        JsonNode product = body.path("data").path("items").get(0);
        assertThat(product.path("id").asString()).isEqualTo("9007199254740993");
        assertThat(product.path("price").asString()).isEqualTo("19.90");
        var page = json.readTree(get("/api/v1/products?page=2&size=1").body()).path("data");
        assertThat(page.path("total").asLong()).isEqualTo(2);
        assertThat(page.path("items").get(0).path("title").asString()).isEqualTo("星屿明信片");
        assertThat(json.readTree(get("/api/v1/products?q=%27%20OR%201%3D1").body())
                .path("data").path("total").asLong()).isZero();
    }

    @Test
    void rejectsInvalidPagingAndUnauthenticatedMerchantAccess() throws Exception {
        for (String query : new String[]{"page=0", "size=101", "page=abc", "q=" + "a".repeat(101)}) {
            var response = get("/api/v1/products?" + query);
            assertThat(response.statusCode()).as(query).isEqualTo(400);
            assertThat(json.readTree(response.body()).path("code").asInt()).isEqualTo(400);
        }
        assertThat(get("/api/v1/merchant/products").statusCode()).isEqualTo(401);
        assertThatThrownBy(() -> jdbc.sql("""
                INSERT INTO catalog_product(shop_id,title,price,stock) VALUES (1,'invalid',-1,1)
                """).update()).rootCause().isInstanceOfSatisfying(SQLException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(3819));
    }

    @Test
    void validatesDatabaseRedisHealthAndApiDocumentation() throws Exception {
        redis.opsForValue().set("integration:ping", "pong");
        assertThat(redis.opsForValue().get("integration:ping")).isEqualTo("pong");
        redis.delete("integration:ping");
        assertThat(json.readTree(get("/actuator/health").body()).path("status").asString()).isEqualTo("UP");
        var docs = get("/v3/api-docs");
        assertThat(docs.statusCode()).isEqualTo(200);
        assertThat(json.readTree(docs.body()).path("paths").has("/api/v1/products")).isTrue();
    }

    @Test
    void permitsOnlyConfiguredBrowserOrigins() throws Exception {
        var allowed = client.send(HttpRequest.newBuilder(uri("/api/v1/products"))
                .header("Origin", "http://localhost:5173").GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:5173");
        var denied = client.send(HttpRequest.newBuilder(uri("/api/v1/products"))
                .header("Origin", "https://untrusted.example").GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(denied.statusCode()).isEqualTo(403);
    }

    @Test
    void registersRolesWithOnePasswordAndRevokesSessionsOnLogout() throws Exception {
        assertThat(send("POST", "/api/v1/auth/quick-login", "{\"role\":\"user\"}", null).statusCode()).isEqualTo(401);
        String userForm = accountForm("13800000000", "六位测试密码", "user");
        var registration = send("POST", "/api/v1/auth/register", userForm, null);
        assertThat(registration.statusCode()).isEqualTo(201);
        var user = json.readTree(registration.body()).path("data");
        String userToken = user.path("token").asString();
        assertThat(userToken).matches("[A-Za-z0-9_-]{43}");
        assertThat(send("POST", "/api/v1/auth/register", userForm, null).statusCode()).isEqualTo(409);
        assertThat(send("POST", "/api/v1/auth/register",
                accountForm("13800000000", "wrong-password", "merchant"), null).statusCode()).isEqualTo(409);
        var merchant = send("POST", "/api/v1/auth/register",
                accountForm("13800000000", "六位测试密码", "merchant"), null);
        assertThat(merchant.statusCode()).isEqualTo(201);
        var account = json.readTree(merchant.body()).path("data");
        assertThat(account.path("accountId").asString()).isEqualTo(user.path("accountId").asString());
        assertThat(account.path("shopStatus").asString()).isEqualTo("PENDING");
        assertThat(send("POST", "/api/v1/auth/login",
                accountForm("13800000000", "wrong-password", "user"), null).statusCode()).isEqualTo(401);
        assertThat(send("POST", "/api/v1/auth/login", userForm, null).statusCode()).isEqualTo(200);
        assertThat(send("GET", "/api/v1/auth/session", null, userToken).statusCode()).isEqualTo(200);
        assertThat(jdbc.sql("SELECT password_hash FROM app_account WHERE phone = '13800000000'")
                .query(String.class).single())
                .doesNotContain("六位测试密码");
        assertThat(send("POST", "/api/v1/auth/logout", null, userToken).statusCode()).isEqualTo(200);
        assertThat(send("POST", "/api/v1/auth/logout", null, userToken).statusCode()).isEqualTo(401);
        assertThat(send("POST", "/api/v1/auth/logout", null, account.path("token").asString()).statusCode())
                .isEqualTo(200);
    }

    @Test
    void merchantPublishesSkusToPublicCatalogAndCanOnlyManageOwnedProducts() throws Exception {
        String merchantPhone = "13800000009";
        var merchant = register(merchantPhone, "merchant");
        var other = register("13800000008", "merchant");
        var user = register("13800000001", "user");
        String token = merchant.path("token").asString();
        String merchantProducts = "/api/v1/merchant/products";
        String productForm = """
                {"title":"星星挂件","description":"测试规格","published":true,"skus":[
                    {"name":"标准版","price":"19.90","stock":5},
                    {"name":"礼盒版","price":"29.90","stock":3}
                ]}
                """;
        assertThat(send("POST", merchantProducts, productForm, user.path("token").asString()).statusCode())
                .isEqualTo(403);
        assertThat(send("POST", merchantProducts, productForm, token).statusCode()).isEqualTo(403);

        var draft = send("POST", merchantProducts, productForm.replace("true", "false"), token);
        assertThat(draft.statusCode()).isEqualTo(201);
        var item = json.readTree(draft.body()).path("data");
        String id = item.path("id").asString();
        String publication = merchantProducts + "/" + id + "/publication";
        assertThat(item.path("price").asString()).isEqualTo("19.90");
        assertThat(item.path("stock").asInt()).isEqualTo(8);
        assertThat(item.path("skus").size()).isEqualTo(2);
        assertThat(get("/api/v1/products/" + id).statusCode()).isEqualTo(404);
        assertThat(json.readTree(send("GET", merchantProducts, null, token).body())
                .path("data").path("total").asInt()).isEqualTo(1);
        assertThat(json.readTree(send("GET", merchantProducts, null, other.path("token").asString()).body())
                .path("data").path("total").asInt()).isZero();

        String adminForm = accountForm(ADMIN_PHONE, ADMIN_PASSWORD, "admin");
        assertThat(send("POST", "/api/v1/auth/register", adminForm, null).statusCode()).isEqualTo(400);
        var admin = send("POST", "/api/v1/auth/login", adminForm, null);
        assertThat(admin.statusCode()).isEqualTo(200);
        String adminToken = json.readTree(admin.body()).path("data").path("token").asString();
        String approval = "/api/v1/admin/shops/" + merchant.path("shopId").asString() + "/approve";
        assertThat(send("POST", approval, null, token).statusCode()).isEqualTo(403);
        var pending = send("GET", "/api/v1/admin/shops/pending", null, adminToken);
        assertThat(pending.statusCode()).isEqualTo(200);
        assertThat(json.readTree(pending.body()).path("data").path("total").asInt()).isEqualTo(2);
        assertThat(send("POST", approval, null, adminToken).statusCode()).isEqualTo(200);
        String publish = "{\"published\":true}";
        assertThat(send("PATCH", publication, publish, other.path("token").asString()).statusCode())
                .isEqualTo(404);
        assertThat(send("PATCH", publication, publish, token).statusCode()).isEqualTo(200);
        assertThat(send("PATCH", publication, publish, token).statusCode()).isEqualTo(200);
        var published = get("/api/v1/products/" + id);
        assertThat(published.statusCode()).isEqualTo(200);
        assertThat(json.readTree(published.body()).path("data").path("skus").get(1).path("stock").asInt())
                .isEqualTo(3);
        var products = json.readTree(get("/api/v1/products").body()).path("data").path("items");
        assertThat(products.get(0).path("id").asString()).isEqualTo(id);

        var repeatedSku = send("POST", merchantProducts, productForm.replace("礼盒版", "标准版"), token);
        assertThat(repeatedSku.statusCode()).isEqualTo(409);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM catalog_product WHERE title = '星星挂件'")
                .query(Integer.class).single()).isEqualTo(1);

        assertThat(send("PATCH", publication, "{\"published\":false}", token).statusCode()).isEqualTo(200);
        assertThat(get("/api/v1/products/" + id).statusCode()).isEqualTo(404);
    }

    @Test
    void checkoutAtomicallySplitsByShopAndRetriesWithoutDuplicatingOrdersOrStock() throws Exception {
        var firstMerchant = register("13800000009", "merchant");
        var secondMerchant = register("13800000008", "merchant");
        String buyer = register("13800000001", "user").path("token").asString();
        String otherBuyer = register("13800000002", "user").path("token").asString();
        String admin = json.readTree(send("POST", "/api/v1/auth/login",
                accountForm(ADMIN_PHONE, ADMIN_PASSWORD, "admin"), null).body()).path("data").path("token").asString();
        var first = publish(firstMerchant, admin, "星星挂件");
        var second = publish(secondMerchant, admin, "月亮挂件");

        String request = checkoutForm(line(first, 1) + "," + line(first, 1) + "," + line(second, 1));
        String invalid = checkoutForm(line(first, 2) + "," + line(second, 4));
        assertThat(checkout(invalid, buyer, "overstock-01").statusCode()).isEqualTo(409);
        assertThat(stock(first)).isEqualTo(3);
        assertThat(stock(second)).isEqualTo(3);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM market_order").query(Integer.class).single()).isZero();

        JsonNode ids;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> checkout(request, buyer, "purchase-01"));
            var two = executor.submit(() -> checkout(request, buyer, "purchase-01"));
            var firstResponse = one.get();
            var repeated = two.get();
            assertThat(firstResponse.statusCode()).as(firstResponse.body()).isEqualTo(200);
            assertThat(repeated.statusCode()).as(repeated.body()).isEqualTo(200);
            ids = json.readTree(firstResponse.body()).path("data");
            assertThat(json.readTree(repeated.body()).path("data")).isEqualTo(ids);
        }
        assertThat(ids.size()).isEqualTo(2);
        assertThat(checkout(invalid, buyer, "purchase-01").statusCode()).isEqualTo(409);
        assertThat(stock(first)).isEqualTo(1);
        assertThat(stock(second)).isEqualTo(2);
        var buyerOrders = snapshot(buyer).path("orders");
        assertThat(buyerOrders.size()).isEqualTo(2);
        assertThat(buyerOrders.get(1).path("amount").asLong()).isEqualTo(3980);
        assertThat(buyerOrders.get(1).path("items").get(0).path("quantity").asInt()).isEqualTo(2);
        assertThat(snapshot(otherBuyer).path("orders").size()).isZero();
        assertThat(snapshot(null).path("orders").size()).isZero();
        assertThat(send("GET", "/api/v1/marketplace", null, "invalid-token").statusCode()).isEqualTo(401);

        String firstToken = firstMerchant.path("token").asString();
        String secondToken = secondMerchant.path("token").asString();
        String firstOrder = snapshot(firstToken).path("orders").get(0).path("id").asString();
        String receive = "/api/v1/orders/" + firstOrder + "/receipt";
        String ship = "/api/v1/merchant/orders/" + firstOrder + "/shipment";
        String logistics = "{\"carrier\":\"顺丰速运\",\"tracking\":\"SF20261127001\"}";
        assertThat(send("POST", receive, null, buyer).statusCode()).isEqualTo(409);
        assertThat(send("POST", ship, logistics, secondToken).statusCode()).isEqualTo(404);
        assertThat(send("POST", ship, logistics, firstToken).statusCode()).isEqualTo(200);
        assertThat(send("POST", ship, logistics, firstToken).statusCode()).isEqualTo(200);
        assertThat(send("POST", receive, null, otherBuyer).statusCode()).isEqualTo(404);
        assertThat(send("POST", receive, null, buyer).statusCode()).isEqualTo(200);
        assertThat(send("POST", receive, null, buyer).statusCode()).isEqualTo(200);
        assertThat(snapshot(firstToken).path("orders").get(0).path("status").asString()).isEqualTo("COMPLETED");

        String lastItem = checkoutForm(line(first, 1));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> checkout(lastItem, buyer, "last-one-01"));
            var two = executor.submit(() -> checkout(lastItem, otherBuyer, "last-one-02"));
            assertThat(List.of(one.get().statusCode(), two.get().statusCode()))
                    .containsExactlyInAnyOrder(200, 409);
        }
        assertThat(stock(first)).isZero();
    }

    @Test
    void merchantImagesAreDecodedAndOwnedByTheirShop() throws Exception {
        var merchant = register("13800000009", "merchant");
        var other = register("13800000008", "merchant");
        var buyer = register("13800000001", "user");
        String token = merchant.path("token").asString();

        byte[] invalid = "not an image".getBytes(StandardCharsets.UTF_8);
        assertThat(uploadImage(buyer.path("token").asString(), invalid).statusCode()).isEqualTo(403);
        assertThat(uploadImage(token, invalid).statusCode()).isEqualTo(400);
        assertThat(uploadImage(token, new byte[2 * 1024 * 1024 + 1]).statusCode()).isEqualTo(413);
        var png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2500, 500, BufferedImage.TYPE_INT_ARGB), "png", png);
        var uploaded = uploadImage(token, png.toByteArray());
        assertThat(uploaded.statusCode()).as(uploaded.body()).isEqualTo(201);
        String image = json.readTree(uploaded.body()).path("data").path("url").asString();
        var saved = client.send(HttpRequest.newBuilder(uri(image)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(saved.headers().firstValue("Content-Type")).contains("image/jpeg");
        var resized = ImageIO.read(new ByteArrayInputStream(saved.body()));
        assertThat(resized.getWidth()).isEqualTo(1600);
        assertThat(resized.getHeight()).isEqualTo(320);

        var webp = Base64.getDecoder().decode("UklGRjIAAABXRUJQVlA4ICYAAABwAQCdASoMAAkAAUAmJZACdAFAAAD+8Lpr+4P1B/EFS4MttnkAAA==");
        assertThat(uploadImage(token, webp).statusCode()).isEqualTo(201);
        assertThat(uploadImage(token, saved.body()).statusCode()).isEqualTo(201);

        String draft = """
                {"title":"商品图片测试","images":["%s"],"skus":[{"name":"标准版","price":"19.90","stock":3}]}
                """.formatted(image);
        var otherDraft = send("POST", "/api/v1/merchant/products", draft, other.path("token").asString());
        assertThat(otherDraft.statusCode()).as(otherDraft.body()).isEqualTo(403);
        var ownDraft = send("POST", "/api/v1/merchant/products", draft, token);
        assertThat(ownDraft.statusCode()).as(ownDraft.body()).isEqualTo(201);
        assertThat(json.readTree(ownDraft.body()).path("data").path("coverUrl").asString()).isEqualTo(image);
    }

    @Test
    void productVideoIsValidatedShopScopedAndStreamedByByteRange() throws Exception {
        String token = register("13800000009", "merchant").path("token").asString();
        String other = register("13800000008", "merchant").path("token").asString();
        String buyer = register("13800000001", "user").path("token").asString();
        String upload = "/api/v1/merchant/product-videos";
        byte[] clip = Files.readAllBytes(Path.of("..", "tests", "fixtures", "product-demo.mp4"));
        assertThat(uploadMedia(upload, buyer, clip).statusCode()).isEqualTo(403);
        assertThat(uploadMedia(upload, token, new byte[12]).statusCode()).isEqualTo(400);
        var tooLong = ByteBuffer.wrap(clip.clone());
        int movieHeader = new String(clip, StandardCharsets.ISO_8859_1).indexOf("mvhd") + 4;
        assertThat(tooLong.get(movieHeader)).isEqualTo((byte) 1);
        tooLong.putLong(movieHeader + 24, 61L * tooLong.getInt(movieHeader + 20));
        assertThat(uploadMedia(upload, token, tooLong.array()).statusCode()).isEqualTo(400);

        var uploaded = uploadMedia(upload, token, clip);
        assertThat(uploaded.statusCode()).as(uploaded.body()).isEqualTo(201);
        String url = json.readTree(uploaded.body()).path("data").path("url").asString();
        var range = client.send(HttpRequest.newBuilder(uri(url)).header("Range", "bytes=0-15").GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(range.statusCode()).isEqualTo(206);
        assertThat(range.headers().firstValue("Content-Range")).contains("bytes 0-15/" + clip.length);
        assertThat(range.body()).containsExactly(Arrays.copyOf(clip, 16));

        String products = "/api/v1/merchant/products";
        String draft = """
                {"title":"商品视频测试","videoUrl":"%s","skus":[{"name":"标准版","price":"19.90","stock":3}]}
                """.formatted(url);
        assertThat(send("POST", products, draft, other).statusCode()).isEqualTo(403);
        var created = send("POST", products, draft, token);
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        var product = json.readTree(created.body()).path("data");
        assertThat(product.path("videoUrl").asString()).isEqualTo(url);
        String path = products + "/" + product.path("id").asString();
        String edit = """
                {"title":"商品视频测试","expectedVersion":%s,"published":false,
                 "skus":[{"id":"%s","name":"标准版","price":"19.90"}]%s}
                """;
        String sku = product.path("skus").get(0).path("id").asString();
        var preserved = send("PUT", path, edit.formatted(0, sku, ""), token);
        assertThat(preserved.statusCode()).as(preserved.body()).isEqualTo(200);
        assertThat(json.readTree(preserved.body()).path("data").path("videoUrl").asString()).isEqualTo(url);
        var removed = send("PUT", path, edit.formatted(1, sku, ",\"videoUrl\":\"\""), token);
        assertThat(removed.statusCode()).as(removed.body()).isEqualTo(200);
        assertThat(json.readTree(removed.body()).path("data").path("videoUrl").isNull()).isTrue();
    }

    @Test
    void addressBookIsPrivateAndKeepsOneDefaultWithoutChangingOrderSnapshots() throws Exception {
        var merchant = register("13800000009", "merchant");
        String seller = merchant.path("token").asString();
        String buyer = register("13800000001", "user").path("token").asString();
        String other = register("13800000002", "user").path("token").asString();
        String path = "/api/v1/orders/addresses";
        assertThat(get(path).statusCode()).isEqualTo(401);
        assertThat(send("GET", path, null, seller).statusCode()).isEqualTo(403);
        assertThat(snapshot(null).has("addressBook")).isFalse();
        assertThat(snapshot(seller).has("addressBook")).isFalse();

        String address = """
                {"recipient":{"name":"小星","phone":"13800000001","address":"上海市 模拟路 1 号"},"makeDefault":false}
                """;
        var first = send("POST", path, address, buyer, "address-one");
        assertThat(first.statusCode()).as(first.body()).isEqualTo(201);
        String firstId = json.readTree(first.body()).path("data").path("savedAddressId").asString();
        assertThat(snapshot(buyer).path("addressBook").path("defaultAddressId").asString()).isEqualTo(firstId);
        assertThat(send("POST", path, address, buyer, "address-one").body()).isEqualTo(first.body());
        String alternate = address.replace("1 号", "2 号");
        assertThat(send("POST", path, alternate, buyer, "address-one").statusCode()).isEqualTo(409);
        assertThat(send("POST", path, address.replace("13800000001", "bad"), buyer, "bad-address").statusCode())
                .isEqualTo(400);
        var second = send("POST", path, alternate, buyer, "address-two");
        String secondId = json.readTree(second.body()).path("data").path("savedAddressId").asString();
        assertThat(second.statusCode()).as(second.body()).isEqualTo(201);
        assertThat(snapshot(other).path("addressBook").path("addresses").size()).isZero();
        assertThat(send("PUT", path + "/" + firstId, alternate, other).statusCode()).isEqualTo(404);
        assertThat(send("PUT", path + "/" + firstId + "/default", null, other).statusCode()).isEqualTo(404);
        assertThat(send("DELETE", path + "/" + firstId, null, other).statusCode()).isEqualTo(404);

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = executor.submit(() -> send("PUT", path + "/" + firstId + "/default", null, buyer));
            var b = executor.submit(() -> send("PUT", path + "/" + secondId + "/default", null, buyer));
            assertThat(a.get().statusCode()).isEqualTo(200);
            assertThat(b.get().statusCode()).isEqualTo(200);
        }
        assertThat(jdbc.sql("SELECT COUNT(*) FROM buyer_address WHERE is_default = TRUE").query(Integer.class).single())
                .isEqualTo(1);
        assertThat(send("PUT", path + "/" + secondId + "/default", null, buyer).statusCode()).isEqualTo(200);
        String admin = json.readTree(send("POST", "/api/v1/auth/login",
                accountForm(ADMIN_PHONE, ADMIN_PASSWORD, "admin"), null).body()).path("data").path("token").asString();
        var product = publish(merchant, admin, "地址快照测试");
        var ordered = checkout("""
                {"items":[%s],"recipient":{"name":"小星","phone":"13800000001","address":"上海市 模拟路 2 号"}}
                """.formatted(line(product, 1)), buyer, "address-order");
        assertThat(ordered.statusCode()).as(ordered.body()).isEqualTo(200);

        var edited = send("PUT", path + "/" + secondId, address.replace("1 号", "3 号").replace("false", "true"), buyer);
        assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
        var deleted = send("DELETE", path + "/" + secondId, null, buyer);
        assertThat(deleted.statusCode()).as(deleted.body()).isEqualTo(200);
        var latest = snapshot(buyer);
        assertThat(latest.path("addressBook").path("defaultAddressId").asString()).isEqualTo(firstId);
        assertThat(latest.path("orders").get(0).path("recipient").path("address").asString())
                .isEqualTo("上海市 模拟路 2 号");
        assertThat(send("POST", path, alternate, buyer, "address-two").statusCode()).isEqualTo(201);
        assertThat(snapshot(buyer).path("addressBook").path("addresses").size()).isEqualTo(1);

        String legacy = """
                {"name":"旧设备收货人","phone":"13800000001","address":"上海市 模拟路 4 号"}
                """;
        var imported = send("POST", path + "/import", legacy, buyer);
        assertThat(imported.statusCode()).as(imported.body()).isEqualTo(200);
        assertThat(send("POST", path + "/import", legacy, buyer).body()).isEqualTo(imported.body());
        assertThat(send("POST", path + "/import", legacy.replace("4 号", "5 号"), buyer).statusCode()).isEqualTo(200);
        var withLegacy = snapshot(buyer).path("addressBook");
        assertThat(withLegacy.path("addresses").size()).isEqualTo(3);
        assertThat(withLegacy.path("defaultAddressId").asString()).isEqualTo(firstId);
    }

    @Test
    void editingPricePreservesSkuIdentityAndSalesAndRejectsStaleInventory() throws Exception {
        var merchant = register("13800000009", "merchant");
        String token = merchant.path("token").asString();
        String buyer = register("13800000001", "user").path("token").asString();
        String admin = json.readTree(send("POST", "/api/v1/auth/login",
                accountForm(ADMIN_PHONE, ADMIN_PASSWORD, "admin"), null).body()).path("data").path("token").asString();
        var product = publish(merchant, admin, "调价测试");
        String id = product.path("id").asString();
        String sku = product.path("skus").get(0).path("id").asString();
        String path = "/api/v1/merchant/products/" + id;

        assertThat(checkout(checkoutForm(line(product, 1)), buyer, "before-edit-01").statusCode()).isEqualTo(200);
        String form = """
                {"title":"调价测试","expectedVersion":0,"published":true,
                  "skus":[{"id":"%s","name":"更新版","price":"26.50"%s}]}
                """;
        String stockEdit = form.formatted(sku, ",\"stock\":6,\"expectedStock\":3");
        assertThat(send("PUT", path, stockEdit, token).statusCode()).isEqualTo(409);
        assertThat(stock(product)).isEqualTo(2);

        String priceEdit = form.formatted(sku, "");
        var updated = send("PUT", path, priceEdit, token, "price-edit-01");
        assertThat(updated.statusCode()).as(updated.body()).isEqualTo(200);
        var current = json.readTree(updated.body()).path("data");
        assertThat(current.path("price").asString()).isEqualTo("26.50");
        assertThat(current.path("managementVersion").asInt()).isEqualTo(1);
        var variant = current.path("skus").get(0);
        assertThat(variant.path("id").asString()).isEqualTo(sku);
        assertThat(variant.path("stock").asInt()).isEqualTo(2);
        assertThat(variant.path("sold").asInt()).isEqualTo(1);
        var replay = send("PUT", path, priceEdit, token, "price-edit-01");
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(json.readTree(replay.body()).path("data").path("managementVersion").asInt()).isEqualTo(1);
        assertThat(send("PUT", path, priceEdit, token, "stale-edit-01").statusCode()).isEqualTo(409);

        var item = snapshot(buyer).path("orders").get(0).path("items").get(0);
        assertThat(item.path("unitPrice").asInt()).isEqualTo(1990);
        assertThat(item.path("variant").asString()).isEqualTo("标准版");
        assertThat(item.path("skuId").asString()).isEqualTo(sku);

        String restock = form.replace("\"expectedVersion\":0", "\"expectedVersion\":1")
                .formatted(sku, ",\"stock\":6,\"expectedStock\":2");
        var restocked = send("PUT", path, restock, token);
        assertThat(restocked.statusCode()).as(restocked.body()).isEqualTo(200);
        assertThat(stock(product)).isEqualTo(6);
    }

    @Test
    void refundBeforeShippingSupportsReapplicationAndRestocksAtMostOnce() throws Exception {
        var sample = refundableOrder();
        String refunds = sample.buyerPath() + "/refunds";
        String onlyRefund = "{\"type\":\"REFUND_ONLY\",\"reason\":\"款式选错\"}";
        var otherBuyer = register("13800000002", "user").path("token").asString();
        var otherMerchant = register("13800000008", "merchant").path("token").asString();
        assertThat(send("POST", refunds, onlyRefund, otherBuyer, "other-buyer-01").statusCode()).isEqualTo(404);
        assertThat(send("POST", refunds, onlyRefund.replace("REFUND_ONLY", "RETURN_REFUND"), sample.buyer(),
                "unshipped-return").statusCode()).isEqualTo(400);

        String first = applyRefund(sample, onlyRefund, "request-first");
        assertThat(applyRefund(sample, onlyRefund, "request-first")).isEqualTo(first);
        assertThat(send("POST", refunds, onlyRefund.replace("款式选错", "重复申请"), sample.buyer(),
                "request-first").statusCode()).isEqualTo(409);
        assertThat(send("POST", refunds, onlyRefund, sample.buyer(), "active-request").statusCode()).isEqualTo(409);
        assertThat(send("POST", sample.merchantPath() + "/shipment", shipment(), sample.merchant()).statusCode())
                .isEqualTo(409);
        assertThat(send("POST", sample.merchantPath() + "/refunds/" + first + "/decision",
                "{\"approve\":true}", otherMerchant).statusCode()).isEqualTo(404);
        assertThat(send("POST", refunds + "/" + first + "/cancel", null, sample.buyer()).statusCode()).isEqualTo(200);
        assertThat(send("POST", refunds + "/" + first + "/cancel", null, sample.buyer()).statusCode()).isEqualTo(200);
        assertThat(snapshot(sample.buyer()).path("orders").get(0).path("status").asString()).isEqualTo("PAID");

        String second = applyRefund(sample, onlyRefund, "request-second");
        String decision = sample.merchantPath() + "/refunds/" + second + "/decision";
        assertThat(send("POST", decision, "{\"approve\":false}", sample.merchant()).statusCode()).isEqualTo(400);
        assertThat(send("POST", decision, "{\"approve\":false,\"reply\":\"请核对款式\"}", sample.merchant()).statusCode())
                .isEqualTo(200);
        assertThat(stock(sample.product())).isEqualTo(2);

        String third = applyRefund(sample, onlyRefund, "request-third");
        String approve = sample.merchantPath() + "/refunds/" + third + "/decision";
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = executor.submit(() -> send("POST", approve, "{\"approve\":true}", sample.merchant()));
            var b = executor.submit(() -> send("POST", approve, "{\"approve\":true}", sample.merchant()));
            var firstDecision = a.get();
            var secondDecision = b.get();
            assertThat(firstDecision.statusCode()).as(firstDecision.body()).isEqualTo(200);
            assertThat(secondDecision.statusCode()).as(secondDecision.body()).isEqualTo(200);
        }
        var order = snapshot(sample.buyer()).path("orders").get(0);
        assertThat(order.path("status").asString()).isEqualTo("REFUNDED");
        assertThat(order.path("refund").path("status").asString()).isEqualTo("APPROVED");
        assertThat(order.path("refund").path("restocked").asBoolean()).isTrue();
        assertThat(order.path("refundHistory").get(0).path("status").asString()).isEqualTo("CANCELLED");
        assertThat(order.path("refundHistory").get(1).path("status").asString()).isEqualTo("REJECTED");
        assertThat(snapshot(sample.merchant()).path("orders").get(0).path("status").asString()).isEqualTo("REFUNDED");
        assertThat(stock(sample.product())).isEqualTo(3);
        assertThat(send("POST", refunds, onlyRefund, sample.buyer(), "request-fourth").statusCode()).isEqualTo(409);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void returnRefundRequiresLogisticsAndOnlyRestocksWhenSelected(boolean restock) throws Exception {
        var sample = refundableOrder();
        assertThat(send("POST", sample.merchantPath() + "/shipment", shipment(), sample.merchant()).statusCode())
                .isEqualTo(200);
        if (restock) {
            assertThat(send("POST", sample.buyerPath() + "/receipt", null, sample.buyer()).statusCode()).isEqualTo(200);
        }
        String id = applyRefund(sample, "{\"type\":\"RETURN_REFUND\",\"reason\":\"实物不合适\"}", "return-order");
        String buyerRefund = sample.buyerPath() + "/refunds/" + id;
        String merchantRefund = sample.merchantPath() + "/refunds/" + id;
        assertThat(send("POST", sample.buyerPath() + "/receipt", null, sample.buyer()).statusCode()).isEqualTo(409);
        assertThat(send("POST", buyerRefund + "/shipment", shipment(), sample.buyer()).statusCode()).isEqualTo(409);
        assertThat(send("POST", merchantRefund + "/decision", "{\"approve\":true}", sample.merchant()).statusCode())
                .isEqualTo(400);
        String accept = """
                {"approve":true,"returnAddress":{"name":"星屿退货部","phone":"13800000009","address":"上海市星河路 3 号"}}
                """;
        assertThat(send("POST", merchantRefund + "/decision", accept, sample.merchant()).statusCode()).isEqualTo(200);
        var waiting = snapshot(sample.buyer()).path("orders").get(0).path("refund");
        assertThat(waiting.path("status").asString()).isEqualTo("WAIT_RETURN");
        assertThat(waiting.path("returnAddress").path("name").asString()).isEqualTo("星屿退货部");

        String receipt = "{\"restock\":" + restock + "}";
        assertThat(send("POST", merchantRefund + "/receipt", receipt, sample.merchant()).statusCode()).isEqualTo(409);
        assertThat(send("POST", buyerRefund + "/shipment", shipment(), sample.buyer()).statusCode()).isEqualTo(200);
        assertThat(send("POST", buyerRefund + "/shipment", shipment(), sample.buyer()).statusCode()).isEqualTo(200);
        assertThat(send("POST", buyerRefund + "/cancel", null, sample.buyer()).statusCode()).isEqualTo(409);
        assertThat(send("POST", merchantRefund + "/receipt", receipt, sample.merchant()).statusCode()).isEqualTo(200);
        assertThat(send("POST", merchantRefund + "/receipt", receipt, sample.merchant()).statusCode()).isEqualTo(200);
        assertThat(send("POST", merchantRefund + "/receipt", "{\"restock\":" + !restock + "}", sample.merchant())
                .statusCode()).isEqualTo(409);

        var order = snapshot(sample.buyer()).path("orders").get(0);
        assertThat(order.path("status").asString()).isEqualTo("REFUNDED");
        assertThat(order.path("refund").path("originalStatus").asString()).isEqualTo(restock ? "COMPLETED" : "SHIPPED");
        assertThat(order.path("refund").path("returnTracking").asString()).isEqualTo("SF20261127001");
        assertThat(stock(sample.product())).isEqualTo(restock ? 3 : 2);
    }

    @Test
    void reviewsRequireReceiptAndKeepImagesRepliesAndPurchasePrivacy() throws Exception {
        var sample = refundableOrder();
        String buyer = sample.buyer();
        String merchant = sample.merchant();
        String otherBuyer = register("13800000002", "user").path("token").asString();
        String otherMerchant = register("13800000008", "merchant").path("token").asString();
        String itemId = snapshot(buyer).path("orders").get(0).path("items").get(0).path("orderItemId").asString();
        String endpoint = sample.buyerPath() + "/items/" + itemId + "/review";
        String plain = "{\"rating\":4,\"content\":\"实物做工细致\"}";
        assertThat(send("POST", endpoint, plain, buyer, "review-post-01").statusCode()).isEqualTo(409);
        assertThat(send("POST", endpoint, plain, otherBuyer, "review-post-01").statusCode()).isEqualTo(404);
        assertThat(send("POST", sample.merchantPath() + "/shipment", shipment(), merchant).statusCode()).isEqualTo(200);
        assertThat(send("POST", endpoint, plain, buyer, "review-post-01").statusCode()).isEqualTo(409);
        assertThat(send("POST", sample.buyerPath() + "/receipt", null, buyer).statusCode()).isEqualTo(200);
        assertThat(send("POST", endpoint, plain.replace(":4,", ":4.5,"), buyer, "review-post-01").statusCode())
                .isEqualTo(400);

        var png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(24, 24, BufferedImage.TYPE_INT_RGB), "png", png);
        String upload = "/api/v1/orders/review-images";
        assertThat(uploadMedia(upload, merchant, png.toByteArray()).statusCode()).isEqualTo(403);
        var ownImage = uploadMedia(upload, buyer, png.toByteArray());
        assertThat(ownImage.statusCode()).as(ownImage.body()).isEqualTo(201);
        String url = json.readTree(ownImage.body()).path("data").path("url").asString();
        var someoneElsesImage = uploadMedia(upload, otherBuyer, png.toByteArray());
        assertThat(someoneElsesImage.statusCode()).isEqualTo(201);
        String otherUrl = json.readTree(someoneElsesImage.body()).path("data").path("url").asString();
        String photoReview = """
                {"rating":4,"content":"实物做工细致","images":["%s"]}
                """;
        assertThat(send("POST", endpoint, photoReview.formatted(otherUrl), buyer, "review-post-01").statusCode())
                .isEqualTo(403);
        var productImage = uploadImage(merchant, png.toByteArray());
        assertThat(productImage.statusCode()).isEqualTo(201);
        String productUrl = json.readTree(productImage.body()).path("data").path("url").asString();
        assertThat(send("POST", endpoint, photoReview.formatted(productUrl), buyer, "review-post-01").statusCode())
                .isEqualTo(403);
        String draft = """
                {"title":"图片用途检查","images":["%s"],"skus":[{"name":"测试款","price":"19.90","stock":3}]}
                """.formatted(url);
        assertThat(send("POST", "/api/v1/merchant/products", draft, merchant).statusCode()).isEqualTo(403);

        String reviewId;
        String form = photoReview.formatted(uri(url));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> send("POST", endpoint, form, buyer, "review-post-01"));
            var two = executor.submit(() -> send("POST", endpoint, form, buyer, "review-post-01"));
            var first = one.get();
            var replay = two.get();
            assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
            assertThat(replay.statusCode()).as(replay.body()).isEqualTo(200);
            reviewId = json.readTree(first.body()).path("data").asString();
            assertThat(json.readTree(replay.body()).path("data").asString()).isEqualTo(reviewId);
        }
        assertThat(send("POST", endpoint, plain, buyer, "review-post-02").statusCode()).isEqualTo(409);
        assertThat(send("POST", endpoint, plain, buyer, "review-post-01").statusCode()).isEqualTo(409);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM product_review").query(Integer.class).single()).isEqualTo(1);

        var publicReview = snapshot(null).path("reviews").get(0);
        assertThat(publicReview.path("author").asString()).isEqualTo("星***1");
        assertThat(publicReview.path("images").get(0).asString()).isEqualTo(url);
        assertThat(get(url).statusCode()).isEqualTo(200);
        assertThat(publicReview.has("orderId")).isFalse();
        assertThat(publicReview.has("itemKey")).isFalse();
        assertThat(publicReview.has("buyerId")).isFalse();
        assertThat(snapshot(buyer).path("reviews").get(0).path("orderId").asString()).isEqualTo(sample.id());
        assertThat(snapshot(buyer).path("reviews").get(0).path("itemKey").asString()).isEqualTo(itemId);
        assertThat(snapshot(otherBuyer).path("reviews").get(0).has("orderId")).isFalse();
        assertThat(snapshot(otherMerchant).path("reviews").size()).isZero();

        String replyPath = "/api/v1/merchant/reviews/" + reviewId + "/reply";
        String reply = "{\"content\":\"谢谢你的反馈\"}";
        assertThat(send("POST", replyPath, reply, otherMerchant, "reply-post-01").statusCode()).isEqualTo(404);
        var replied = send("POST", replyPath, reply, merchant, "reply-post-01");
        assertThat(replied.statusCode()).as(replied.body()).isEqualTo(200);
        assertThat(send("POST", replyPath, reply, merchant, "reply-post-01").statusCode()).isEqualTo(200);
        assertThat(send("POST", replyPath, reply, merchant, "reply-post-02").statusCode()).isEqualTo(409);
        assertThat(snapshot(null).path("reviews").get(0).path("reply").path("content").asString())
                .isEqualTo("谢谢你的反馈");

        String refundId = applyRefund(sample, "{\"type\":\"REFUND_ONLY\",\"reason\":\"售后测试\"}", "review-refund-01");
        assertThat(send("POST", sample.merchantPath() + "/refunds/" + refundId + "/decision",
                "{\"approve\":true}", merchant).statusCode()).isEqualTo(200);
        assertThat(snapshot(null).path("reviews").get(0).path("refunded").asBoolean()).isTrue();
        assertThat(send("POST", endpoint, form, buyer, "review-post-01").statusCode()).isEqualTo(200);
        assertThat(send("PUT", "/api/v1/merchant/products/" + sample.product().path("id").asString() + "/publication",
                "{\"published\":false}", merchant).statusCode()).isEqualTo(200);
        assertThat(snapshot(null).path("reviews").size()).isZero();
        assertThat(snapshot(buyer).path("reviews").get(0).path("id").asString()).isEqualTo(reviewId);
        assertThat(snapshot(merchant).path("reviews").get(0).path("id").asString()).isEqualTo(reviewId);
    }

    private RefundSample refundableOrder() throws Exception {
        var merchant = register("13800000009", "merchant");
        String buyer = register("13800000001", "user").path("token").asString();
        String admin = json.readTree(send("POST", "/api/v1/auth/login",
                accountForm(ADMIN_PHONE, ADMIN_PASSWORD, "admin"), null).body()).path("data").path("token").asString();
        var product = publish(merchant, admin, "退款测试");
        var checkout = checkout(checkoutForm(line(product, 1)), buyer, "sample-order");
        assertThat(checkout.statusCode()).as(checkout.body()).isEqualTo(200);
        String id = json.readTree(checkout.body()).path("data").get(0).asString();
        return new RefundSample(id, buyer, merchant.path("token").asString(), product);
    }

    private String applyRefund(RefundSample sample, String form, String key) throws Exception {
        var response = send("POST", sample.buyerPath() + "/refunds", form, sample.buyer(), key);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return json.readTree(response.body()).path("data").path("id").asString();
    }

    private String shipment() {
        return "{\"carrier\":\"顺丰速运\",\"tracking\":\"SF20261127001\"}";
    }

    private record RefundSample(String id, String buyer, String merchant, JsonNode product) {
        String buyerPath() { return "/api/v1/orders/" + id; }
        String merchantPath() { return "/api/v1/merchant/orders/" + id; }
    }

    private HttpResponse<String> uploadImage(String token, byte[] bytes) throws Exception {
        return uploadMedia("/api/v1/merchant/product-images", token, bytes);
    }

    private HttpResponse<String> uploadMedia(String path, String token, byte[] bytes) throws Exception {
        String boundary = "starisle-test-media-boundary";
        String prefix = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test-upload\""
                + "\r\nContent-Type: application/octet-stream\r\n\r\n";
        byte[] end = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        return client.send(HttpRequest.newBuilder(uri(path))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArrays(List.of(prefix.getBytes(StandardCharsets.UTF_8), bytes, end)))
                .build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode publish(JsonNode merchant, String admin, String title) throws Exception {
        String id = merchant.path("shopId").asString();
        assertThat(send("POST", "/api/v1/admin/shops/" + id + "/approve", null, admin).statusCode()).isEqualTo(200);
        String body = """
                {"title":"%s","published":true,"skus":[{"name":"标准版","price":"19.90","stock":3}]}
                """.formatted(title);
        var response = send("POST", "/api/v1/merchant/products", body, merchant.path("token").asString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return json.readTree(response.body()).path("data");
    }

    private int stock(JsonNode product) throws Exception {
        var response = get("/api/v1/products/" + product.path("id").asString());
        return json.readTree(response.body()).path("data").path("skus").get(0).path("stock").asInt();
    }

    private JsonNode snapshot(String token) throws Exception {
        var response = send("GET", "/api/v1/marketplace", null, token);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return json.readTree(response.body()).path("data");
    }

    private String line(JsonNode product, int quantity) {
        return """
                {"productId":"%s","skuId":"%s","quantity":%d,"expectedPrice":1990,"variantName":"标准版"}
                """.formatted(product.path("id").asString(), product.path("skus").get(0).path("id").asString(), quantity);
    }

    private String checkoutForm(String lines) {
        return """
                {"items":[%s],"recipient":{"name":"测试收货人","phone":"13800000001","address":"上海市测试路 1 号"}}
                """.formatted(lines);
    }

    private HttpResponse<String> checkout(String body, String token, String key) throws Exception {
        return client.send(HttpRequest.newBuilder(uri("/api/v1/orders/checkout"))
                .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                .header("X-Idempotency-Key", key).POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode register(String phone, String role) throws Exception {
        var response = send("POST", "/api/v1/auth/register", accountForm(phone, "123456", role), null);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return json.readTree(response.body()).path("data");
    }

    private String accountForm(String phone, String password, String role) {
        return "{\"phone\":\"%s\",\"password\":\"%s\",\"role\":\"%s\"}".formatted(phone, password, role);
    }

    private HttpResponse<String> send(String method, String path, String body, String token) throws Exception {
        return send(method, path, body, token, null);
    }

    private HttpResponse<String> send(String method, String path, String body, String token, String key) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).method(method, body == null
                ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (body != null) request.header("Content-Type", "application/json");
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (key != null) request.header("X-Idempotency-Key", key);
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
