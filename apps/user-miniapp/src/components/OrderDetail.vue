<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import { getDemoState, money, receiveDemoOrder } from '@starisle/shared/demo'

const { state, sync, connected, syncing, syncError } = useDemoSync()
const props = defineProps<{ id: string }>()
const id = computed(() => props.id)
const busy = ref(false)
const actionError = ref('')
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
const order = computed(() => state.value.orders.find((order) => order.id === id.value))
const statusCopy = computed(() => {
  if (order.value?.status === '已完成') return '你已确认收货，订单已完成。'
  if (order.value?.status === '待收货') return '商家已发货，请留意下方物流信息。'
  return '模拟支付成功，等待商家发货。'
})
const progress = computed(() => {
  if (!order.value) return []
  const current = order.value
  const events = [{ title: '模拟支付成功', time: current.createdAt }]
  if (current.status !== '待发货')
    events.push({ title: '商家已发货', time: current.shippedAt || '时间未记录' })
  if (current.status === '已完成')
    events.push({ title: '确认收货，订单完成', time: current.completedAt || '时间未记录' })
  return events.reverse()
})

function orders() {
  uni.reLaunch({ url: '/pages/index/index?tab=profile' })
}
function back() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else orders()
}
function copyNumber() {
  if (order.value) uni.setClipboardData({ data: order.value.id })
}
function openProduct() {
  if (order.value)
    uni.navigateTo({ url: `/pages/product/detail?id=${encodeURIComponent(order.value.productId)}` })
}
function receive() {
  if (!order.value || order.value.status !== '待收货' || busy.value) return
  const orderId = order.value.id
  uni.showModal({
    title: '确认收到好物',
    content: '确认后，此演示订单将完成，商家端也会同步更新。',
    confirmText: '确认收货',
    confirmColor: '#8b5cf6',
    async success(result) {
      if (!result.confirm || busy.value) return
      busy.value = true
      actionError.value = ''
      try {
        state.value = await receiveDemoOrder(orderId)
        uni.showToast({ title: '已确认收货', icon: 'success' })
      } catch (error) {
        state.value = getDemoState()
        actionError.value = error instanceof Error ? error.message : '操作失败，请稍后重试'
      } finally {
        busy.value = false
      }
    },
  })
}
</script>

