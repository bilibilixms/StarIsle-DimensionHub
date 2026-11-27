<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import AddressEditor from './AddressEditor.vue'
import OrderItems from './OrderItems.vue'
import { getDemoSession, logoutDemo, openLogin, springMarketplaceEnabled } from '@starisle/shared/auth'
import {
  DEMO_ASSETS,
  money,
  orderItems,
  reviewItemKey,
  receiveDemoOrder,
  editDemoRecipient,
  type DemoState,
  type DemoOrder,
  type DemoRecipient,
} from '@starisle/shared/demo'
const props = defineProps<{ state: DemoState }>()
const emit = defineEmits<{ refresh: []; browse: [] }>()
const section = ref<'orders' | 'favorites'>('orders')
const busy = ref('')
const addressSheet = ref(false)
const recipient = ref({ ...props.state.recipient })
const editingAddressId = ref<string | null>(null)
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
  editingAddressId.value = props.state.defaultAddressId || null
  recipient.value = props.state.addresses.length
    ? { ...props.state.recipient }
    : { name: '', phone: '', address: '' }
  addressSheet.value = true
}
function saveAddress(value: DemoRecipient) {
  try {
    editDemoRecipient(value, editingAddressId.value)
    emit('refresh')
    addressSheet.value = false
  } catch (cause) {
    uni.showToast({
      title: cause instanceof Error ? cause.message : '地址保存失败，请重试',
      icon: 'none',
    })
  }
}
function manageAddresses() {
  uni.navigateTo({ url: '/pages/address/index' })
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
function openOrder(id: string, action?: 'review' | 'aftersale') {
  uni.navigateTo({
    url: `/pages/order/detail?id=${encodeURIComponent(id)}${action ? '&action=' + action : ''}`,
  })
}
function hasReviews(order: DemoOrder) {
  return props.state.reviews.some((review) => review.orderId === order.id)
}
function allReviewed(order: DemoOrder) {
  return orderItems(order).every((item) =>
    props.state.reviews.some(
      (review) => review.orderId === order.id && review.itemKey === reviewItemKey(item),
    ),
  )
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
      {{
        state.addresses.length
          ? `演示收货地址：${state.recipient.name} · ${state.recipient.phone}`
          : '添加收货地址'
      }}
    </button>
    <button class="secondary-button" data-testid="manage-addresses" @click="manageAddresses">
      管理收货地址（{{ state.addresses.length }}）
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
        <OrderItems :order="order" compact />
        <text class="order-amount">实付 ¥{{ money(order.amount) }}</text>
        <text class="order-number">演示订单 {{ order.id }}</text>
        <view v-if="order.carrier && order.tracking" class="order-logistics">
          <text>{{ order.carrier }} · {{ order.tracking }}</text>
          <text>{{ order.shippedAt }} 模拟发货</text>
        </view>
        <text v-if="order.completedAt" class="order-number">
          {{ order.completedAt }} 已确认收货
        </text>
        <view class="order-card-actions" @click.stop>
          <button
            v-if="['待发货', '待收货', '已完成', '退款中', '已退款'].includes(order.status)"
            class="secondary-button order-card-action"
            :data-testid="`aftersale-${order.id}`"
            @click.stop="openOrder(order.id, 'aftersale')"
          >
            {{
              order.status === '退款中'
                ? '售后进度'
                : order.status === '已退款'
                  ? '退款详情'
                  : '申请售后'
            }}
          </button>
          <button
            v-if="!springMarketplaceEnabled && (order.status === '已完成' || hasReviews(order))"
            class="secondary-button order-card-action review-action"
            :data-testid="`review-order-${order.id}`"
            @click.stop="openOrder(order.id, 'review')"
          >
            {{
              allReviewed(order) ? '查看评价' : order.status === '已完成' ? '去评价' : '查看评价'
            }}
          </button>
          <button
            v-if="order.status === '待收货'"
            class="secondary-button order-card-action review-action"
            :disabled="!!busy"
            :loading="busy === order.id"
            :data-testid="`receive-${order.id}`"
            @click.stop="receive(order)"
          >
            确认收货
          </button>
        </view>
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
    <view class="profile-actions">
      <button class="secondary-button" data-testid="switch-role" @click="openLogin('merchant')">
        切换身份
      </button>
      <button class="secondary-button logout-button" data-testid="logout" @click="logout">
        退出登录
      </button>
    </view>
    <text class="profile-footnote">这是一座正在生长的小岛。感谢你来做客。</text>
    <Sheet :visible="addressSheet" title="演示收货地址" @close="addressSheet = false">
      <AddressEditor
        :value="recipient"
        :show-default="false"
        label="保存演示地址"
        @save="saveAddress"
      />
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
.order-card-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 16px;
}
.order-card-actions .order-card-action {
  width: auto;
  min-height: 34px;
  margin: 0;
  padding: 7px 13px;
  border-radius: 18px;
  font-size: 12px;
}
.order-card-actions .review-action {
  color: #7a51b9;
  border-color: #b99bdb;
  background: #faf7ff;
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
.profile-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 30px;
}
.profile-actions .secondary-button {
  width: 100%;
  box-sizing: border-box;
}
.profile-actions .logout-button {
  color: #c93645;
  border-color: #edc4ca;
}
.profile-footnote {
  display: block;
  text-align: center;
  color: #bdb0c8;
  font-size: 9px;
  margin-top: 12px;
}
</style>
