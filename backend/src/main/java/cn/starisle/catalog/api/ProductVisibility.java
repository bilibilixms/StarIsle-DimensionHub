package cn.starisle.catalog.api;

import java.util.List;
import java.util.Set;

public interface ProductVisibility {
    List<Long> visibleIds(Set<Long> productIds);
}
