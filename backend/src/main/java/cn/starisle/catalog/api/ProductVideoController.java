package cn.starisle.catalog.api;

import cn.starisle.catalog.internal.ProductVideos;
import cn.starisle.identity.api.CurrentAccount;
import cn.starisle.shared.api.ApiResponse;
import java.time.Duration;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class ProductVideoController {
    private final ProductVideos videos;

    public ProductVideoController(ProductVideos videos) {
        this.videos = videos;
    }

    @PostMapping(path = "/api/v1/merchant/product-videos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<UploadedVideo> upload(@AuthenticationPrincipal CurrentAccount account,
                                             @RequestParam("file") MultipartFile file) {
        return ApiResponse.ok(new UploadedVideo(videos.upload(account.id(), file)));
    }

    @GetMapping("/api/v1/videos/{id}.mp4")
    public ResponseEntity<Resource> read(@PathVariable UUID id) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("video/mp4"))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(videos.read(id));
    }

    public record UploadedVideo(String url) {}
}
