<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import ProductGrid from './ProductGrid.vue'
import { DEMO_ASSETS, productShopId, type DemoState } from '@starisle/shared/demo'

const props = defineProps<{ state: DemoState; discover: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
const category = ref('推荐')
const priceOrder = ref<'default' | 'asc' | 'desc'>('default')
const keyword = ref('')
const query = computed(() => keyword.value.trim().toLowerCase())
const shops = computed(() =>
  query.value
    ? props.state.shops.filter((shop) => shop.name.toLowerCase().includes(query.value))
    : [],
)
const matchingShopIds = computed(() => new Set(shops.value.map((shop) => shop.id)))
function shopProducts(id: string) {
  return props.state.products.filter(
    (product) => product.published && productShopId(product) === id,
  )
}
const info = ref<'artist' | 'event' | ''>('')
const followed = ref(false)
const categories = [
  { label: '周边商城', key: '周边', icon: 'bag', tone: 'pink' },
  { label: '收藏画作', key: '画作', icon: 'brush', tone: 'purple' },
  { label: '漫展活动', key: '漫展', icon: 'ticket', tone: 'blue' },
  { label: '为你推荐', key: '推荐', icon: 'sparkles', tone: 'orange' },
]
watch(
  () => props.discover,
  (value) => {
    if (value) category.value = '周边'
  },
  { immediate: true },
)
const filteredProducts = computed(() =>
  props.state.products.filter(
    (product) =>
      product.published &&
      (query.value ||
        category.value === '推荐' ||
        category.value === '漫展' ||
        product.category === category.value) &&
      (!query.value ||
        product.title.toLowerCase().includes(query.value) ||
        matchingShopIds.value.has(productShopId(product))),
  ),
)
const products = computed(() =>
  priceOrder.value === 'default'
    ? filteredProducts.value
    : [...filteredProducts.value].sort((a, b) =>
        priceOrder.value === 'asc' ? a.price - b.price : b.price - a.price,
      ),
)
function sortByPrice() {
  priceOrder.value =
    priceOrder.value === 'default' ? 'asc' : priceOrder.value === 'asc' ? 'desc' : 'default'
}
function openShop(id: string) {
  uni.navigateTo({ url: `/pages/shop/detail?id=${encodeURIComponent(id)}` })
}
</script>

<template>
  <view class="home-content">
    <view class="search-panel">
      <view class="search-box">
        <Icon name="search" tone="purple" :size="19" />
        <input
          v-model="keyword"
          placeholder="搜索商品或商家"
          confirm-type="search"
          maxlength="60"
          aria-label="搜索商品或商家"
          data-testid="product-search"
        />
        <button v-if="keyword" class="clear-search" aria-label="清空搜索" @click="keyword = ''">
          ×
        </button>
        <text v-else class="search-note">商品 / 店铺</text>
      </view>
    </view>
    <view v-if="!query" class="category-grid">
      <button
        v-for="item in categories"
        :key="item.key"
        class="category-item"
        :class="{ 'category-active': category === item.key }"
        @click="category = item.key"
      >
        <view class="category-icon" :class="item.tone">
          <Icon :name="item.icon" :tone="item.tone" :size="24" />
        </view>
        <text>{{ item.label }}</text>
      </button>
    </view>
    <view v-if="shops.length" class="shop-results" data-testid="shop-results">
      <view class="section-heading">
        <view class="section-heading-title">
          <Icon name="bag" tone="purple" :size="19" />
          <text>相关店铺</text>
        </view>
        <text class="recommendation-note">{{ shops.length }} 家店铺</text>
      </view>
      <button
        v-for="shop in shops"
        :key="shop.id"
        class="search-shop"
        :data-testid="`shop-${shop.id}`"
        :aria-label="`进入店铺：${shop.name}`"
        @click="openShop(shop.id)"
      >
        <image
          :src="shopProducts(shop.id)[0]?.cover || DEMO_ASSETS.figurine"
          mode="aspectFill"
          class="search-shop-avatar"
        />
        <view class="search-shop-copy">
          <text class="search-shop-name">{{ shop.name }}</text>
          <text class="search-shop-description">{{ shop.description }}</text>
          <text class="search-shop-count">{{ shopProducts(shop.id).length }} 款上架商品</text>
        </view>
        <Icon name="chevron-right" tone="purple" :size="17" />
      </button>
    </view>
    <view v-if="!discover && !query && category === '推荐'" class="hero" data-testid="home-hero">
      <image class="hero-art" :src="DEMO_ASSETS.hero" mode="aspectFill" />
      <view class="hero-content">
        <text class="hero-label">星屿灵感选集</text>
        <text class="hero-title">把喜欢，带回小岛</text>
        <text class="hero-description">周边、画作，和日常里的小小收藏</text>
        <button class="hero-button" @click="category = '周边'">
          <text>逛逛周边</text>
          <Icon name="chevron-right" tone="purple" :size="12" />
        </button>
      </view>
    </view>
    <view v-if="!query" class="discovery-tabs">
      <button
        v-for="item in ['推荐', '周边', '画作', '漫展']"
        :key="item"
        class="discovery-tab"
        :class="{ selected: category === item }"
        @click="category = item"
      >
        <text>{{ item }}</text>
        <view v-if="category === item" class="tab-stroke" />
      </button>
    </view>
    <view v-if="query || category !== '漫展'" class="recommendation">
      <view class="section-heading">
        <view class="section-heading-title">
          <text>
            {{
              query
                ? '搜索结果'
                : category === '画作'
                  ? '收藏画作'
                  : category === '周边'
                    ? '周边好物'
                    : '为你推荐'
            }}
          </text>
          <text class="product-count">{{ products.length }} 件好物</text>
        </view>
        <button
          class="price-sort"
          :class="{ 'sort-active': priceOrder !== 'default' }"
          :aria-label="
            priceOrder === 'default'
              ? '按价格从低到高排序'
              : priceOrder === 'asc'
                ? '按价格从高到低排序'
                : '恢复默认排序'
          "
          data-testid="price-sort"
          @click="sortByPrice"
        >
          价格
          <text>{{ priceOrder === 'asc' ? '↑' : priceOrder === 'desc' ? '↓' : '↕' }}</text>
        </button>
      </view>
      <ProductGrid
        v-if="products.length"
        :products="products"
        :favorites="state.favorites"
        @refresh="$emit('refresh')"
      />
      <view v-else-if="!shops.length" class="empty-state">
        <Icon name="search" tone="purple" :size="36" />
        <text class="empty-title">这一份心动还没出现</text>
        <text class="empty-copy">换个关键词，再找找看。</text>
        <button class="secondary-button" @click="keyword = ''">清空关键词</button>
      </view>
      <text v-else class="shop-search-note">没有匹配的上架商品，可以进入店铺逛逛。</text>
    </view>
    <view v-else class="events-section">
      <view class="section-heading">
        <view class="section-heading-title">
          <Icon name="ticket" tone="blue" :size="20" />
          <text>下一站，见同好</text>
        </view>
        <text class="recommendation-note">精选活动</text>
      </view>
      <view class="event-card" @click="info = 'event'">
        <image :src="DEMO_ASSETS.hero" mode="aspectFill" class="event-cover" />
        <view class="event-copy">
          <text class="event-badge">上海 · 次元相遇</text>
          <text class="event-name">星屿次元游园会</text>
          <text class="event-date">12.06 — 12.07</text>
          <text class="event-description">原创摊位 / 同人交流 / 灵感市集</text>
          <text class="event-action">
            查看活动
            <text>›</text>
          </text>
        </view>
      </view>
    </view>
    <view v-if="!query && category === '画作'" class="artist-strip" @click="info = 'artist'">
      <image :src="DEMO_ASSETS.hero" class="artist-avatar" mode="aspectFill" />
      <view class="artist-strip-copy">
        <text>和创作者一起，把梦画下来</text>
        <text class="artist-strip-note">本期画师推荐 · 月眠眠</text>
      </view>
      <Icon name="chevron-right" tone="purple" :size="18" />
    </view>
    <view class="island-footer">
      <view />
      <text>在星屿，每份热爱都有归处</text>
      <view />
    </view>
    <Sheet
      :visible="!!info"
      :title="info === 'artist' ? '画师推荐' : '星屿次元游园会'"
      @close="info = ''"
    >
      <image :src="DEMO_ASSETS.hero" class="feature-image" mode="aspectFill" />
      <template v-if="info === 'artist'">
        <text class="feature-title">月眠眠</text>
        <text class="feature-copy">
          画一些星星、月亮，还有温柔的小小世界。欢迎来到我的灵感小岛。
        </text>
        <button class="primary-button" @click="followed = !followed">
          {{ followed ? '已关注 · 期待下一次相遇' : '关注这位画师' }}
        </button>
      </template>
      <template v-else>
        <text class="feature-title">把屏幕里的同频，变成面对面的相遇。</text>
        <text class="feature-copy">
          {{ '12 月 6–7 日 · 上海\n原创周边、画师作品与同好交流，欢迎来岛上做客。' }}
        </text>
        <text class="event-preview-note">活动场景预览，暂未开放报名</text>
        <button class="secondary-button" @click="info = ''">继续逛逛</button>
      </template>
    </Sheet>
  </view>
</template>

<style scoped>
.home-content {
  padding: 0;
}
.search-panel {
  padding: 2px 16px 0;
  background: #fff;
}
.search-box {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  background: #f4f1f8;
  border: 1px solid #e9e2f2;
  border-radius: 12px;
}
.search-box input {
  flex: 1;
  min-width: 0;
  height: 42px;
  font-size: 13px;
  color: #42364f;
}
.search-note {
  padding-left: 10px;
  border-left: 1px solid #ddd5e8;
  color: #85778f;
  font-size: 10px;
  white-space: nowrap;
}
.clear-search {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 36px;
  padding: 0;
  margin: 0;
  background: transparent;
  color: #766880;
  font-size: 22px;
  line-height: 1;
}
.category-grid {
  display: flex;
  justify-content: space-between;
  padding: 15px 18px 18px;
  background: #fff;
}
.category-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 0;
  margin: 0;
  background: transparent;
  color: #655a71;
  font-size: 11px;
  line-height: 1.4;
}
.category-active {
  color: #6541a5;
  font-weight: 650;
}
.category-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 16px;
}
.category-icon.pink {
  background: #fff0f4;
}
.category-icon.purple {
  background: #f1eafa;
}
.category-icon.blue {
  background: #edf3ff;
}
.category-icon.orange {
  background: #fff3e8;
}
.hero {
  position: relative;
  height: 128px;
  margin: 12px 16px 2px;
  overflow: hidden;
  border-radius: 12px;
  background: #eee6f7;
}
.hero-art {
  position: absolute;
  right: 0;
  top: 0;
  width: 40%;
  height: 100%;
  border-radius: 70px 0 0 70px;
}
.hero-content {
  position: relative;
  width: 66%;
  padding: 15px 0 0 16px;
}
.hero-label {
  display: block;
  color: #7c619b;
  font-size: 10px;
  line-height: 1.4;
}
.hero-title {
  display: block;
  margin-top: 6px;
  color: #4e326d;
  font-size: 19px;
  font-weight: 750;
  line-height: 1.4;
  white-space: nowrap;
}
.hero-description {
  display: block;
  margin-top: 5px;
  color: #7d668e;
  font-size: 10px;
  line-height: 1.4;
}
.hero-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0;
  margin: 7px 0 0;
  background: transparent;
  color: #6541a5;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}
