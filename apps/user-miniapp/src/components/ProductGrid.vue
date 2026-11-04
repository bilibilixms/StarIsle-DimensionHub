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
      <button
        class="product-cover-wrap"
        :data-testid="`product-${product.id}`"
        :aria-label="`查看商品：${product.title}`"
        @click="open(product.id)"
      >
        <image
          :src="product.cover"
          class="product-cover"
          :class="{ artwork: product.category === '画作' || product.id === 'island-card' }"
          mode="aspectFill"
          :aria-label="product.title"
        />
        <text v-if="product.tag" class="product-cover-tag">{{ product.tag }}</text>
      </button>
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
          <text class="product-sales">已售 {{ product.sold }}</text>
        </view>
      </view>
      <button
        class="favorite-button"
        :aria-label="favorites.includes(product.id) ? '取消收藏' : '收藏商品'"
        :data-testid="`favorite-${product.id}`"
        @click.stop="favorite(product.id)"
      >
        <Icon name="heart" :tone="favorites.includes(product.id) ? 'pink' : 'muted'" :size="17" />
      </button>
    </view>
  </view>
</template>

<style scoped>
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 10px;
}
.product-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-radius: 12px;
  background: #fff;
}
.product-cover-wrap {
  position: relative;
  display: block;
  width: 100%;
  height: 0;
  padding: 100% 0 0;
  margin: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #eee7f2;
  line-height: 1;
  text-align: left;
}
.product-cover {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.product-cover.artwork {
  object-position: 80% center;
}
.product-cover-tag {
  position: absolute;
  left: 8px;
  bottom: 8px;
  max-width: calc(100% - 16px);
  padding: 4px 7px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.94);
  color: #654970;
  font-size: 10px;
  line-height: 1.2;
}
.product-copy {
  padding: 10px;
}
.product-name {
  display: -webkit-box;
  min-height: 38px;
  overflow: hidden;
  color: #372d40;
  font-size: 13px;
  font-weight: 600;
  line-height: 19px;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.product-subtitle {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: #81768b;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.product-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
  margin-top: 9px;
}
.product-price {
  color: #bd4569;
  font-size: 21px;
  font-weight: 750;
  line-height: 1.2;
}
.currency {
  margin-right: 1px;
  font-size: 11px;
  font-weight: 600;
}
.product-sales {
  flex-shrink: 0;
  color: #81768b;
  font-size: 10px;
}
.favorite-button {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  line-height: 1;
}
</style>
