<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import { DEMO_ASSETS, productShopId } from '@starisle/shared/demo'
import ProductGrid from './ProductGrid.vue'

const props = defineProps<{ id: string }>()
const { state, refresh, sync, connected, syncing, syncError } = useDemoSync()
const shop = computed(() => state.value.shops.find((shop) => shop.id === props.id))
const products = computed(() =>
  state.value.products.filter(
    (product) => productShopId(product) === props.id && product.published,
  ),
)
const cover = computed(() => products.value[0]?.cover || DEMO_ASSETS.figurine)
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
function home() {
  uni.reLaunch({ url: '/pages/index/index' })
}
function back() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else home()
}
</script>

<template>
  <view class="app-screen store-screen">
    <view class="store-nav" :style="{ paddingTop: `${statusHeight + 10}px` }">
      <button class="icon-button" aria-label="返回" data-testid="shop-back" @click="back">
        <Icon name="chevron-left" tone="ink" :size="20" />
      </button>
      <text>店铺</text>
      <button class="store-home" data-testid="shop-home" @click="home">首页</button>
    </view>
    <SyncStatus :connected="connected" :syncing="syncing" :error="syncError" @retry="sync" />
    <template v-if="shop">
      <view class="store-cover">
        <image :src="DEMO_ASSETS.hero" mode="aspectFill" />
        <view class="cover-shade" />
        <text>把热爱，装进这间小店。</text>
      </view>
      <view class="store-profile">
        <image class="store-avatar" :src="cover" mode="aspectFill" />
        <view class="store-identity">
          <text class="store-name" data-testid="shop-detail-name">{{ shop.name }}</text>
          <text class="store-caption">星屿小店</text>
        </view>
        <text class="store-description" data-testid="shop-detail-description">
          {{ shop.description }}
        </text>
      </view>
      <view class="store-products">
        <view class="section-heading">
          <view class="section-heading-title">
            <Icon name="bag" tone="purple" :size="20" />
            <text>店内好物</text>
          </view>
          <text class="store-count" data-testid="shop-product-count">
            {{ products.length }} 款上架商品
          </text>
        </view>
        <ProductGrid
          v-if="products.length"
          :products="products"
          :favorites="state.favorites"
          @refresh="refresh"
        />
        <view v-else class="empty-state" data-testid="shop-empty">
          <Icon name="bag" tone="purple" :size="38" />
          <text class="empty-title">小店正在准备好物</text>
          <text class="empty-copy">暂时没有上架商品，稍后再来看看吧。</text>
          <button class="secondary-button" @click="home">去首页逛逛</button>
        </view>
      </view>
      <text class="store-footer">愿每一份喜欢，都有温柔的归处。</text>
    </template>
    <view v-else-if="!syncing" class="empty-state" data-testid="shop-missing">
      <Icon name="bag" tone="purple" :size="40" />
      <text class="empty-title">没有找到这间小店</text>
      <text class="empty-copy">请返回搜索，寻找其他心动好物。</text>
      <button class="secondary-button" @click="home">返回首页</button>
    </view>
  </view>
</template>

<style scoped>
.store-screen {
  background: #f8f6fc;
  padding-bottom: calc(30px + env(safe-area-inset-bottom));
}
.store-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 20px;
  background: #fff;
  font-size: 16px;
  font-weight: 600;
}
.store-home {
  margin: 0;
  padding: 8px 0;
  width: 36px;
  background: transparent;
  color: #9a83b6;
  font-size: 12px;
  line-height: 1.5;
}
.store-cover {
  position: relative;
  height: 162px;
  overflow: hidden;
}
.store-cover > image {
  width: 100%;
  height: 100%;
}
.cover-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg, rgba(79, 50, 116, 0.55), transparent 80%);
}
.store-cover > text {
  position: absolute;
  left: 23px;
  bottom: 36px;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
}
.store-profile {
  position: relative;
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  column-gap: 13px;
  margin: -18px 20px 25px;
  padding: 19px 18px;
  background: #fff;
  border-radius: 17px;
  border: 1px solid #ede6f4;
}
.store-avatar {
  width: 58px;
  height: 58px;
  border-radius: 14px;
  flex-shrink: 0;
}
.store-identity {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}
.store-name {
  display: block;
  font-size: 21px;
  font-weight: 650;
  line-height: 1.5;
  color: #563a73;
  word-break: break-all;
}
.store-caption {
  display: block;
  color: #b29bc9;
  font-size: 10px;
  margin-top: 4px;
}
.store-description {
  display: block;
  width: 100%;
  margin-top: 15px;
  padding-top: 13px;
  border-top: 1px solid #f1ebf6;
  font-size: 12px;
  color: #9786a6;
  line-height: 1.9;
  word-break: break-all;
}
.store-products {
  padding: 0 20px;
}
.store-count {
  color: #a18ab4;
  font-size: 11px;
}
.store-footer {
  display: block;
  text-align: center;
  color: #b9a8c7;
  font-size: 10px;
  margin: 27px 20px 0;
}
/* #ifdef MP-WEIXIN */
.store-nav {
  padding-right: 112px;
}
/* #endif */
</style>
