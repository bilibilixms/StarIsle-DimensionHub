<script setup lang="ts">
import Icon from '@starisle/ui/Icon.vue'
import {
  money,
  toggleFavorite,
  stockMessage,
  LOW_STOCK_LIMIT,
  type DemoProduct,
} from '@starisle/shared/demo'
defineProps<{ products: DemoProduct[]; favorites: string[] }>()
const emit = defineEmits<{ refresh: [] }>()
function open(id: string) {
  uni.navigateTo({ url: `/pages/product/detail?id=${encodeURIComponent(id)}` })
}
function favorite(id: string) {
  toggleFavorite(id)
  emit('refresh')
}
</script>

<template>
  <view class="product-grid">
    <view v-for="product in products" :key="product.id" class="product-card">
      <view
        class="product-cover-wrap"
        :data-testid="`product-${product.id}`"
        @click="open(product.id)"
      >
        <image
          :src="product.cover"
          class="product-cover"
          :class="{ artwork: product.category === '画作' || product.id === 'island-card' }"
          mode="aspectFill"
          :aria-label="product.title"
        />
        <text class="product-cover-tag">{{ product.tag }}</text>
      </view>
      <view class="product-copy">
        <text class="product-name" @click="open(product.id)">{{ product.title }}</text>
        <text class="product-subtitle">{{ product.subtitle }}</text>
        <text
          v-if="product.stock <= LOW_STOCK_LIMIT"
          class="stock-hint"
          :class="{ 'stock-low': product.stock > 0, 'stock-empty': product.stock === 0 }"
          :data-testid="`stock-${product.id}`"
        >
          {{ stockMessage(product.stock) }}
        </text>
        <view class="product-meta">
          <text class="product-price">
            <text class="currency">¥</text>
            {{ money(product.price) }}
          </text>
          <button
            class="favorite-button"
            :aria-label="favorites.includes(product.id) ? '取消收藏' : '收藏商品'"
            :data-testid="`favorite-${product.id}`"
            @click="favorite(product.id)"
          >
            <Icon
              name="heart"
              :tone="favorites.includes(product.id) ? 'pink' : 'muted'"
              :size="18"
            />
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 12px;
}
.product-card {
  background: #fff;
  border: 1px solid #f0ecf4;
  border-radius: 14px;
  overflow: hidden;
}
.product-cover-wrap {
  position: relative;
  padding-top: 106%;
  overflow: hidden;
  background: #ede1f1;
}
.product-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.product-cover.artwork {
  object-position: 80% center;
}
.product-cover-tag {
  position: absolute;
  left: 8px;
  bottom: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  color: #9364ac;
  font-size: 8px;
  padding: 3px 6px;
}
.product-copy {
  padding: 11px 10px 8px;
}
.product-name {
  display: block;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.product-subtitle {
  display: block;
  font-size: 9px;
  line-height: 1.5;
  margin-top: 5px;
  color: #94879e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.product-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.product-price {
  color: #e67b98;
  font-size: 17px;
  font-weight: 700;
}
.currency {
  font-size: 10px;
  margin-right: 2px;
}
.favorite-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  margin: 0 -4px 0 0;
  border-radius: 50%;
  background: transparent;
  line-height: 1;
}
</style>
