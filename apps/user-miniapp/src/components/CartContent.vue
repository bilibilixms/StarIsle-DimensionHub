<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import {
  checkoutCart,
  prepareCartCheckout,
  money,
  updateCart,
  variantPrice,
  syncDemoState,
  cartCheckoutIssue,
  stockMessage,
  LOW_STOCK_LIMIT,
  type DemoState,
  type DemoCartItem,
} from '@starisle/shared/demo'
const props = defineProps<{ state: DemoState }>()
const emit = defineEmits<{ refresh: []; completed: []; browse: [] }>()
const busy = ref(false)
const checkoutIssue = computed(() => cartCheckoutIssue(props.state))
function cartQuantity(productId: string) {
  return props.state.cart
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0)
}
const items = computed(() =>
  props.state.cart
    .map((item) => ({
      ...item,
      product: props.state.products.find((product) => product.id === item.productId)!,
    }))
    .filter((item) => item.product),
)
const amount = computed(() =>
  items.value
    .filter((item) => item.selected)
    .reduce((sum, item) => sum + variantPrice(item.product, item.variant) * item.quantity, 0),
)
const selectedCount = computed(() =>
  items.value.filter((item) => item.selected).reduce((sum, item) => sum + item.quantity, 0),
)
function change(item: DemoCartItem, action: 'plus' | 'minus' | 'select' | 'remove') {
  try {
    updateCart(item.productId, item.variant, action)
    emit('refresh')
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '修改失败', icon: 'none' })
  }
}
async function checkout() {
  if (busy.value) return
  if (!selectedCount.value) return uni.showToast({ title: '请先选择商品', icon: 'none' })
  busy.value = true
  let prepared
  try {
    await syncDemoState()
    emit('refresh')
    prepared = prepareCartCheckout()
  } catch (error) {
    emit('refresh')
    busy.value = false
    return uni.showToast({
      title: error instanceof Error ? error.message : '请刷新商品后重试',
      icon: 'none',
    })
  }
  const checkoutDraft = prepared
  uni.showModal({
    title: '确认模拟支付',
    content: `共 ${selectedCount.value} 件商品，合计 ¥${money(checkoutDraft.items.reduce((sum, item) => sum + item.expectedPrice * item.quantity, 0))}。收货：${checkoutDraft.recipient.name}，${checkoutDraft.recipient.address}。仅生成联动演示订单，不会产生真实扣款。`,
    confirmText: '模拟支付',
    confirmColor: '#8b5cf6',
    async success(result) {
      if (!result.confirm) return
      if (busy.value) return
      busy.value = true
      try {
        await checkoutCart(checkoutDraft)
        emit('refresh')
        emit('completed')
        uni.showToast({ title: '模拟支付成功', icon: 'success' })
      } catch (error) {
        emit('refresh')
        uni.showToast({ title: error instanceof Error ? error.message : '下单失败', icon: 'none' })
      } finally {
        busy.value = false
      }
    },
  })
  busy.value = false
}
</script>

