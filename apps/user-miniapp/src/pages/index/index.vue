<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { createApiClient, type Product } from '@starisle/shared'

const api = createApiClient(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080')
const keyword = ref('')
const products = ref<Product[]>([])
const loading = ref(false)
const error = ref('')
const total = ref(0)
let requestId = 0

async function search() {
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await api.products(keyword.value.trim())
    if (current === requestId) {
      products.value = result.items
      total.value = result.total
    }
  } catch (cause) {
    if (current === requestId) error.value = cause instanceof Error ? cause.message : '暂时无法加载商品'
  } finally {
    if (current === requestId) loading.value = false
  }
}
onLoad(() => { void search() })
</script>

<template>
  <view class="home">
    <view class="masthead">
      <text class="brand">星屿 ✦</text>
      <text class="brand-note">给热爱一座小岛</text>
    </view>
    <view class="intro">
      <text class="intro-title">发现你的下一份心动</text>
      <text class="intro-copy">周边、创作与收藏，在这里相遇。</text>
    </view>
    <view class="search-bar">
      <input v-model="keyword" class="search-input" maxlength="100" placeholder="寻找喜欢的周边" confirm-type="search" aria-label="搜索商品" @confirm="search" />
      <button class="search-button" @click="search">搜索</button>
    </view>
    <view class="section-title">
      <text>岛上好物</text>
      <text v-if="!loading && !error" class="count">{{ total }} 件商品</text>
    </view>
    <view v-if="loading" class="message"><text>正在寻找好物…</text></view>
    <view v-else-if="error" class="message">
      <text>{{ error }}</text>
      <button class="retry-button" @click="search">重新加载</button>
    </view>
    <view v-else-if="products.length === 0" class="message empty">
      <text class="empty-symbol">✧</text>
      <text class="empty-title">{{ keyword.trim() ? '还没有找到相关商品' : '好物正在准备中' }}</text>
      <text class="empty-copy">{{ keyword.trim() ? '换个关键词，再找找看。' : '等小店上新，再来岛上逛逛。' }}</text>
    </view>
    <view v-else class="product-grid">
      <view v-for="product in products" :key="product.id" class="product">
        <image v-if="product.coverUrl" class="product-cover" :src="product.coverUrl" mode="aspectFill" />
        <view v-else class="product-cover product-placeholder"><text>星屿</text></view>
        <view class="product-info">
          <text class="product-title">{{ product.title }}</text>
          <text class="shop-name">{{ product.shopName }}</text>
          <text class="price">¥ {{ product.price }}</text>
        </view>
      </view>
    </view>
    <text v-if="!loading && !error && total > products.length" class="page-note">先看看最新的 {{ products.length }} 件好物，也可以搜索你喜欢的商品。</text>
  </view>
</template>

<style scoped>
.home { max-width: 920px; margin: 0 auto; padding: 44rpx 32rpx 80rpx; }
.masthead, .section-title { display: flex; align-items: center; justify-content: space-between; }
.brand { color: #355f8a; font-size: 48rpx; font-weight: 800; letter-spacing: 5rpx; }
.brand-note { color: #62758a; font-size: 23rpx; }
.intro { margin: 58rpx 0 34rpx; }
.intro-title { display: block; font-size: 43rpx; font-weight: 700; line-height: 1.5; }
.intro-copy { display: block; margin-top: 14rpx; font-size: 27rpx; color: #62758a; }
.search-bar { display: flex; align-items: center; gap: 16rpx; padding: 10rpx 10rpx 10rpx 24rpx; background: #fff; border: 2rpx solid #cdddea; border-radius: 18rpx; }
.search-input { flex: 1; min-width: 0; font-size: 28rpx; height: 72rpx; }
.search-button { margin: 0; padding: 0 28rpx; color: #fff; background: #355f8a; font-size: 26rpx; line-height: 72rpx; border-radius: 12rpx; }
.section-title { margin: 52rpx 0 24rpx; font-size: 33rpx; font-weight: 700; }
.count { font-size: 24rpx; font-weight: 400; color: #62758a; }
.message { min-height: 340rpx; padding: 32rpx; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 20rpx; text-align: center; color: #62758a; }
.empty-symbol { color: #e8618e; font-size: 100rpx; line-height: 1.2; }
.empty-title { color: #263449; font-size: 32rpx; font-weight: 600; }
.empty-copy, .page-note { color: #62758a; font-size: 25rpx; line-height: 1.8; }
.retry-button { color: #355f8a; background: #e1edf7; font-size: 26rpx; }
.product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24rpx; }
.product { overflow: hidden; background: #fff; border-radius: 18rpx; }
.product-cover { display: block; width: 100%; height: 300rpx; }
.product-placeholder { display: flex; align-items: center; justify-content: center; background: #e1edf7; color: #355f8a; font-size: 40rpx; letter-spacing: 8rpx; }
.product-info { padding: 22rpx; }
.product-title { display: block; font-size: 28rpx; font-weight: 600; line-height: 1.6; word-break: break-all; }
.shop-name { display: block; color: #62758a; font-size: 23rpx; margin: 10rpx 0 20rpx; }
.price { color: #b93965; font-size: 32rpx; font-weight: 700; }
.page-note { display: block; margin-top: 28rpx; }
</style>
