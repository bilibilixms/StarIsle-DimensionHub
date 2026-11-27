package cn.starisle;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
        var request = HttpRequest.newBuilder(uri(path)).method(method, body == null
                ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (body != null) request.header("Content-Type", "application/json");
        if (token != null) request.header("Authorization", "Bearer " + token);
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
