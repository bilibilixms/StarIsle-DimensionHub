<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import Icon from '@starisle/ui/Icon.vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import {
  getCheckoutDraft,
  checkoutPending,
  checkoutProblem,
  refreshCheckoutDraft,
  submitCheckout,
  syncDemoState,
  money,
  stockMessage,
  type CheckoutDraft,
  type CheckoutPreviewItem,
} from '@starisle/shared/demo'
const props = defineProps<{ id: string }>()
const { state, refresh, sync, connected, syncing, syncError } = useDemoSync()
const draft = ref<CheckoutDraft>()
const busy = ref(false)
const error = ref('')
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
function load() {
  draft.value = getCheckoutDraft(props.id)
}
watch(() => props.id, load, { immediate: true })
watch(state, load)
onShow(load)
const pending = computed(() => {
  void state.value
  return !!draft.value && checkoutPending(draft.value)
})
const problem = computed(() => (draft.value ? checkoutProblem(draft.value, state.value) : ''))
const groups = computed(() => {
  const result = new Map<
    string,
    { id: string; name: string; items: CheckoutPreviewItem[]; amount: number }
  >()
  for (const item of draft.value?.items || []) {
    const group = result.get(item.shopId) || {
      id: item.shopId,
      name: item.shopName,
      items: [],
      amount: 0,
    }
    group.items.push(item)
    group.amount += item.amount
    result.set(item.shopId, group)
  }
  return [...result.values()]
})
const amount = computed(
  () =>
    draft.value?.command.items.reduce((sum, item) => sum + item.quantity * item.expectedPrice, 0) ||
    0,
)
const quantity = computed(
  () => draft.value?.command.items.reduce((sum, item) => sum + item.quantity, 0) || 0,
)
const results = computed(() =>
  (draft.value?.orderIds || [])
    .map((id) => state.value.orders.find((order) => order.id === id))
    .filter((order) => !!order),
)
function orders() {
  uni.reLaunch({ url: '/pages/index/index?tab=profile' })
}
function back() {
  if (busy.value) return
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index?tab=cart' })
}
function openOrder(id: string) {
  uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(id)}` })
}
function chooseAddress() {
  if (!draft.value || pending.value || busy.value) return
  uni.navigateTo({
    url: `/pages/address/index?draftId=${encodeURIComponent(draft.value.id)}${state.value.addresses.length ? '' : '&add=1'}`,
  })
}
async function update() {
  if (busy.value || pending.value) return
  busy.value = true
  error.value = ''
  try {
    await syncDemoState()
    refresh()
    draft.value = refreshCheckoutDraft(props.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请检查商品信息'
  } finally {
    busy.value = false
  }
}
async function pay() {
  if (busy.value || !draft.value || draft.value.orderIds.length) return
  busy.value = true
  error.value = ''
  try {
    await syncDemoState()
    refresh()
    load()
    if (!draft.value) throw new Error('待确认订单已失效，请重新选择商品')
    const issue = checkoutProblem(draft.value)
    if (issue) throw new Error(issue)
    draft.value = await submitCheckout(props.id)
    refresh()
    load()
    if (draft.value?.orderIds.length === 1)
      uni.redirectTo({
        url: `/pages/order/detail?id=${encodeURIComponent(draft.value.orderIds[0]!)}`,
      })
  } catch (cause) {
    refresh()
    load()
    error.value = cause instanceof Error ? cause.message : '下单失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <view class="app-screen checkout-screen" data-testid="checkout-page">
    <view class="checkout-nav" :style="{ paddingTop: `${statusHeight + 10}px` }">
      <button
        class="icon-button"
        :disabled="busy"
        aria-label="返回"
        data-testid="checkout-back"
        @click="back"
      >
        <Icon name="chevron-left" tone="ink" :size="20" />
      </button>
      <text>{{ draft?.orderIds.length ? '支付成功' : '确认订单' }}</text>
    </view>
    <SyncStatus :connected="connected" :syncing="syncing" :error="syncError" @retry="sync" />
    <view v-if="!draft" class="empty-state" data-testid="checkout-missing">
      <Icon name="receipt" tone="purple" :size="40" />
      <text class="empty-title">没有待确认的订单</text>
      <text class="empty-copy">请重新选择喜欢的商品。</text>
      <button class="secondary-button" @click="orders">返回我的订单</button>
    </view>
    <view v-else-if="draft.orderIds.length" class="checkout-result" data-testid="checkout-result">
      <view class="result-emblem"><Icon name="check" tone="white" :size="30" /></view>
      <text class="result-title">模拟支付成功</text>
      <text class="result-copy">
        已按店铺生成 {{ draft.orderIds.length }} 笔订单，共 {{ quantity }} 件商品。
      </text>
      <text class="result-total">实付 ¥{{ money(amount) }}</text>
      <button
        v-for="order in results"
        :key="order.id"
        class="result-order"
        :data-testid="`checkout-order-${order.id}`"
        @click="openOrder(order.id)"
      >
        <view>
          <text>{{ order.shopName }}</text>
          <text>{{ order.status }} · 共 {{ order.quantity }} 件</text>
        </view>
        <text>¥{{ money(order.amount) }}</text>
        <Icon name="chevron-right" tone="purple" :size="16" />
      </button>
      <button class="primary-button" data-testid="checkout-result-orders" @click="orders">
        查看全部订单
      </button>
    </view>
    <template v-else>
      <view class="checkout-content">
        <button
          class="checkout-address"
          :disabled="pending || busy"
          data-testid="checkout-address"
          @click="chooseAddress"
        >
          <Icon name="pin" tone="purple" :size="24" />
          <view v-if="draft.addressId || pending" class="address-copy">
            <text>
              {{ draft.command.recipient.name }}
              <text>{{ draft.command.recipient.phone }}</text>
            </text>
            <text data-testid="checkout-address-text">{{ draft.command.recipient.address }}</text>
          </view>
          <view v-else class="address-copy">
            <text>选择收货地址</text>
            <text>添加或选择本次订单的收货信息</text>
          </view>
          <Icon v-if="!pending" name="chevron-right" tone="purple" :size="16" />
        </button>
        <view
          v-for="group in groups"
          :key="group.id"
          class="checkout-shop"
          :data-testid="`checkout-shop-${group.id}`"
        >
          <view class="checkout-shop-name">
            <Icon name="bag" tone="purple" :size="18" />
            <text>{{ group.name }}</text>
          </view>
          <view
            v-for="item in group.items"
            :key="`${item.productId}-${item.variantKey}`"
            class="checkout-item"
            :data-testid="`checkout-item-${item.productId}`"
          >
            <image :src="item.cover" mode="aspectFill" />
            <view class="checkout-item-copy">
              <text class="checkout-item-title">{{ item.title }}</text>
              <text class="checkout-variant">{{ item.variant }} × {{ item.quantity }}</text>
              <text class="checkout-stock" data-testid="checkout-item-stock">
                {{
                  stockMessage(
                    state.products.find((product) => product.id === item.productId)?.stock || 0,
                  )
                }}
              </text>
            </view>
            <text class="checkout-item-price">¥{{ money(item.amount) }}</text>
          </view>
          <view class="checkout-row">
            <text>配送方式</text>
            <text>快递 · 免运费</text>
          </view>
          <view class="shop-subtotal">
            <text>本店小计</text>
            <text>¥{{ money(group.amount) }}</text>
          </view>
        </view>
        <view class="checkout-costs">
          <view class="checkout-row">
            <text>商品总额</text>
            <text>¥{{ money(amount) }}</text>
          </view>
          <view class="checkout-row">
            <text>运费</text>
            <text>¥0</text>
          </view>
          <view class="checkout-row total-row">
            <text>合计</text>
            <text data-testid="checkout-total">¥{{ money(amount) }}</text>
          </view>
        </view>
        <text class="checkout-note">
          {{
            groups.length > 1
              ? `本次下单将按店铺拆成 ${groups.length} 笔订单，分别发货。`
              : '同一家店铺的商品会合并为一笔订单。'
          }}
        </text>
        <text v-if="pending" class="pending-notice" data-testid="checkout-pending">
          上次支付结果待确认，商品、金额和收货信息已锁定，重试不会重复下单。
        </text>
        <text
          v-if="problem || error"
          class="form-error checkout-error"
          role="alert"
          data-testid="checkout-error"
        >
          {{ problem || error }}
        </text>
        <button
          v-if="!pending && (problem.includes('价格') || problem.includes('重置'))"
          class="secondary-button"
          data-testid="checkout-refresh"
          :disabled="busy"
          @click="update"
        >
          更新商品信息
        </button>
        <button
          v-if="problem.includes('库存') || problem.includes('下架')"
          class="adjust-button"
          @click="back"
        >
          返回调整商品
        </button>
        <text class="checkout-note">本次为模拟支付，不会产生真实扣款。</text>
      </view>
      <view class="checkout-paybar">
        <view>
          <text class="quantity-note">共 {{ quantity }} 件，合计</text>
          <text class="checkout-pay-total">¥{{ money(amount) }}</text>
        </view>
        <button
          class="primary-button checkout-pay"
          data-testid="confirm-payment"
          :disabled="busy || !!problem"
          :loading="busy"
          @click="pay"
        >
          {{ pending ? '确认支付结果' : '模拟支付' }}
        </button>
      </view>
    </template>
  </view>
</template>
<style scoped>
.checkout-screen {
  background: #f8f6fc;
  padding-bottom: calc(105px + env(safe-area-inset-bottom));
}
.checkout-nav {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px 20px;
  background: #fff;
  font-size: 18px;
  font-weight: 600;
}
.checkout-content {
  padding: 0 20px;
}
.checkout-address {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  margin: 6px 0 20px;
  padding: 20px 16px;
  background: #f0e8fa;
  border: 1px solid #e4d6f2;
  border-radius: 15px;
  text-align: left;
  line-height: 1.6;
  color: #65497e;
}
.checkout-address[disabled] {
  background: #f0e8fa;
  color: #65497e;
}
.address-copy {
  flex: 1;
  min-width: 0;
}
.address-copy > text {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.address-copy > text > text {
  font-size: 11px;
  font-weight: 400;
  margin-left: 5px;
}
.address-copy > text:nth-child(2) {
  margin-top: 6px;
  color: #9b83b0;
  font-size: 11px;
  font-weight: 400;
  word-break: break-all;
}
.checkout-shop,
.checkout-costs {
  background: #fff;
  border: 1px solid #eee6f5;
  border-radius: 15px;
  padding: 18px 16px;
  margin-bottom: 16px;
}
.checkout-shop-name {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 20px;
}
.checkout-item {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin-bottom: 20px;
}
.checkout-item > image {
  width: 65px;
  height: 77px;
  border-radius: 9px;
  flex-shrink: 0;
}
.checkout-item-copy {
  flex: 1;
  min-width: 0;
}
.checkout-item-title {
  display: block;
  font-size: 13px;
  line-height: 1.7;
  font-weight: 600;
}
.checkout-variant,
.checkout-stock {
  display: block;
  font-size: 10px;
  color: #a18ab2;
  margin-top: 5px;
  line-height: 1.6;
}
.checkout-stock {
  color: #bb9268;
}
.checkout-item-price {
  color: #87649e;
  font-size: 12px;
  padding-top: 4px;
}
.checkout-row,
.shop-subtotal {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #a08baf;
  font-size: 11px;
  padding: 9px 0;
}
.shop-subtotal {
  border-top: 1px solid #f1ebf7;
  margin-top: 5px;
  padding-top: 16px;
  color: #7d608f;
}
.total-row {
  color: #684875;
  font-size: 14px;
  border-top: 1px solid #f1ebf7;
  margin-top: 6px;
  padding-top: 16px;
}
.total-row > text:last-child {
  color: #e17b9c;
  font-size: 22px;
  font-weight: 700;
}
.checkout-note {
  display: block;
  color: #b2a0bf;
  font-size: 11px;
  line-height: 1.9;
  margin: 14px 0;
}
.pending-notice {
  display: block;
  background: #f0e8fa;
  border-radius: 9px;
  color: #8967a9;
  padding: 12px;
  font-size: 12px;
  line-height: 1.8;
}
.checkout-error {
  display: block;
  margin: 15px 0;
}
.adjust-button {
  background: transparent;
  color: #9675b1;
  font-size: 12px;
  padding: 8px;
}
.checkout-paybar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  width: 100%;
  max-width: 440px;
  padding: 14px 20px calc(14px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #eee6f5;
  z-index: 30;
}
.quantity-note {
  display: block;
  color: #ae9abb;
  font-size: 10px;
}
.checkout-pay-total {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #e27a9b;
  margin-top: 3px;
}
.checkout-pay {
  width: 140px;
  font-size: 14px;
}
.checkout-result {
  padding: 25px 20px;
  text-align: center;
}
.result-emblem {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 65px;
  height: 65px;
  margin: 0 auto 20px;
  border-radius: 50%;
  background: #83a394;
}
.result-title {
  display: block;
  color: #715294;
  font-size: 23px;
  font-weight: 650;
}
.result-copy {
  display: block;
  color: #a28ab4;
  line-height: 1.9;
  font-size: 12px;
  margin: 12px 0;
}
.result-total {
  display: block;
  color: #df7b9a;
  font-size: 25px;
  font-weight: 650;
  margin: 15px 0 25px;
}
.result-order {
  display: flex;
  width: 100%;
  gap: 10px;
  align-items: center;
  margin: 0 0 15px;
  padding: 17px;
  background: #fff;
  border: 1px solid #eee6f5;
  border-radius: 13px;
  text-align: left;
  font-size: 13px;
}
.result-order > view {
  flex: 1;
  min-width: 0;
}
.result-order > view > text {
  display: block;
  line-height: 1.8;
}
.result-order > view > text:last-child {
  color: #ac97b9;
  font-size: 11px;
}
</style>
