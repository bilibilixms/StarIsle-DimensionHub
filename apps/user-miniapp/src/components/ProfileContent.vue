<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import { DEMO_ASSETS, money, resetDemoState, type DemoState } from '@starisle/shared/demo'
defineProps<{ state: DemoState }>()
const emit = defineEmits<{ refresh: []; browse: [] }>()
const section = ref<'orders' | 'favorites'>('orders')
function open(id: string) {
  uni.navigateTo({ url: `/pages/product/detail?id=${id}` })
}
function reset() {
  uni.showModal({
    title: '重置演示数据',
    content: '清空本机的收藏、购物车和模拟订单，恢复初始场景。',
    confirmColor: '#8b5cf6',
    success(result) {
      if (result.confirm) {
        resetDemoState()
        emit('refresh')
      }
    },
  })
}
</script>

<template>
  <view class="profile-content">
    <view class="profile-card">
      <image :src="DEMO_ASSETS.hero" class="avatar" mode="aspectFill" />
      <view>
        <text class="profile-name">小星同学</text>
        <text class="profile-motto">今天也要，为热爱心动。</text>
        <text class="profile-badge">星屿体验官</text>
      </view>
      <Icon name="sparkles" tone="purple" :size="30" />
    </view>
    <view class="profile-shortcuts">
      <button :class="{ active: section === 'orders' }" @click="section = 'orders'">
        <text>{{ state.orders.length }}</text>
        <text>我的订单</text>
      </button>
      <button
        :class="{ active: section === 'favorites' }"
        @click="section = 'favorites'"
        data-testid="show-favorites"
      >
        <text data-testid="favorite-count">{{ state.favorites.length }}</text>
        <text>我的收藏</text>
      </button>
    </view>
    <view class="section-heading">
      <view class="section-heading-title">
        <text>{{ section === 'orders' ? '我的订单' : '心动收藏' }}</text>
      </view>
      <text class="profile-list-note">本地演示记录</text>
    </view>
    <template v-if="section === 'orders'">
      <view v-for="order in state.orders" :key="order.id" class="order-card">
        <view class="order-heading">
          <text>{{ state.shop.name }}</text>
          <text class="order-status">{{ order.status }}</text>
        </view>
        <view class="order-product" @click="open(order.productId)">
          <image :src="order.cover" mode="aspectFill" />
          <view>
            <text class="order-title">{{ order.title }}</text>
            <text class="order-variant">{{ order.variant }} × {{ order.quantity }}</text>
            <text class="order-amount">实付 ¥{{ money(order.amount) }}</text>
          </view>
        </view>
        <text class="order-number">演示订单 {{ order.id }}</text>
      </view>
      <view v-if="!state.orders.length" class="empty-state">
        <Icon name="receipt" tone="purple" :size="40" />
        <text class="empty-title">还没有开启你的收藏之旅</text>
        <text class="empty-copy">第一件心动好物，正在等你。</text>
        <button class="secondary-button" @click="$emit('browse')">去发现好物</button>
      </view>
    </template>
    <template v-else>
      <view
        v-for="product in state.products.filter((product) => state.favorites.includes(product.id))"
        :key="product.id"
        class="favorite-card"
        @click="open(product.id)"
      >
        <image :src="product.cover" mode="aspectFill" />
        <view>
          <text>{{ product.title }}</text>
          <text class="favorite-price">¥{{ money(product.price) }}</text>
        </view>
        <Icon name="heart" tone="pink" :size="18" />
      </view>
      <view v-if="!state.favorites.length" class="empty-state">
        <Icon name="heart" tone="pink" :size="40" />
        <text class="empty-title">喜欢的，就先收藏起来</text>
        <text class="empty-copy">在商品卡片点亮爱心，下次还能找到它。</text>
      </view>
    </template>
    <button class="reset-button" @click="reset">重置演示数据</button>
    <text class="profile-footnote">这是一座正在生长的小岛。感谢你来做客。</text>
  </view>
</template>

<style scoped>
.profile-content {
  padding: 14px 20px;
}
.profile-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 22px 18px;
  background: #eee5f8;
  border-radius: 18px;
}
.avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid white;
  object-position: 80% center;
}
.profile-card > view {
  flex: 1;
}
.profile-name {
  font-size: 20px;
  font-weight: 750;
  display: block;
}
.profile-motto {
  display: block;
  color: #9c86af;
  font-size: 10px;
  margin: 7px 0 9px;
}
.profile-badge {
  color: #a080be;
  background: #f8f4fc;
  border-radius: 20px;
  padding: 3px 8px;
  font-size: 8px;
}
.profile-shortcuts {
  display: flex;
  padding: 25px 0;
  gap: 15px;
}
.profile-shortcuts button {
  flex: 1;
  background: white;
  margin: 0;
  padding: 17px;
  border: 1px solid #f1eaf7;
  border-radius: 12px;
  line-height: 1.4;
}
.profile-shortcuts button.active {
  border-color: #cab4e7;
}
.profile-shortcuts text:first-child {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #9670c4;
}
.profile-shortcuts text:last-child {
  font-size: 11px;
  color: #a293af;
  margin-top: 5px;
  display: block;
}
.profile-list-note {
  font-size: 10px;
  color: #ada0b9;
}
.order-card {
  background: white;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 13px;
}
.order-heading {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding-bottom: 14px;
}
.order-status {
  color: #aa80d5;
}
.order-product {
  display: flex;
  gap: 13px;
}
.order-product image {
  width: 75px;
  height: 85px;
  border-radius: 10px;
}
.order-product > view {
  flex: 1;
}
.order-title {
  display: block;
  font-size: 12px;
  line-height: 1.7;
}
.order-variant {
  display: block;
  color: #b2a4bd;
  font-size: 10px;
  margin-top: 8px;
}
.order-amount {
  display: block;
  text-align: right;
  font-size: 13px;
  font-weight: 650;
  margin-top: 16px;
}
.order-number {
  display: block;
  font-size: 9px;
  color: #b5a9c1;
  margin-top: 13px;
}
.favorite-card {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px;
  background: white;
  border-radius: 12px;
  margin-bottom: 10px;
}
.favorite-card image {
  width: 65px;
  height: 74px;
  border-radius: 9px;
}
.favorite-card > view {
  flex: 1;
  font-size: 12px;
  line-height: 1.7;
}
.favorite-price {
  display: block;
  color: #df7a9c;
  margin-top: 10px;
}
.reset-button {
  background: transparent;
  font-size: 11px;
  color: #aa99b8;
  margin: 30px auto 0;
  line-height: 1.8;
}
.profile-footnote {
  display: block;
  text-align: center;
  color: #bdb0c8;
  font-size: 9px;
  margin-top: 12px;
}
</style>