.discovery-tabs {
  display: flex;
  align-items: center;
  gap: 30px;
  height: 49px;
  padding: 0 16px;
  margin: 0;
  background: #fff;
  border-bottom: 1px solid #eeeaf3;
}
.hero + .discovery-tabs {
  margin-top: 12px;
}
.discovery-tab {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 2px;
  margin: 0;
  background: transparent;
  color: #81768b;
  font-size: 14px;
  line-height: 1.4;
  border-radius: 0;
}
.discovery-tab.selected {
  color: #4e326d;
  font-weight: 750;
}
.tab-stroke {
  position: absolute;
  left: 50%;
  bottom: 6px;
  width: 18px;
  height: 3px;
  margin-left: -9px;
  border-radius: 2px;
  background: #8056cf;
}
.recommendation {
  padding: 14px 12px 0;
}
.section-heading {
  margin-bottom: 12px;
}
.section-heading-title {
  gap: 9px;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
}
.product-count {
  color: #85798f;
  font-size: 10px;
  font-weight: 400;
}
.price-sort {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 6px;
  margin: -3px 0;
  background: transparent;
  color: #81768b;
  font-size: 11px;
  line-height: 1.4;
}
.price-sort text {
  font-size: 15px;
}
.price-sort.sort-active {
  color: #6541a5;
  font-weight: 600;
}
.recommendation-note {
  color: #81768b;
  font-size: 11px;
}
.shop-results {
  padding: 18px 16px 4px;
  background: #fff;
}
.search-shop {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  margin: 0 0 10px;
  text-align: left;
  background: #faf8fd;
  border: 1px solid #ece5f3;
  border-radius: 12px;
  line-height: 1.5;
}
.search-shop-avatar {
  flex-shrink: 0;
  width: 54px;
  height: 54px;
  border-radius: 10px;
}
.search-shop-copy {
  flex: 1;
  min-width: 0;
}
.search-shop-name {
  display: block;
  font-size: 14px;
  font-weight: 650;
  color: #44334f;
  word-break: break-all;
}
.search-shop-description {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #81768b;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-shop-count {
  display: block;
  margin-top: 4px;
  color: #765a96;
  font-size: 10px;
}
.shop-search-note {
  display: block;
  padding: 20px 0;
  font-size: 12px;
  color: #81768b;
  line-height: 1.8;
}
.artist-strip {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 20px 16px 0;
  padding: 12px;
  background: #f0eaf8;
  border-radius: 12px;
}
.artist-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
}
.artist-strip-copy {
  flex: 1;
  font-size: 12px;
  font-weight: 550;
}
.artist-strip-note {
  display: block;
  margin-top: 5px;
  color: #81768b;
  font-size: 10px;
  font-weight: 400;
}
.island-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 28px 12px 0;
  color: #96889f;
  font-size: 10px;
}
.island-footer view {
  width: 18px;
  height: 1px;
  background: #ded5e8;
}
.events-section {
  padding: 18px 16px 0;
}
.event-card {
  display: flex;
  overflow: hidden;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #eee7f6;
}
.event-cover {
  flex-shrink: 0;
  width: 40%;
  height: 180px;
}
.event-copy {
  flex: 1;
  min-width: 0;
  padding: 18px 12px;
}
.event-badge {
  color: #765a96;
  font-size: 10px;
}
.event-name {
  display: block;
  margin: 10px 0;
  font-size: 16px;
  font-weight: 700;
}
.event-date {
  color: #765a96;
  font-size: 13px;
}
.event-description {
  display: block;
  margin: 12px 0;
  color: #81768b;
  font-size: 10px;
  line-height: 1.6;
}
.event-action {
  color: #6541a5;
  font-size: 12px;
}
.feature-image {
  width: 100%;
  height: 170px;
  border-radius: 12px;
}
.feature-title {
  display: block;
  margin-top: 20px;
  font-size: 18px;
  font-weight: 700;
}
.feature-copy {
  display: block;
  margin: 12px 0 24px;
  color: #81768b;
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-line;
}
.event-preview-note {
  display: block;
  margin-bottom: 16px;
  color: #81768b;
  font-size: 12px;
}
@media (max-width: 360px) {
  .search-note {
    display: none;
  }
  .hero-title {
    font-size: 17px;
  }
  .hero-description {
    max-width: 165px;
    font-size: 9px;
  }
  .discovery-tabs {
    gap: 26px;
  }
}
</style>
