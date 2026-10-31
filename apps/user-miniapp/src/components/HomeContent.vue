<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import { DEMO_ASSETS, money, toggleFavorite, type DemoState } from '@starisle/shared/demo'

const props = defineProps<{ state: DemoState; discover: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
const category = ref('推荐')
const keyword = ref('')
const info = ref<'artist' | 'event' | ''>('')
const followed = ref(false)
const categories = [
  { label: '周边商城', key: '周边', icon: 'bag', tone: 'pink' },
  { label: '发现画师', key: '画作', icon: 'brush', tone: 'purple' },
  { label: '漫展活动', key: '漫展', icon: 'ticket', tone: 'blue' },
  { label: '同好灵感', key: '推荐', icon: 'sparkles', tone: 'orange' },
]
watch(
  () => props.discover,
  (value) => {
    if (value) category.value = '周边'
  },
  { immediate: true },
)
const products = computed(() =>
  props.state.products.filter(
    (product) =>
      product.published &&
      (category.value === '推荐' ||
        category.value === '漫展' ||
        product.category === category.value) &&
      product.title.includes(keyword.value.trim()),
  ),
)
function open(id: string) {
  uni.navigateTo({ url: `/pages/product/detail?id=${id}` })
}
function favorite(id: string) {
  toggleFavorite(id)
  emit('refresh')
}
</script>

<template>
  <view class="home-content">
    <view class="search-box">
      <Icon name="search" :size="17" />
      <input
        v-model="keyword"
        placeholder="搜周边、画师，或下一份心动"
        confirm-type="search"
        maxlength="60"
        aria-label="搜索商品"
        data-testid="product-search"
      />
      <button v-if="keyword" class="clear-search" aria-label="清空搜索" @click="keyword = ''">
        ×
      </button>
      <text v-else class="search-note">发现热爱</text>
    </view>
    <view v-if="!discover && !keyword" class="hero" data-testid="home-hero">
      <image class="hero-art" :src="DEMO_ASSETS.hero" mode="aspectFill" />
      <view class="hero-shade" />
      <view class="hero-content">
        <text class="hero-label">给热爱，一座小岛</text>
        <text class="hero-title">{{ '每一份心动\n都值得被收藏' }}</text>
        <text class="hero-description">遇见周边、创作与同频的你</text>
        <button class="hero-button" @click="category = '周边'">
          <text>开启今日探索</text>
          <Icon name="arrow" tone="purple" :size="14" />
        </button>
      </view>
      <view class="hero-dots">
        <view class="hero-dot current" />
        <view class="hero-dot" />
        <view class="hero-dot" />
      </view>
      <text class="hero-corner">原创好物 · 灵感相遇</text>
    </view>
    <view v-if="!keyword" class="category-grid">
      <button
        v-for="item in categories"
        :key="item.key"
        class="category-item"
        @click="category = item.key"
      >
        <view class="category-icon" :class="item.tone">
          <Icon :name="item.icon" :tone="item.tone" :size="25" />
        </view>
        <text>{{ item.label }}</text>
      </button>
    </view>
    <view class="discovery-tabs">
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
      <text class="discovery-tip">找到你的同频</text>
    </view>
    <view v-if="category !== '漫展'" class="recommendation">
      <view class="section-heading">
        <view class="section-heading-title">
          <view class="section-spark">✦</view>
          <text>{{ keyword ? '搜索结果' : category === '画作' ? '灵感收藏夹' : '为你心动' }}</text>
        </view>
        <text class="recommendation-note">
          {{ keyword ? `${products.length} 件好物` : '让喜欢，有迹可循' }}
        </text>
      </view>
      <view v-if="products.length" class="product-grid">
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
            <view class="product-meta">
              <text class="product-price">
                <text class="currency">¥</text>
                {{ money(product.price) }}
              </text>
              <button
                class="favorite-button"
                :aria-label="state.favorites.includes(product.id) ? '取消收藏' : '收藏商品'"
                :data-testid="`favorite-${product.id}`"
                @click="favorite(product.id)"
              >
                <Icon
                  name="heart"
                  :tone="state.favorites.includes(product.id) ? 'pink' : 'muted'"
                  :size="18"
                />
              </button>
            </view>
          </view>
        </view>
      </view>
      <view v-else class="empty-state">
        <Icon name="search" tone="purple" :size="36" />
        <text class="empty-title">这一份心动还没出现</text>
        <text class="empty-copy">换个关键词，再找找看。</text>
        <button class="secondary-button" @click="keyword = ''">清空关键词</button>
      </view>
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
    <view v-if="!keyword" class="artist-strip" @click="info = 'artist'">
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
  padding: 0 20px;
}
.search-box {
  height: 41px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: #efecf6;
  border-radius: 12px;
  padding: 0 12px;
  margin: 4px 0 18px;
}
.search-box input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: #716580;
  height: 40px;
}
.search-note {
  font-size: 9px;
  white-space: nowrap;
  color: #aaa0b7;
  border-left: 1px solid #dbd4e8;
  padding-left: 10px;
}
.clear-search {
  background: transparent;
  color: #91839f;
  margin: 0;
  padding: 0 3px;
  line-height: 28px;
  font-size: 20px;
}
.hero {
  position: relative;
  height: 176px;
  overflow: hidden;
  border-radius: 18px;
  background: #e6daf5;
}
.hero-art {
  position: absolute;
  width: 100%;
  height: 100%;
}
.hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(245, 233, 255, 0.95) 0%,
    rgba(238, 221, 255, 0.65) 38%,
    transparent 68%
  );
}
.hero-content {
  position: relative;
  padding: 19px 0 0 19px;
}
.hero-label {
  display: block;
  color: #8263a7;
  font-size: 10px;
  font-weight: 550;
  letter-spacing: 1px;
}
.hero-title {
  display: block;
  color: #54317f;
  font-size: 25px;
  line-height: 1.42;
  white-space: pre-line;
  font-weight: 850;
  margin-top: 7px;
  letter-spacing: 0.5px;
}
.hero-description {
  display: block;
  color: #80649b;
  font-size: 9px;
  margin-top: 7px;
}
.hero-button {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 11px;
  margin: 12px 0 0;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 20px;
  font-size: 10px;
  color: #8053b2;
  line-height: 1;
}
.hero-dots {
  position: absolute;
  bottom: 10px;
  right: 15px;
  display: flex;
  gap: 4px;
}
.hero-dot {
  width: 4px;
  height: 4px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 4px;
}
.hero-dot.current {
  width: 13px;
  background: white;
}
.hero-corner {
  display: none;
}
.category-grid {
  display: flex;
  justify-content: space-around;
  margin: 18px -3px 18px;
}
.category-item {
  background: transparent;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  font-size: 11px;
  color: #71637f;
  line-height: 1.4;
}
.category-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 17px;
}
.category-icon.pink {
  background: #ffe7ef;
}
.category-icon.purple {
  background: #efe6ff;
}
.category-icon.blue {
  background: #e5efff;
}
.category-icon.orange {
  background: #fff0df;
}
.discovery-tabs {
  display: flex;
  align-items: center;
  gap: 25px;
  border-bottom: 1px solid #eeebf3;
  padding-bottom: 14px;
  margin-bottom: 18px;
}
.discovery-tab {
  position: relative;
  padding: 1px 0;
  font-size: 14px;
  line-height: 1.3;
  margin: 0;
  background: transparent;
  color: #9b91a7;
  border-radius: 0;
}
.discovery-tab.selected {
  color: #7850b8;
  font-weight: 750;
}
.tab-stroke {
  position: absolute;
  left: 1px;
  right: 1px;
  height: 3px;
  background: #a47ce2;
  border-radius: 3px;
  bottom: -14px;
}
.discovery-tip {
  flex: 1;
  text-align: right;
  font-size: 9px;
  color: #b7acbf;
}
.section-spark {
  color: #b99ae7;
  font-size: 20px;
}
.recommendation-note {
  font-size: 10px;
  color: #92839f;
}
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
.artist-strip {
  display: flex;
  align-items: center;
  gap: 11px;
  background: #f0eaf8;
  border: 1px solid #e9e0f2;
  border-radius: 12px;
  margin-top: 22px;
  padding: 12px;
}
.artist-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-position: 85% center;
}
.artist-strip-copy {
  flex: 1;
  font-size: 11px;
  font-weight: 550;
}
.artist-strip-note {
  display: block;
  color: #aa99bd;
  font-size: 9px;
  margin-top: 5px;
  font-weight: 400;
}
.island-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 28px 0 2px;
  color: #bfb2cd;
  font-size: 9px;
}
.island-footer view {
  width: 18px;
  height: 1px;
  background: #ded5e8;
}
.event-card {
  display: flex;
  background: white;
  overflow: hidden;
  border-radius: 15px;
  border: 1px solid #eee7f6;
}
.event-cover {
  width: 42%;
  height: 175px;
  object-position: 80% center;
}
.event-copy {
  flex: 1;
  padding: 18px 13px;
}
.event-badge {
  color: #9b7cc8;
  font-size: 9px;
}
.event-name {
  display: block;
  font-size: 16px;
  font-weight: 700;
  margin: 10px 0;
}
.event-date {
  color: #9176b6;
  font-size: 13px;
}
.event-description {
  display: block;
  font-size: 8px;
  color: #afa2bb;
  margin: 12px 0;
  line-height: 1.6;
}
.event-action {
  color: #8b5cf6;
  font-size: 11px;
}
.feature-image {
  width: 100%;
  height: 170px;
  border-radius: 14px;
}
.feature-title {
  display: block;
  margin-top: 20px;
  font-size: 18px;
  font-weight: 700;
}
.feature-copy {
  display: block;
  font-size: 13px;
  color: #9a8aa9;
  line-height: 1.9;
  margin: 12px 0 24px;
  white-space: pre-line;
}
.event-preview-note {
  display: block;
  font-size: 12px;
  color: #9f8eae;
  margin-bottom: 16px;
}
@media (max-width: 360px) {
  .home-content {
    padding: 0 15px;
  }
  .search-note {
    display: none;
  }
  .discovery-tabs {
    gap: 23px;
  }
  .hero-title {
    font-size: 23px;
  }
}
</style>
