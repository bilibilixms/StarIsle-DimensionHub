<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import { requireDemoLogin } from '@starisle/shared/auth'
import {
  addToCart,
  openCheckout,
  prepareBuyCheckout,
  pendingBuyCheckout,
  getDemoState,
  stockMessage,
  LOW_STOCK_LIMIT,
  DEMO_SHOP_ID,
  money,
  toggleFavorite,
  variantPrice,
} from '@starisle/shared/demo'

const { state, sync, syncError, connected, syncing } = useDemoSync()
const busy = ref(false)
const props = defineProps<{ id: string }>()
const id = computed(() => props.id)
const variant = ref<'standard' | 'gift'>('standard')
const quantity = ref(1)
const sheet = ref<'add' | 'buy' | ''>('')
const error = ref('')
const product = computed(() =>
  state.value.products.find((product) => product.id === id.value && product.published),
)
const currentShop = computed(
  () =>
    state.value.shops.find((shop) => shop.id === (product.value?.shopId || 'demo-shop')) ||
    state.value.shop,
)
const pendingPurchase = computed(() => {
  void state.value
  return pendingBuyCheckout(id.value)
})
const cartQuantity = computed(() =>
  state.value.cart
    .filter((item) => item.productId === id.value)
    .reduce((sum, item) => sum + item.quantity, 0),
)
const maxQuantity = computed(() => {
  if (sheet.value === 'buy' && pendingPurchase.value)
    return pendingPurchase.value.items[0]!.quantity
  return Math.max(0, (product.value?.stock || 0) - (sheet.value === 'add' ? cartQuantity.value : 0))
})
const stockNotice = ref('')
watch(maxQuantity, (maximum, previous) => {
  if (quantity.value > maximum) {
    quantity.value = maximum
    if (sheet.value && maximum < previous)
      stockNotice.value = maximum
        ? `库存已更新，最多可选 ${maximum} 件`
        : product.value?.stock === 0
          ? '商品已售罄'
          : '购物车中的数量已达到库存上限'
  } else if (quantity.value < 1 && maximum > 0) quantity.value = 1
})
const price = computed(() => (product.value ? variantPrice(product.value, variant.value) : 0))
const favorite = computed(() => state.value.favorites.includes(id.value))
const cartCount = computed(() => state.value.cart.reduce((sum, item) => sum + item.quantity, 0))
const platform = uni
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0

function openShop() {
  uni.navigateTo({
    url: `/pages/shop/detail?id=${encodeURIComponent(product.value?.shopId || DEMO_SHOP_ID)}`,
  })
}
function back() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index' })
}
function toggle() {
  state.value = toggleFavorite(id.value)
}
function goCart() {
  if (!requireDemoLogin('user', '/pages/index/index?tab=cart')) return
  uni.reLaunch({ url: '/pages/index/index?tab=cart' })
}
function choose(mode: 'add' | 'buy') {
  if (!requireDemoLogin('user', `/pages/product/detail?id=${id.value}`)) return
  error.value = ''
  stockNotice.value = ''
  sheet.value = mode
  if (mode === 'buy' && pendingPurchase.value) {
    variant.value = pendingPurchase.value.items[0]!.variant
    quantity.value = pendingPurchase.value.items[0]!.quantity
  }
}
function changeQuantity(delta: number) {
  if (!maxQuantity.value || busy.value || (sheet.value === 'buy' && pendingPurchase.value)) return
  quantity.value = Math.max(1, Math.min(maxQuantity.value, quantity.value + delta))
}
async function confirm() {
  if (busy.value) return
  if (!product.value && !pendingPurchase.value) return
  busy.value = true
  try {
    await sync()
    if (!connected.value) throw new Error('暂时无法连接演示服务，请检查服务后重试')
    if (sheet.value === 'add') {
      state.value = addToCart(id.value, variant.value, quantity.value)
      sheet.value = ''
      uni.showToast({ title: '心动已放进口袋', icon: 'success' })
    } else {
      const checkoutDraft =
        pendingPurchase.value || prepareBuyCheckout(id.value, variant.value, quantity.value)
      openCheckout(checkoutDraft)
      sheet.value = ''
    }
  } catch (cause) {
    state.value = getDemoState()
    error.value = cause instanceof Error ? cause.message : '请稍后重试'
  } finally {
    busy.value = false
  }
}
function recoverPayment() {
  choose('buy')
  void confirm()
}
function share() {
  uni.setClipboardData({
    data: `在星屿发现了「${product.value?.title || '心动好物'}」，一起收藏热爱吧。`,
  })
}
</script>

