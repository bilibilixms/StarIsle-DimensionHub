package cn.starisle.catalog.api;

import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface ProductVisibility {
    List<Long> visibleIds(Set<Long> productIds);

    Optional<AvailableSku> visibleSku(long productId, long skuId);

    record AvailableSku(String title, String name, int stock) {}
}