<template>
  <view class="app-screen order-screen">
    <view class="order-nav" :style="{ paddingTop: `${statusHeight}px` }">
      <view class="nav-content">
        <button class="icon-button" aria-label="返回订单" data-testid="order-back" @click="back">
          <Icon name="chevron-left" tone="ink" :size="20" />
        </button>
        <text class="nav-title">订单详情</text>
        <text class="demo-label">演示</text>
      </view>
    </view>
    <SyncStatus :connected="connected" :syncing="syncing" :error="syncError" @retry="sync" />
    <template v-if="order">
      <view class="status-summary">
        <view class="status-emblem" :class="{ completed: order.status === '已完成' }">
          <Icon v-if="order.status === '已完成'" name="check" tone="white" :size="24" />
          <Icon
            v-else
            :name="order.status === '待收货' ? 'truck' : 'receipt'"
            tone="purple"
            :size="26"
          />
        </view>
        <view>
          <text class="status-title" data-testid="order-detail-status">{{ order.status }}</text>
          <text class="status-copy">{{ statusCopy }}</text>
        </view>
      </view>
      <view class="receipt">
        <view class="shop-heading">
          <Icon name="bag" tone="purple" :size="17" />
          <text data-testid="order-detail-shop">{{ order.shopName || state.shop.name }}</text>
        </view>
        <button
          class="purchased-product"
          :aria-label="`查看商品：${order.title}`"
          data-testid="order-detail-product"
          @click="openProduct"
        >
          <image :src="order.cover" mode="aspectFill" class="product-cover" />
          <view class="product-description">
            <text class="product-title" data-testid="order-detail-title">{{ order.title }}</text>
            <text class="product-variant">{{ order.variant }} × {{ order.quantity }}</text>
            <text class="unit-price">单价 ¥{{ money(order.amount / order.quantity) }}</text>
          </view>
          <Icon name="chevron-right" :size="14" />
        </button>
        <view class="amounts">
          <view class="detail-row">
            <text>商品金额</text>
            <text>¥{{ money(order.amount) }}</text>
          </view>
          <view class="detail-row">
            <text>运费</text>
            <text>免运费</text>
          </view>
          <view class="paid-row">
            <text>实付款（模拟）</text>
            <text data-testid="order-detail-amount">¥{{ money(order.amount) }}</text>
          </view>
        </view>
        <view class="receipt-section">
          <text class="section-title">收货信息</text>
          <text class="recipient-name">
            {{ order.recipient.name }}
            <text class="recipient-phone">{{ order.recipient.phone }}</text>
          </text>
          <text class="recipient-address" data-testid="order-detail-address">
            {{ order.recipient.address }}
          </text>
        </view>
        <view class="receipt-section">
          <text class="section-title">物流信息</text>
          <template v-if="order.carrier && order.tracking">
            <view class="detail-row">
              <text>物流公司</text>
              <text>{{ order.carrier }}</text>
            </view>
            <view class="detail-row">
              <text>物流单号</text>
              <text data-testid="order-detail-tracking">{{ order.tracking }}</text>
            </view>
            <text class="section-note">此处为模拟物流记录。</text>
          </template>
          <text v-else class="section-note">
            {{
              order.status === '待发货'
                ? '商家发货后会显示物流公司和单号。'
                : '此订单未记录物流信息。'
            }}
          </text>
        </view>
        <view class="receipt-section">
          <text class="section-title">订单记录</text>
          <view class="detail-row number-row">
            <text>订单编号</text>
            <view class="order-number">
              <text data-testid="order-detail-id">{{ order.id }}</text>
              <button class="copy-button" @click="copyNumber">复制</button>
            </view>
          </view>
          <view class="detail-row">
            <text>下单时间</text>
            <text>{{ order.createdAt }}</text>
          </view>
          <view v-if="order.shippedAt" class="detail-row">
            <text>发货时间</text>
            <text>{{ order.shippedAt }}</text>
          </view>
          <view v-if="order.status === '已完成'" class="detail-row">
            <text>完成时间</text>
            <text data-testid="order-detail-completed-at">
              {{ order.completedAt || '时间未记录' }}
            </text>
          </view>
        </view>
        <view class="receipt-section">
          <text class="section-title">订单进度</text>
          <view
            v-for="(event, index) in progress"
            :key="event.title"
            class="progress-event"
            :class="{ latest: index === 0 }"
          >
            <view class="progress-marker" />
            <view>
              <text class="progress-title">{{ event.title }}</text>
              <text class="progress-time">{{ event.time }}</text>
            </view>
          </view>
        </view>
      </view>
      <view class="order-actions">
        <text v-if="actionError" class="form-error" data-testid="order-detail-error">
          {{ actionError }}
        </text>
        <button
          v-if="order.status === '待收货'"
          class="primary-button"
          :disabled="busy"
          :loading="busy"
          data-testid="order-detail-receive"
          @click="receive"
        >
          确认收货
        </button>
        <button
          class="secondary-button list-button"
          data-testid="order-detail-list"
          @click="orders"
        >
          返回我的订单
        </button>
        <text class="record-note">按下单时的信息保留本次交易记录。</text>
      </view>
    </template>
    <view v-else-if="syncError" class="empty-state">
      <Icon name="receipt" tone="purple" :size="36" />
      <text class="empty-title">暂时无法读取订单</text>
      <text class="empty-copy">请连接演示服务后重试。</text>
      <button class="secondary-button" :disabled="syncing" @click="sync">重试</button>
    </view>
    <view v-else-if="!connected" class="empty-state"><text>正在读取订单…</text></view>
    <view v-else class="empty-state" data-testid="order-detail-missing">
      <Icon name="receipt" tone="purple" :size="36" />
      <text class="empty-title">未找到这笔订单</text>
      <text class="empty-copy">订单可能已被重置，返回我的订单查看。</text>
      <button class="secondary-button" @click="orders">返回我的订单</button>
    </view>
  </view>