<template>
  <view class="app-screen detail-screen">
    <template v-if="product">
      <view class="detail-gallery">
        <image
          class="detail-cover"
          :src="product.cover"
          mode="aspectFill"
          :aria-label="product.title"
          @click="platform.previewImage({ urls: [product.cover] })"
        />
        <view class="gallery-top" :style="{ paddingTop: `${statusHeight + 13}px` }">
          <button class="gallery-icon" aria-label="返回" @click="back">
            <Icon name="chevron-left" tone="ink" :size="19" />
          </button>
          <text class="gallery-category">商品详情</text>
          <button class="gallery-icon" aria-label="分享商品" @click="share">
            <Icon name="share" tone="ink" :size="18" />
          </button>
        </view>
        <view class="gallery-bottom">
          <view class="gallery-original">
            <Icon name="sparkles" tone="white" :size="11" />
            {{ product.category }}
          </view>
          <text class="gallery-count">1 / 1</text>
        </view>
      </view>
      <view class="detail-body">
        <SyncStatus :connected="connected" :syncing="syncing" :error="syncError" @retry="sync" />
        <view class="product-info">
          <view class="price-line">
            <text class="detail-price">
              <text>¥</text>
              {{ money(price) }}
            </text>
            <text class="product-sales">已售 {{ product.sold }} 件</text>
          </view>
          <text class="detail-title" data-testid="detail-title">{{ product.title }}</text>
          <text class="detail-subtitle">{{ product.subtitle }}</text>
          <text
            class="stock-hint"
            :class="{
              'stock-low': product.stock <= LOW_STOCK_LIMIT && product.stock > 0,
              'stock-empty': product.stock === 0,
            }"
            data-testid="detail-stock"
          >
            {{ stockMessage(product.stock) }}
          </text>
          <view class="product-tags">
            <text>{{ product.category }}</text>
            <text v-if="product.tag">{{ product.tag }}</text>
          </view>
        </view>
        <view class="detail-options">
          <button class="option-row" data-testid="open-options" @click="choose('add')">
            <text class="option-label">选择</text>
            <text class="option-content">
              {{ variant === 'gift' ? '礼盒版' : '标准版' }} · {{ quantity }} 件
            </text>
            <Icon name="chevron-right" :size="14" />
          </button>
          <view class="option-row">
            <text class="option-label">配送</text>
            <text class="option-content">快递配送，下单时选择收货地址</text>
          </view>
        </view>
        <view class="shop-card">
          <image class="shop-avatar" :src="product.cover" mode="aspectFill" />
          <view class="shop-copy">
            <view class="shop-name">
              <text>{{ currentShop.name }}</text>
            </view>
            <text class="shop-description">{{ currentShop.description }}</text>
          </view>
          <button class="visit-shop" data-testid="visit-shop" @click="openShop">
            进店逛逛
            <Icon name="chevron-right" tone="purple" :size="12" />
          </button>
        </view>
        <view class="description">
          <view class="description-heading">
            <text>商品详情</text>
          </view>
          <view class="product-facts">
            <view>
              <text>商品名称</text>
              <text>{{ product.title }}</text>
            </view>
            <view>
              <text>商品分类</text>
              <text>{{ product.category }}</text>
            </view>
            <view>
              <text>包装款式</text>
              <text>标准版 / 礼盒版</text>
            </view>
          </view>
          <text class="description-copy">
            {{ product.subtitle }}
          </text>
          <image class="description-art" :src="product.cover" mode="widthFix" />
          <view class="description-note">
            <text>商品图片供展示参考，包装款式以所选规格为准。</text>
          </view>
        </view>
        <text class="detail-demo-note">演示商品 · 模拟支付不会产生真实扣款</text>
      </view>
      <view class="purchase-bar">
        <button
          class="purchase-small"
          :aria-label="favorite ? '取消收藏' : '收藏商品'"
          data-testid="detail-favorite"
          @click="toggle"
        >
          <Icon name="heart" :tone="favorite ? 'pink' : 'muted'" :size="20" />
          <text>{{ favorite ? '已收藏' : '收藏' }}</text>
        </button>
        <button class="purchase-small" aria-label="购物车" @click="goCart">
          <view class="detail-cart-icon">
            <Icon name="cart" :size="20" />
            <text v-if="cartCount" class="detail-cart-badge" data-testid="detail-cart-count">
              {{ cartCount }}
            </text>
          </view>
          <text>购物车</text>
        </button>
        <view class="purchase-actions">
          <button
            class="add-button"
            :disabled="busy || product.stock <= 0 || cartQuantity >= product.stock"
            data-testid="add-to-cart"
            @click="choose('add')"
          >
            {{
              product.stock <= 0
                ? '已售罄'
                : cartQuantity >= product.stock
                  ? '已达库存上限'
                  : '加入购物车'
            }}
          </button>
          <button
            class="buy-button"
            :disabled="busy || (product.stock <= 0 && !pendingPurchase)"
            data-testid="buy-now"
            @click="choose('buy')"
          >
            {{ pendingPurchase ? '确认支付结果' : product.stock <= 0 ? '已售罄' : '立即购买' }}
          </button>
        </view>
      </view>
      <Sheet
        :visible="sheet === 'add' || sheet === 'buy'"
        :title="sheet === 'buy' ? '确认商品规格' : '选择商品规格'"
        @close="sheet = ''"
      >
        <view class="sku-product">
          <image :src="product.cover" mode="aspectFill" />
          <view>
            <text class="sku-title">{{ product.title }}</text>
            <text class="sku-price" data-testid="sku-price">¥{{ money(price) }}</text>
            <text
              class="sku-stock stock-hint"
              :class="{
                'stock-low': product.stock <= LOW_STOCK_LIMIT && product.stock > 0,
                'stock-empty': product.stock === 0,
              }"
              data-testid="sku-stock"
            >
              {{ stockMessage(product.stock) }}
            </text>
          </view>
        </view>
        <text class="sku-label">包装款式</text>
        <view class="sku-variants">
          <button
            :class="{ chosen: variant === 'standard' }"
            :disabled="busy || (sheet === 'buy' && !!pendingPurchase)"
            data-testid="variant-standard"
            @click="variant = 'standard'"
          >
            标准版
          </button>
          <button
            :class="{ chosen: variant === 'gift' }"
            :disabled="busy || (sheet === 'buy' && !!pendingPurchase)"
            data-testid="variant-gift"
            @click="variant = 'gift'"
          >
            礼盒版
            <text>+¥30</text>
          </button>
        </view>
        <view class="quantity-row">
          <text class="sku-label">数量</text>
          <view class="quantity-picker">
            <button
              aria-label="减少数量"
              :disabled="busy || quantity <= 1 || (sheet === 'buy' && !!pendingPurchase)"
              @click="changeQuantity(-1)"
            >
              −
            </button>
            <text data-testid="sku-quantity">{{ quantity }}</text>
            <button
              aria-label="增加数量"
              :disabled="busy || quantity >= maxQuantity || (sheet === 'buy' && !!pendingPurchase)"
              data-testid="quantity-plus"
              @click="changeQuantity(1)"
            >
              +
            </button>
          </view>
        </view>
        <text v-if="stockNotice" class="stock-hint stock-low" data-testid="stock-update">
          {{ stockNotice }}
        </text>
        <text v-if="sheet === 'buy' && pendingPurchase" class="form-note">
          上次支付结果待确认，重试不会重复下单。
        </text>
        <view v-if="sheet === 'buy' && state.addresses.length" class="demo-address">
          <Icon name="pin" tone="purple" :size="17" />
          <view>
            <text>{{ state.recipient.name }} · 演示收货地址</text>
            <text>{{ state.recipient.address }}</text>
          </view>
        </view>
        <text v-if="sheet === 'buy' && !state.addresses.length" class="form-note">
          下一步填写收货地址并核对订单。
        </text>
        <text v-if="error" class="form-error">{{ error }}</text>
        <text class="form-note">
          {{
            sheet === 'buy'
              ? '本次为模拟下单，不会产生真实扣款。'
              : '加入购物车后，可以在「购物车」里继续查看。'
          }}
        </text>
        <button
          class="primary-button"
          :disabled="busy || maxQuantity <= 0"
          :loading="busy"
          data-testid="confirm-sku"
          @click="confirm"
        >
          {{
            pendingPurchase && sheet === 'buy'
              ? '确认上次支付结果'
              : maxQuantity <= 0
                ? product.stock <= 0
                  ? '已售罄'
                  : '已达库存上限'
                : sheet === 'buy'
                  ? `确认订单 · ¥${money(price * quantity)}`
                  : `确定加入 · ¥${money(price * quantity)}`
          }}
        </button>
      </Sheet>
    </template>
    <view v-else-if="!syncing" class="empty-state missing-product">
      <SyncStatus :connected="connected" :syncing="syncing" :error="syncError" @retry="sync" />
      <Icon name="bag" tone="purple" :size="44" />
      <text class="empty-title">这份好物暂时不在岛上</text>
      <text class="empty-copy">可能已下架，回首页发现新的心动吧。</text>
      <template v-if="pendingPurchase">
        <text class="form-note">上次支付结果待确认，确认不会重复下单。</text>
        <button
          class="primary-button"
          :disabled="busy"
          :loading="busy"
          data-testid="buy-now"
          @click="recoverPayment"
        >
          确认支付结果
        </button>
      </template>
      <text v-if="error" class="form-error">{{ error }}</text>
      <button class="secondary-button" aria-label="返回" @click="back">返回上一页</button>
      <button class="primary-button" @click="platform.reLaunch({ url: '/pages/index/index' })">
        返回首页
      </button>
    </view>
  </view>
