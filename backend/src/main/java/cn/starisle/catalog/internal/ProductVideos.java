package cn.starisle.catalog.internal;

import cn.starisle.shop.api.ShopService;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductVideos {
    private static final Logger LOG = LoggerFactory.getLogger(ProductVideos.class);
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final String PREFIX = "/api/v1/videos/";
    private static final Pattern UPLOAD_PATH = Pattern.compile(
            "^" + PREFIX + "([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\\.mp4$");

    private final JdbcClient jdbc;
    private final ShopService shops;
    private final Path directory;

    public ProductVideos(JdbcClient jdbc, ShopService shops,
                         @Value("${starisle.catalog.videos-directory}") String directory) {
        this.jdbc = jdbc;
        this.shops = shops;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
    }

    @Transactional
    public String upload(long ownerId, MultipartFile file) {
        long shopId = shops.findOwnedShop(ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "尚未开通店铺")).id();
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "商品视频不能超过 20 MB");
        }
        byte[] data;
        try {
            data = file.getBytes();
            Mp4Video.validate(data);
        } catch (IOException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择 60 秒以内的 MP4（H.264）视频", exception);
        }
        String id = UUID.randomUUID().toString();
        Path path = path(id);
        jdbc.sql("INSERT INTO catalog_video (id, shop_id) VALUES (:id, :shop)")
                .param("id", id).param("shop", shopId).update();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) remove(path);
            }
        });
        try {
            Files.createDirectories(directory);
            Files.write(path, data, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "商品视频暂时无法保存", exception);
        }
        return url(id);
    }

    public Resource read(UUID id) {
        Path path = path(id.toString());
        boolean exists = jdbc.sql("SELECT id FROM catalog_video WHERE id = :id")
                .param("id", id.toString()).query(String.class).optional().isPresent();
        if (!exists || !Files.isRegularFile(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "视频不存在");
        }
        return new FileSystemResource(path);
    }

    String ownedId(String value, long shopId) {
        if (value == null || value.isBlank()) return null;
        URI uri;
        try {
            uri = URI.create(value.strip());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "商品视频地址无效", exception);
        }
        String scheme = uri.getScheme();
        boolean relative = scheme == null && uri.getRawAuthority() == null;
        boolean absolute = ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) && uri.getHost() != null;
        String path = uri.getRawPath();
        var matcher = UPLOAD_PATH.matcher(path == null ? "" : path);
        if ((!relative && !absolute) || !matcher.matches() || jdbc.sql("""
                SELECT id FROM catalog_video WHERE id = :id AND shop_id = :shop
                """).param("id", matcher.group(1)).param("shop", shopId).query(String.class).optional().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "请使用本店上传的商品视频");
        }
        return matcher.group(1);
    }

    static String url(String id) {
        return id == null ? null : PREFIX + id + ".mp4";
    }

    private Path path(String id) {
        return directory.resolve(id + ".mp4");
    }

    private static void remove(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            LOG.warn("Could not remove rolled-back video {}", path, exception);
        }
    }
}
