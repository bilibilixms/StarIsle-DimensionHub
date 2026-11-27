package cn.starisle.catalog.api;

import cn.starisle.shop.api.ShopService;
import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Types;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
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
public class CatalogImages {
    private static final Logger LOG = LoggerFactory.getLogger(CatalogImages.class);
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final int MAX_SIDE = 1600;
    private static final long MAX_PIXELS = 25_000_000;
    private static final String PREFIX = "/api/v1/images/";
    private static final Pattern UPLOAD_PATH = Pattern.compile(
            "^" + PREFIX + "([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\\.jpg$");
    private static final Set<String> FORMATS = Set.of("jpeg", "png", "webp");
    private final JdbcClient jdbc;
    private final ShopService shops;
    private final Path directory;

    public CatalogImages(JdbcClient jdbc, ShopService shops,
                         @Value("${starisle.catalog.images-directory}") String directory) {
        this.jdbc = jdbc;
        this.shops = shops;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
    }

    @Transactional
    public String uploadProduct(long ownerId, MultipartFile file) {
        var shop = shops.findOwnedShop(ownerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "尚未开通店铺"));
        return store(file, shop.id(), null);
    }

    @Transactional
    public String uploadReview(long buyerId, MultipartFile file) {
        return store(file, null, buyerId);
    }

    private String store(MultipartFile file, Long shopId, Long buyerId) {
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "商品图片不能超过 2 MB");
        }
        byte[] jpeg = encode(file);
        UUID id = UUID.randomUUID();
        Path path = path(id);
        try {
            Files.createDirectories(directory);
            Files.write(path, jpeg, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "商品图片暂时无法保存", exception);
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    try {
                        Files.deleteIfExists(path);
                    } catch (IOException exception) {
                        LOG.warn("Could not remove rolled-back image {}", id, exception);
                    }
                }
            }
        });
        jdbc.sql("INSERT INTO catalog_image (id, shop_id, buyer_id) VALUES (:id, :shop, :buyer)")
                .param("id", id.toString()).param("shop", shopId, Types.BIGINT)
                .param("buyer", buyerId, Types.BIGINT).update();
        return PREFIX + id + ".jpg";
    }

    public Resource read(UUID id) {
        boolean exists = jdbc.sql("SELECT id FROM catalog_image WHERE id = :id")
                .param("id", id.toString()).query(String.class).optional().isPresent();
        Path path = path(id);
        if (!exists || !Files.isRegularFile(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "图片不存在");
        }
        return new FileSystemResource(path);
    }

    public String normalizeProduct(String value, long shopId) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.strip();
        String path = imagePath(trimmed);
        if (path == null || !path.startsWith(PREFIX)) return trimmed;
        requireOwner(path, shopId, null, "请使用本店上传的商品图片");
        return path;
    }

    public List<String> normalizeReview(List<String> values, long buyerId) {
        if (values == null) return List.of();
        var paths = values.stream().map(value -> imagePath(value.strip())).toList();
        if (new HashSet<>(paths).size() != paths.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "评价图片不能重复");
        }
        for (String path : paths) requireOwner(path, null, buyerId, "请使用自己上传的评价图片");
        return paths;
    }

    private static String imagePath(String value) {
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "商品图片地址无效", exception);
        }
        String scheme = uri.getScheme();
        if (scheme == null ? !value.startsWith("/") || uri.getRawAuthority() != null
                : (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) || uri.getHost() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "商品图片地址无效");
        }
        return uri.normalize().getPath();
    }

    private void requireOwner(String path, Long shopId, Long buyerId, String message) {
        var match = UPLOAD_PATH.matcher(path == null ? "" : path);
        if (!match.matches() || jdbc.sql("""
                SELECT id FROM catalog_image WHERE id = :id AND shop_id <=> :shop AND buyer_id <=> :buyer
                """).param("id", match.group(1)).param("shop", shopId, Types.BIGINT).param("buyer", buyerId, Types.BIGINT)
                .query(String.class).optional().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
        }
    }

    private Path path(UUID id) {
        return directory.resolve(id + ".jpg");
    }

    private static byte[] encode(MultipartFile file) {
        try (var upload = file.getInputStream(); var source = new MemoryCacheImageInputStream(upload)) {
            var readers = ImageIO.getImageReaders(source);
            if (!readers.hasNext()) throw new IOException("Unknown image format");
            var reader = readers.next();
            try {
                if (!FORMATS.contains(reader.getFormatName().toLowerCase(Locale.ROOT))) {
                    throw new IOException("Unsupported image format");
                }
                reader.setInput(source, false, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || (long) width * height > MAX_PIXELS || reader.getNumImages(true) != 1) {
                    throw new IOException("Invalid image dimensions or frame count");
                }
                var original = reader.read(0);
                double scale = Math.min(1, (double) MAX_SIDE / Math.max(width, height));
                var scaled = new BufferedImage(
                        Math.max(1, (int) Math.round(width * scale)), Math.max(1, (int) Math.round(height * scale)),
                        BufferedImage.TYPE_INT_RGB);
                var graphics = scaled.createGraphics();
                try {
                    graphics.setColor(Color.WHITE);
                    graphics.fillRect(0, 0, scaled.getWidth(), scaled.getHeight());
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                    graphics.drawImage(original, 0, 0, scaled.getWidth(), scaled.getHeight(), null);
                } finally {
                    graphics.dispose();
                }
                var output = new ByteArrayOutputStream();
                if (!ImageIO.write(scaled, "jpeg", output)) throw new IOException("JPEG writer unavailable");
                return output.toByteArray();
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择有效的 JPG、PNG 或 WebP 静态图片", exception);
        }
    }
}