</template>

<style scoped>
.detail-screen {
  background: #f7f6fa;
  padding-bottom: calc(92px + env(safe-area-inset-bottom));
}
.detail-gallery {
  position: relative;
  height: 0;
  padding-top: 100%;
  background: #eee7f2;
}
.detail-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.gallery-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  padding-right: 16px;
}
.gallery-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.93);
}
.gallery-category {
  padding: 7px 13px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  color: #5f4c70;
  font-size: 12px;
}
.gallery-bottom {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.gallery-original {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border-radius: 5px;
  background: rgba(52, 36, 65, 0.52);
  color: #fff;
  font-size: 11px;
}
.gallery-count {
  padding: 5px 9px;
  border-radius: 20px;
  background: rgba(52, 36, 65, 0.52);
  color: #fff;
  font-size: 11px;
}
.detail-body {
  position: relative;
}
.product-info {
  padding: 18px 16px;
  background: #fff;
}
.price-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.detail-price {
  color: #bd4569;
  font-size: 32px;
  line-height: 1.15;
  font-weight: 750;
}
.detail-price > text {
  margin-right: 2px;
  font-size: 17px;
  font-weight: 600;
}
.product-sales {
  font-size: 11px;
  color: #81768b;
}
.detail-title {
  display: block;
  margin-top: 12px;
  color: #372d40;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.55;
}
.detail-subtitle {
  display: block;
  margin-top: 6px;
  color: #81768b;
  font-size: 12px;
  line-height: 1.6;
}
.product-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}
.product-tags text {
  padding: 4px 8px;
  border-radius: 5px;
  background: #f2edf8;
  color: #765592;
  font-size: 10px;
  line-height: 1.4;
}
.detail-options {
  padding: 2px 16px;
  margin-top: 10px;
  background: #fff;
}
.option-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 50px;
  padding: 0;
  margin: 0;
  border-bottom: 1px solid #f1edf5;
  border-radius: 0;
  background: #fff;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}