</template>

<style scoped>
.order-screen {
  padding-bottom: calc(30px + env(safe-area-inset-bottom));
}
.order-nav {
  background: #fbfaff;
}
.nav-content {
  height: 64px;
  padding: 0 20px 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-title {
  flex: 1;
  font-size: 17px;
  font-weight: 650;
}
.demo-label {
  color: #715a89;
  background: #f0ebf7;
  font-size: 10px;
  padding: 3px 7px;
  border-radius: 5px;
}
.status-summary {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 21px 24px 25px;
}
.status-emblem {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #eee5f8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.status-emblem.completed {
  background: #648f7c;
}
.status-title {
  display: block;
  color: #6541a5;
  font-size: 23px;
  font-weight: 750;
}
.status-copy {
  display: block;
  margin-top: 6px;
  color: #786780;
  font-size: 11px;
  line-height: 1.8;
}
.receipt {
  margin: 0 20px;
  padding: 20px 17px 0;
  background: #fff;
  border: 1px solid #eee8f4;
  border-radius: 16px;
}
.shop-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 19px;
  font-size: 13px;
  font-weight: 600;
}
.purchased-product {
  display: flex;
  gap: 14px;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  line-height: normal;
  text-align: left;
  cursor: pointer;
}
.product-cover {
  width: 82px;
  height: 94px;
  flex-shrink: 0;
  border-radius: 10px;
}
.product-description {
  flex: 1;
  min-width: 0;
}
.product-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.8;
}
.product-variant {
  display: block;
  color: #786780;
  font-size: 11px;
  margin-top: 8px;
}
.unit-price {
  display: block;
  font-size: 12px;
  margin-top: 12px;
}
.amounts {
  padding: 15px 0 19px;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 6px 0;
  color: #7c6d89;
  font-size: 11px;
  line-height: 1.8;
}
.detail-row > text:first-child {
  flex-shrink: 0;
  color: #786780;
}
.detail-row > text:last-child {
  min-width: 0;
  text-align: right;
  word-break: break-all;
}
.paid-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 11px;
  font-size: 12px;
}
.paid-row > text:last-child {
  color: #df7499;
  font-size: 24px;
  font-weight: 750;
}
.receipt-section {
  padding: 20px 0;
  border-top: 1px dashed #e8e0ef;
}
.section-title {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 650;
}
.recipient-name {
  display: block;
  font-size: 13px;
  font-weight: 550;
}
.recipient-phone {
  margin-left: 12px;
  font-size: 11px;
  font-weight: 400;
  color: #786780;
}
.recipient-address {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: #7c6d89;
  line-height: 1.9;
  word-break: break-all;
}
.section-note {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: #786780;
  line-height: 1.8;
}
.order-number {
  flex: 1;
  min-width: 0;
  text-align: right;
}
.order-number > text {
  word-break: break-all;
}
.copy-button {
  margin: 3px 0 0 auto;
  padding: 0 7px;
  width: fit-content;
  background: #f3edf9;
  color: #9670c4;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.9;
}
.progress-event {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 0 0 20px 3px;
}
.progress-event:last-child {
  padding-bottom: 0;
}
.progress-event:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 11px;
  bottom: 0;
  left: 6px;
  width: 1px;
  background: #eee7f5;
}
.progress-marker {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  margin-top: 6px;
  border-radius: 50%;
  background: #d9cbe7;
}
.latest .progress-marker {
  background: #9976c4;
}
.progress-title {
  display: block;
  color: #786780;
  font-size: 11px;
  line-height: 1.8;
}
.latest .progress-title {
  color: #71528f;
  font-weight: 600;
}
.progress-time {
  display: block;
  color: #786780;
  font-size: 10px;
  margin-top: 4px;
}
.order-actions {
  padding: 20px;
}
.list-button {
  width: 100%;
  margin-top: 12px;
}
.record-note {
  display: block;
  margin-top: 18px;
  text-align: center;
  color: #786780;
  font-size: 10px;
  line-height: 1.8;
}
/* #ifdef MP-WEIXIN */
.nav-content {
  padding-right: 110px;
}
/* #endif */
</style>