<template>
  <view class="cart-content">
    <view class="cart-note">
      <Icon name="shield" tone="purple" :size="16" />
      <text>把心动装进口袋，慢慢收藏。</text>
    </view>
    <template v-if="items.length">
      <view class="shop-heading">
        <Icon name="bag" tone="purple" :size="18" />
        <text>{{ state.shop.name }}</text>
        <Icon name="chevron-right" :size="13" />
      </view>
      <view
        v-for="item in items"
        :key="`${item.productId}-${item.variant}`"
        class="cart-item"
        :data-testid="`cart-item-${item.productId}`"
      >
        <button
          class="select-item"
          :class="{ checked: item.selected }"
          aria-label="选择商品"
          @click="change(item, 'select')"
        >
          <Icon v-if="item.selected" name="check" tone="white" :size="12" />
        </button>
        <image :src="item.product.cover" mode="aspectFill" class="cart-cover" />
        <view class="cart-copy">
          <text class="cart-title">{{ item.product.title }}</text>
          <text class="cart-variant">{{ item.variant === 'gift' ? '礼盒版' : '标准版' }}</text>
          <text
            v-if="
              !item.product.published ||
              item.product.stock <= LOW_STOCK_LIMIT ||
              cartQuantity(item.productId) > item.product.stock
            "
            class="stock-hint"
            :class="{
              'stock-low': item.product.stock > 0,
              'stock-empty': item.product.stock === 0,
            }"
            data-testid="cart-stock"
          >
            {{
              !item.product.published
                ? '商品已下架'
                : cartQuantity(item.productId) > item.product.stock && item.product.stock > 0
                  ? `库存不足，仅剩 ${item.product.stock} 件，请调整数量`
                  : stockMessage(item.product.stock)
            }}
          </text>
          <view class="cart-bottom">
            <text class="cart-price">¥{{ money(variantPrice(item.product, item.variant)) }}</text>
            <view class="quantity-control">
              <button
                aria-label="减少数量"
                :disabled="busy || item.quantity <= 1"
                @click="change(item, 'minus')"
              >
                −
              </button>
              <text>{{ item.quantity }}</text>
              <button
                aria-label="增加数量"
                :disabled="
                  busy ||
                  !item.product.published ||
                  cartQuantity(item.productId) >= item.product.stock
                "
                @click="change(item, 'plus')"
              >
                +
              </button>
            </view>
          </view>
          <button class="remove-item" aria-label="移除商品" @click="change(item, 'remove')">
            移除
          </button>
        </view>
      </view>
      <text v-if="checkoutIssue" class="form-error" data-testid="cart-stock-error">
        {{ checkoutIssue }}
      </text>
      <view class="cart-summary">
        <view>
          <text class="summary-note">合计（免运费）</text>
          <text class="summary-price" data-testid="cart-total">¥{{ money(amount) }}</text>
        </view>
        <button
          class="primary-button checkout"
          :disabled="busy || !!checkoutIssue || !selectedCount"
          :loading="busy"
          data-testid="cart-checkout"
          @click="checkout"
        >
          模拟结算（{{ selectedCount }}）
        </button>
      </view>
      <text class="form-note">
        订单与商家端联动，购物车仅保存在本机。演示收货地址可在「我的」修改。
      </text>
    </template>
    <view v-else class="empty-state">
      <Icon name="cart" tone="purple" :size="44" />
      <text class="empty-title">口袋里还没有心动好物</text>
      <text class="empty-copy">去岛上逛逛，把喜欢的带回来。</text>
      <button class="primary-button" @click="$emit('browse')">去逛逛</button>
    </view>
  </view>
</template>

<style scoped>
.cart-content {
  padding: 16px 20px;
}
.cart-note {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  color: #a08ab8;
  background: #f0e9fa;
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 25px;
}
.shop-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 18px 4px;
}
.cart-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  border-radius: 15px;
  padding: 16px 11px;
  margin-bottom: 12px;
}
.select-item {
  border: 1px solid #d8cde5;
  background: white;
  padding: 0;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.select-item.checked {
  background: #9d74d8;
  border-color: #9d74d8;
}
.cart-cover {
  width: 76px;
  height: 91px;
  border-radius: 10px;
  flex-shrink: 0;
}
.cart-copy {
  flex: 1;
  min-width: 0;
}
.cart-title {
  font-size: 12px;
  line-height: 1.7;
  display: block;
  font-weight: 600;
}
.cart-variant {
  display: inline-block;
  background: #f5f1f8;
  color: #a18eaf;
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 9px;
  margin-top: 8px;
}
.cart-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 12px;
}
.cart-price {
  font-size: 15px;
  color: #e17b9b;
  font-weight: 650;
}
.quantity-control {
  display: flex;
  align-items: center;
  border: 1px solid #eee8f4;
  border-radius: 6px;
}
.quantity-control button {
  background: transparent;
  margin: 0;
  padding: 3px 7px;
  font-size: 14px;
  line-height: 1.2;
  color: #8d789e;
}
.quantity-control text {
  font-size: 11px;
  min-width: 18px;
  text-align: center;
}
.remove-item {
  padding: 0;
  margin: 8px 0 0 auto;
  background: transparent;
  color: #b6a8c1;
  font-size: 9px;
  width: fit-content;
  line-height: 1.5;
}
.cart-summary {
  margin-top: 26px;
  padding: 20px 0;
  border-top: 1px solid #e9e1ef;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: center;
}
.summary-note {
  display: block;
  font-size: 10px;
  color: #a496b2;
  margin-bottom: 5px;
}
.summary-price {
  font-size: 24px;
  font-weight: 750;
  color: #df7499;
}
.checkout {
  width: auto;
  font-size: 13px;
  padding: 13px 20px;
}
</style>