.option-row:last-child {
  border-bottom: 0;
}
.option-label {
  flex-shrink: 0;
  color: #81768b;
}
.option-content {
  flex: 1;
  min-width: 0;
  color: #53435e;
}
.shop-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  padding: 16px;
  background: #fff;
}
.shop-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
}
.shop-copy {
  flex: 1;
  min-width: 0;
}
.shop-name {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #44334f;
  font-size: 14px;
  font-weight: 650;
}
.shop-description {
  display: block;
  overflow: hidden;
  margin-top: 5px;
  color: #81768b;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.visit-shop {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  min-height: 34px;
  padding: 7px 10px;
  margin: 0;
  border: 1px solid #e6d9f1;
  border-radius: 18px;
  background: #faf7ff;
  color: #6541a5;
  font-size: 11px;
  line-height: 1.5;
}
.description {
  padding: 20px 16px;
  background: #fff;
}
.description-heading {
  color: #44334f;
  font-size: 16px;
  font-weight: 700;
}
.description-copy {
  display: block;
  margin: 18px 0 14px;
  color: #766880;
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-line;
}
.description-art {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 10px;
}
.description-note {
  display: block;
  margin-top: 14px;
  color: #81768b;
  font-size: 11px;
  line-height: 1.7;
}
.detail-demo-note {
  display: block;
  margin: 20px 16px 4px;
  color: #81768b;
  font-size: 10px;
  line-height: 1.6;
  text-align: center;
}
.purchase-bar {
  position: fixed;
  z-index: 30;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 440px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid #eee8f3;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
}
.purchase-small {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 34px;
  min-height: 46px;
  padding: 0;
  margin: 0;
  background: transparent;
  color: #766880;
  font-size: 10px;
  line-height: 1.2;
}
.purchase-actions {
  display: flex;
  flex: 1;
  gap: 8px;
  min-width: 0;
}
.purchase-actions button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 10px 5px;
  margin: 0;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}
