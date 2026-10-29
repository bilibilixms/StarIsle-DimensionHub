package cn.starisle;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
    }

    @LocalServerPort int port;
    @Autowired JdbcClient jdbc;
    @Autowired StringRedisTemplate redis;
    @Autowired ObjectMapper json;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void seedIsolatedDatabase() {
        jdbc.sql("DELETE FROM catalog_product").update();
        jdbc.sql("DELETE FROM merchant_shop").update();
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
    void rejectsInvalidPagingAndUnimplementedPrivateRoutes() throws Exception {
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

    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
