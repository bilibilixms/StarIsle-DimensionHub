<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import { getDemoSession, logoutDemo, openLogin } from '@starisle/shared/auth'
import {
  DEMO_ASSETS,
  money,
  resetLocalDemoState,
  receiveDemoOrder,
  editDemoRecipient,
  type DemoState,
  type DemoOrder,
} from '@starisle/shared/demo'
const props = defineProps<{ state: DemoState }>()
const emit = defineEmits<{ refresh: []; browse: [] }>()
const section = ref<'orders' | 'favorites'>('orders')
const busy = ref('')
const addressSheet = ref(false)
const recipient = ref({ ...props.state.recipient })
const addressError = ref('')
async function logout() {
  try {
    await logoutDemo()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '退出失败，请重试',
      icon: 'none',
    })
  }
}
function openAddress() {
  recipient.value = { ...props.state.recipient }
  addressError.value = ''
  addressSheet.value = true
}
function saveAddress() {
  try {
    editDemoRecipient(recipient.value)
    emit('refresh')
    addressSheet.value = false
  } catch (error) {
    addressError.value = error instanceof Error ? error.message : '请检查收货信息'
  }
}
function receive(order: DemoOrder) {
  if (busy.value) return
  uni.showModal({
    title: '确认收到好物',
    content: '确认后，此演示订单将完成，商家端也会同步更新。',
    confirmText: '确认收货',
    async success(result) {
      if (!result.confirm || busy.value) return
      busy.value = order.id
      try {
        await receiveDemoOrder(order.id)
        emit('refresh')
        uni.showToast({ title: '已确认收货', icon: 'success' })
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
      } finally {
        busy.value = ''
      }
    },
  })
}
function openProduct(id: string) {
  uni.navigateTo({ url: `/pages/product/detail?id=${id}` })
}
function openOrder(id: string) {
  uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(id)}` })
}
function reset() {
  uni.showModal({
    title: '清空本机收藏与购物车',
    content: '清空本机收藏、购物车并恢复演示地址。已支付订单将保留，可在商家端重置共享场景。',
    confirmColor: '#8b5cf6',
    success(result) {
      if (result.confirm) {
        resetLocalDemoState()
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
        <text class="profile-name">{{ getDemoSession()?.account.nickname || '星屿同学' }}</text>
        <text class="profile-motto">今天也要，为热爱心动。</text>
        <text class="profile-badge">星屿体验官</text>
      </view>
      <Icon name="sparkles" tone="purple" :size="30" />
    </view>
    <button
      class="secondary-button address-button"
      data-testid="edit-recipient"
      @click="openAddress"
    >
      演示收货地址：{{ state.recipient.name }} · {{ state.recipient.phone }}
    </button>
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
      <text class="profile-list-note">与商家端同步</text>
    </view>
    <template v-if="section === 'orders'">
      <view
        v-for="order in state.orders"
        :key="order.id"
        class="order-card"
        :data-testid="`user-order-${order.id}`"
        role="button"
        tabindex="0"
        :aria-label="`查看${order.status}订单：${order.title}`"
        @click="openOrder(order.id)"
        @keydown.enter.self="openOrder(order.id)"
      >
        <view class="order-heading">
          <text>{{ order.shopName || state.shop.name }}</text>
          <text class="order-status">{{ order.status }}</text>
        </view>
        <view class="order-product">
          <image :src="order.cover" mode="aspectFill" />
          <view>
            <text class="order-title">{{ order.title }}</text>
            <text class="order-variant">{{ order.variant }} × {{ order.quantity }}</text>
            <text class="order-amount">实付 ¥{{ money(order.amount) }}</text>
          </view>
        </view>
        <text class="order-number">演示订单 {{ order.id }}</text>
        <view v-if="order.carrier && order.tracking" class="order-logistics">
          <text>{{ order.carrier }} · {{ order.tracking }}</text>
          <text>{{ order.shippedAt }} 模拟发货</text>
        </view>
        <button
          v-if="order.status === '待收货'"
          class="secondary-button receive-button"
          :disabled="!!busy"
          :loading="busy === order.id"
          :data-testid="`receive-${order.id}`"
          @click.stop="receive(order)"
        >
          确认收货
        </button>
        <text v-if="order.completedAt" class="order-number">
          {{ order.completedAt }} 已确认收货
        </text>
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
        @click="openProduct(product.id)"
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
    <button class="reset-button" @click="reset">清空本机收藏与购物车</button>
    <button class="secondary-button" data-testid="switch-role" @click="openLogin('merchant')">
      切换身份
    </button>
    <button class="reset-button" data-testid="logout" @click="logout">退出登录</button>
    <text class="profile-footnote">这是一座正在生长的小岛。感谢你来做客。</text>
    <Sheet :visible="addressSheet" title="演示收货地址" @close="addressSheet = false">
      <text class="form-note">用于本地联动演示，请填写虚构信息。</text>
      <text class="form-label">收货人</text>
      <input
        v-model="recipient.name"
        class="form-input"
        aria-label="收货人"
        data-testid="recipient-name"
        maxlength="30"
      />
      <text class="form-label">手机号</text>
      <input
        v-model="recipient.phone"
        class="form-input"
        aria-label="手机号"
        data-testid="recipient-phone"
        maxlength="11"
        type="number"
      />
      <text class="form-label">收货地址</text>
      <input
        v-model="recipient.address"
        class="form-input"
        aria-label="收货地址"
        data-testid="recipient-address"
        maxlength="200"
      />
      <text v-if="addressError" class="form-error">{{ addressError }}</text>
      <button class="primary-button" data-testid="save-recipient" @click="saveAddress">
        保存演示地址
      </button>
    </Sheet>
  </view>
</template>

<style scoped>
.address-button {
  margin: 16px 0;
  width: 100%;
  font-size: 11px;
}
.order-logistics {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 12px;
  color: #a08aaf;
  font-size: 10px;
  line-height: 1.7;
}
.receive-button {
  margin: 12px 0 0 auto;
  width: fit-content;
}
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