.add-button {
  background: #f0e8fa;
  color: #6541a5;
}
.buy-button {
  background: #8056cf;
  color: #fff;
}
.detail-cart-icon {
  position: relative;
}
.detail-cart-badge {
  position: absolute;
  top: -7px;
  right: -9px;
  color: white;
  background: #ed83a5;
  font-size: 8px;
  border-radius: 10px;
  padding: 2px 4px;
}
.sku-product {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 23px;
}
.sku-product image {
  width: 84px;
  height: 94px;
  border-radius: 12px;
}
.sku-product > view {
  flex: 1;
}
.sku-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.8;
}
.sku-price {
  display: block;
  margin-top: 8px;
  color: #bd4569;
  font-size: 26px;
  font-weight: 700;
}
.sku-stock {
  display: block;
  font-size: 10px;
  margin-top: 6px;
}
.sku-label {
  display: block;
  font-size: 13px;
  color: #715d81;
  font-weight: 550;
}
.sku-variants {
  display: flex;
  gap: 11px;
  margin-top: 12px;
}
.sku-variants button {
  padding: 11px 18px;
  margin: 0;
  border: 1px solid #e9e1f1;
  border-radius: 10px;
  background: #faf8fc;
  color: #766880;
  font-size: 13px;
  line-height: 1.4;
}
.sku-variants button.chosen {
  color: #6541a5;
  border-color: #a47ad6;
  background: #f2eafa;
}
.sku-variants button > text {
  font-size: 9px;
  margin-left: 5px;
}
.quantity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 26px 0 20px;
}
.quantity-picker {
  display: flex;
  align-items: center;
  border: 1px solid #ebe1f3;
  border-radius: 8px;
  overflow: hidden;
}
.quantity-picker button {
  background: #f7f3fb;
  color: #9680a7;
  padding: 7px 14px;
  font-size: 16px;
  line-height: 1.2;
  margin: 0;
  border-radius: 0;
}
.quantity-picker > text {
  min-width: 35px;
  text-align: center;
  font-size: 13px;
}
.demo-address {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f9f5fc;
  border-radius: 10px;
  padding: 12px;
}
.demo-address text {
  display: block;
  font-size: 11px;
  color: #8f77a2;
  line-height: 1.9;
}
.missing-product {
  padding-top: 160px;
}

.detail-body :deep(.sync-status:not(.disconnected)) {
  margin: 0;
  padding: 8px 16px 0;
  border-radius: 0;
  background: #fff;
  color: #81768b;
}
.product-facts {
  margin-top: 16px;
  padding: 2px 12px;
  border-radius: 10px;
  background: #f8f6fb;
}
.product-facts > view {
  display: flex;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid #eee8f3;
  font-size: 12px;
  line-height: 1.6;
}
.product-facts > view:last-child {
  border-bottom: 0;
}
.product-facts > view > text:first-child {
  flex-shrink: 0;
  color: #81768b;
}
.product-facts > view > text:last-child {
  flex: 1;
  min-width: 0;
  color: #53435e;
  word-break: break-all;
}

/* #ifdef MP-WEIXIN */
.gallery-top {
  padding-right: 112px;
}
/* #endif */
@media (max-width: 360px) {
  .purchase-bar {
    gap: 8px;
    padding-left: 12px;
    padding-right: 12px;
  }
  .purchase-actions {
    gap: 6px;
  }
  .purchase-actions button {
    font-size: 11px;
  }
}
</style>
