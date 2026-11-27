<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import OrderItems from './OrderItems.vue'
import OrderReviews from './OrderReviews.vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import { springMarketplaceEnabled } from '@starisle/shared/auth'
import {
  getDemoState,
  money,
  receiveDemoOrder,
  requestDemoRefund,
  cancelDemoRefund,
  returnDemoRefund,
  REFUND_STATUS_LABELS,
} from '@starisle/shared/demo'

const { state, sync, connected, syncing, syncError } = useDemoSync()
const props = defineProps<{ id: string; action?: string }>()
const id = computed(() => props.id)
const busy = ref(false)
const actionError = ref('')
const refundReason = ref('')
const refundType = ref<'REFUND_ONLY' | 'RETURN_REFUND'>('REFUND_ONLY')
const returnCarrier = ref('顺丰速运')
const returnTracking = ref('')
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
const order = computed(() => state.value.orders.find((order) => order.id === id.value))
const statusCopy = computed(() => {
  if (order.value?.status === '退款中')
    return REFUND_STATUS_LABELS[order.value.refund?.status || 'PENDING']
  if (order.value?.status === '已退款') return '整单模拟退款已完成。'
  if (order.value?.status === '已完成') return '你已确认收货，订单已完成。'
  if (order.value?.status === '待收货') return '商家已发货，请留意下方物流信息。'
  return '模拟支付成功，等待商家发货。'
})
const progress = computed(() => {
  if (!order.value) return []
  const current = order.value
  const events = [{ title: '模拟支付成功', time: current.createdAt }]
  if (current.shippedAt)
    events.push({ title: '商家已发货', time: current.shippedAt || '时间未记录' })
  if (
    current.completedAt ||
    current.status === '已完成' ||
    current.refund?.originalStatus === '已完成'
  )
    events.push({ title: '确认收货，订单完成', time: current.completedAt || '时间未记录' })
  for (const refund of [
    ...(current.refundHistory || []),
    ...(current.refund ? [current.refund] : []),
  ]) {
    events.push({ title: '申请整单退款', time: refund.requestedAt })
    if (refund.acceptedAt) events.push({ title: '商家同意退货', time: refund.acceptedAt })
    if (refund.returnedAt) events.push({ title: '用户寄回商品', time: refund.returnedAt })
    if (refund.resolvedAt)
      events.push({
        title: REFUND_STATUS_LABELS[refund.status],
        time: refund.resolvedAt,
      })
  }
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
function openProduct(productId: string) {
  uni.navigateTo({ url: `/pages/product/detail?id=${encodeURIComponent(productId)}` })
}
async function requestRefund() {
  if (!order.value || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    state.value = await requestDemoRefund(
      order.value.id,
      refundReason.value,
      order.value.status === '待发货' ? 'REFUND_ONLY' : refundType.value,
    )
    refundReason.value = ''
    uni.showToast({ title: '退款申请已提交', icon: 'success' })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '申请失败，请重试'
  } finally {
    busy.value = false
  }
}
async function returnOrCancel(cancel: boolean) {
  if (!order.value || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    const current = order.value
    state.value = cancel
      ? await cancelDemoRefund(current.id, current.refund?.id)
      : await returnDemoRefund(
          current.id,
          returnCarrier.value,
          returnTracking.value,
          current.refund?.id,
        )
    uni.showToast({ title: cancel ? '售后申请已撤销' : '退货物流已提交', icon: 'success' })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '操作失败，请重试'
  } finally {
    busy.value = false
  }
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
  <view
    class="app-screen order-screen"
    :class="{ 'shortcut-screen': !!action, 'focus-aftersale': action === 'aftersale' }"
  >
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
        <OrderItems :order="order" detail @open="openProduct" />
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
          <view v-if="order.completedAt" class="detail-row">
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
            :key="index"
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
        <view v-if="!springMarketplaceEnabled" id="order-review-section">
          <OrderReviews
            :order="order"
            :reviews="state.reviews"
            :auto-open="action === 'review'"
            @updated="state = $event"
          />
        </view>
        <view v-if="order.refundHistory?.length" class="receipt-section">
          <text class="section-title">历史售后申请</text>
          <view v-for="(past, index) in order.refundHistory" :key="past.id || index">
            <text class="section-note">
              {{ past.requestedAt }} · {{ REFUND_STATUS_LABELS[past.status] }}
            </text>
            <text class="section-note">
              {{ past.reason }}{{ past.reply ? ' · ' + past.reply : '' }}
            </text>
          </view>
        </view>
        <view id="order-aftersale-section">
          <view v-if="order.refund" class="receipt-section" data-testid="refund-record">
            <text class="section-title">
              退款记录 ·
              {{ REFUND_STATUS_LABELS[order.refund.status] }}
            </text>
            <text class="section-note">
              售后类型：{{ order.refund.type === 'RETURN_REFUND' ? '退货退款' : '仅退款' }} · ¥{{
                money(order.amount)
              }}
            </text>
            <text class="section-note">申请原因：{{ order.refund.reason }}</text>
            <text v-if="order.refund.reply" class="section-note">
              商家回复：{{ order.refund.reply }}
            </text>
          </view>
          <view v-if="order.status === '退款中' && order.refund" class="receipt-section">
            <template v-if="order.refund.status === 'WAIT_RETURN' && order.refund.returnAddress">
              <text class="section-title">请按商家地址寄回商品</text>
              <text class="section-note" data-testid="return-address">
                {{ order.refund.returnAddress.name }} · {{ order.refund.returnAddress.phone }} ·
                {{ order.refund.returnAddress.address }}
              </text>
              <input
                v-model="returnCarrier"
                class="refund-field"
                maxlength="30"
                placeholder="退货物流公司"
                aria-label="退货物流公司"
                data-testid="return-carrier"
              />
              <input
                v-model="returnTracking"
                class="refund-field"
                maxlength="24"
                placeholder="退货物流单号"
                aria-label="退货物流单号"
                data-testid="return-tracking"
              />
              <button
                class="primary-button"
                :disabled="busy || !returnTracking.trim()"
                data-testid="submit-return"
                @click="returnOrCancel(false)"
              >
                我已寄出，提交物流
              </button>
            </template>
            <text
              v-if="order.refund.returnTracking"
              class="section-note"
              data-testid="return-logistics"
            >
              退货物流：{{ order.refund.returnCarrier }} · {{ order.refund.returnTracking }}
            </text>
            <button
              v-if="['PENDING', 'WAIT_RETURN'].includes(order.refund.status)"
              class="secondary-button list-button"
              :disabled="busy"
              data-testid="cancel-refund"
              @click="returnOrCancel(true)"
            >
              撤销售后申请
            </button>
          </view>
          <view
            v-if="['待发货', '待收货', '已完成'].includes(order.status)"
            class="receipt-section"
          >
            <text class="section-title">
              {{ order.status === '已完成' ? '申请售后' : '退款 / 售后' }}
            </text>
            <view v-if="order.status !== '待发货'" class="refund-types">
              <button
                class="secondary-button"
                :class="{ selected: refundType === 'REFUND_ONLY' }"
                data-testid="refund-only"
                @click="refundType = 'REFUND_ONLY'"
              >
                仅退款
              </button>
              <button
                class="secondary-button"
                :class="{ selected: refundType === 'RETURN_REFUND' }"
                data-testid="return-refund"
                @click="refundType = 'RETURN_REFUND'"
              >
                退货退款
              </button>
            </view>
            <text class="section-note">
              整单退款金额：¥{{ money(order.amount) }}。{{
                order.status === '待发货' || refundType === 'REFUND_ONLY'
                  ? '无需寄回商品，等待商家审核。'
                  : '商家同意后，按提供的地址寄回商品。'
              }}
            </text>
            <textarea
              v-model="refundReason"
              maxlength="200"
              class="refund-input"
              placeholder="请填写退款原因（最多 200 字）"
              aria-label="退款原因"
              data-testid="refund-reason"
            />
            <button
              class="secondary-button list-button"
              :disabled="busy || !refundReason.trim()"
              :loading="busy"
              data-testid="request-refund"
              @click="requestRefund"
            >
              申请整单模拟退款
            </button>
            <text class="section-note">
              提交后暂停订单履约，等待商家处理；模拟退款不会产生实际资金变动。
            </text>
          </view>
        </view>
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
.shortcut-screen {
  display: flex;
  flex-direction: column;
}
.shortcut-screen .order-actions {
  order: 1;
  display: flex;
  flex-direction: column;
}
.shortcut-screen .receipt {
  order: 2;
  padding-bottom: 20px;
}
.focus-aftersale #order-aftersale-section {
  order: -1;
}

.refund-types {
  display: flex;
  gap: 12px;
  margin: 12px 0;
}
.refund-types button {
  flex: 1;
}
.refund-types .selected {
  border-color: #8b5cf6;
  background: #f3edff;
}
.refund-field {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid #e8e0ef;
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
}

.refund-input {
  box-sizing: border-box;
  width: 100%;
  height: 90px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e8e0ef;
  border-radius: 10px;
  font-size: 13px;
}
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
