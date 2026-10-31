<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import {
  addToCart,
  buyDemoProduct,
  prepareBuyCheckout,
  pendingBuyCheckout,
  getDemoState,
  stockMessage,
  LOW_STOCK_LIMIT,
  DEMO_ASSETS,
  money,
  toggleFavorite,
  variantPrice,
} from '@starisle/shared/demo'

const { state, sync, syncError, connected, syncing } = useDemoSync()
const busy = ref(false)
const id = ref('')
const variant = ref<'standard' | 'gift'>('standard')
const quantity = ref(1)
const sheet = ref<'add' | 'buy' | 'shop' | ''>('')
const error = ref('')
const following = ref(false)
const product = computed(() =>
  state.value.products.find((product) => product.id === id.value && product.published),
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
onLoad((query) => {
  id.value = query?.id || 'star-fairy'
})
function goHome() {
  sheet.value = ''
  uni.reLaunch({ url: '/pages/index/index' })
}
function back() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index' })
}
function toggle() {
  state.value = toggleFavorite(id.value)
}
function goCart() {
  uni.reLaunch({ url: '/pages/index/index?tab=cart' })
}
function choose(mode: 'add' | 'buy') {
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
      uni.showModal({
        title: '确认模拟支付',
        content: `合计 ¥${money(checkoutDraft.items[0]!.expectedPrice * checkoutDraft.items[0]!.quantity)}。收货：${checkoutDraft.recipient.name}，${checkoutDraft.recipient.address}。这是一笔联动演示订单，不会产生真实扣款。`,
        confirmText: '模拟支付',
        confirmColor: '#8b5cf6',
        async success(result) {
          if (!result.confirm) return
          if (busy.value) return
          busy.value = true
          try {
            await buyDemoProduct(checkoutDraft)
            sheet.value = ''
            uni.reLaunch({ url: '/pages/index/index?tab=profile' })
          } catch (cause) {
            state.value = getDemoState()
            error.value = cause instanceof Error ? cause.message : '请稍后重试'
          } finally {
            busy.value = false
          }
        },
      })
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
          <text class="gallery-category">心动收藏</text>
          <button class="gallery-icon" aria-label="分享商品" @click="share">
            <Icon name="share" tone="ink" :size="18" />
          </button>
        </view>
        <view class="gallery-bottom">
          <view class="gallery-original">
            <Icon name="sparkles" tone="white" :size="11" />
            星屿原创
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
            <text>原创设计</text>
            <text>现货好物</text>
            <text>用心包装</text>
          </view>
          <view class="promises">
            <view>
              <Icon name="shield" tone="purple" :size="12" />
              <text>安心收藏</text>
            </view>
            <view>
              <Icon name="truck" tone="purple" :size="13" />
              <text>满心期待，认真送达</text>
            </view>
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
            <text class="option-label">发货</text>
            <text class="option-content">上海 · 预计 3 天内发出</text>
            <text class="option-small">免运费</text>
          </view>
          <view class="option-row">
            <text class="option-label">服务</text>
            <text class="option-content">精选原创 / 悉心包装 / 售后联系</text>
            <Icon name="shield" :size="14" />
          </view>
        </view>
        <view class="shop-card">
          <image class="shop-avatar" :src="DEMO_ASSETS.figurine" mode="aspectFill" />
          <view class="shop-copy">
            <view class="shop-name">
              <text>{{ state.shop.name }}</text>
              <Icon name="shield" tone="purple" :size="12" />
            </view>
            <text class="shop-description">{{ state.shop.description }}</text>
          </view>
          <button class="visit-shop" @click="sheet = 'shop'">
            进店逛逛
            <Icon name="chevron-right" tone="purple" :size="12" />
          </button>
        </view>
        <view class="description">
          <view class="description-heading">
            <view />
            <text>好物背后的心意</text>
            <view />
          </view>
          <text class="description-copy">
            {{ '星光落在指尖，热爱有了形状。\n愿这份小小的收藏，陪你度过每一个闪闪发光的日常。' }}
          </text>
          <image class="description-art" :src="DEMO_ASSETS.hero" mode="aspectFill" />
          <view class="description-note">
            <Icon name="sparkles" tone="purple" :size="16" />
            <text>在星屿，把喜欢变成陪伴。</text>
          </view>
        </view>
        <text class="detail-demo-note">应用端样板 · 商品、价格及订单均为演示数据</text>
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
        :title="sheet === 'buy' ? '确认你的心动' : '选择心动好物'"
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
        <view v-if="sheet === 'buy'" class="demo-address">
          <Icon name="pin" tone="purple" :size="17" />
          <view>
            <text>{{ state.recipient.name }} · 演示收货地址</text>
            <text>{{ state.recipient.address }}</text>
          </view>
        </view>
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
                  ? `模拟下单 · ¥${money(price * quantity)}`
                  : `确定加入 · ¥${money(price * quantity)}`
          }}
        </button>
      </Sheet>
      <Sheet :visible="sheet === 'shop'" :title="state.shop.name" @close="sheet = ''">
        <view class="shop-preview">
          <image :src="DEMO_ASSETS.figurine" mode="aspectFill" />
          <text>{{ state.shop.description }}</text>
          <text class="shop-preview-copy">
            {{ '原创周边与温柔小物，\n期待在这里遇到同样热爱的你。' }}
          </text>
        </view>
        <button class="primary-button" @click="following = !following">
          {{ following ? '已关注小店' : '关注这家小店' }}
        </button>
        <button class="shop-back" @click="goHome">回到岛上，逛逛更多好物</button>
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
  background: #f8f6fb;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}
.detail-gallery {
  position: relative;
  height: 390px;
  background: #eee0f1;
}
.detail-cover {
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
  padding-left: 18px;
  padding-right: 18px;
}
.gallery-icon {
  background: rgba(255, 255, 255, 0.83);
  padding: 0;
  margin: 0;
  width: 33px;
  height: 33px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gallery-category {
  font-size: 11px;
  color: #8d769a;
  background: rgba(255, 255, 255, 0.65);
  padding: 6px 12px;
  border-radius: 20px;
}
.gallery-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 20px;
}
.gallery-original {
  display: flex;
  align-items: center;
  font-size: 9px;
  color: white;
  background: rgba(93, 54, 114, 0.25);
  padding: 5px 9px;
  border-radius: 5px;
}
.gallery-count {
  font-size: 10px;
  padding: 5px 9px;
  border-radius: 20px;
  color: white;
  background: rgba(66, 36, 76, 0.3);
}
.detail-body {
  position: relative;
  border-radius: 22px 22px 0 0;
  margin-top: -8px;
  overflow: hidden;
}
.product-info {
  background: white;
  padding: 22px 20px 0;
}
.price-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.detail-price {
  color: #ec789a;
  font-size: 30px;
  line-height: 1;
  font-weight: 750;
}
.detail-price > text {
  font-size: 17px;
  margin-right: 4px;
}
.product-sales {
  font-size: 9px;
  color: #baa8bc;
}
.detail-title {
  display: block;
  font-size: 19px;
  font-weight: 750;
  margin-top: 17px;
  line-height: 1.6;
  letter-spacing: 0.3px;
}
.detail-subtitle {
  display: block;
  color: #b09eb5;
  font-size: 11px;
  margin-top: 7px;
}
.product-tags {
  display: flex;
  gap: 7px;
  margin: 15px 0 19px;
}
.product-tags text {
  color: #d88ca6;
  background: #fff0f4;
  border-radius: 4px;
  font-size: 9px;
  padding: 4px 7px;
}
.promises {
  display: flex;
  gap: 19px;
  border-top: 1px solid #f6f1f7;
  padding: 13px 0;
}
.promises > view {
  display: flex;
  gap: 4px;
  align-items: center;
  color: #a68ab8;
  font-size: 9px;
}
.detail-options {
  background: white;
  padding: 2px 20px;
  margin-top: 10px;
}
.option-row {
  display: flex;
  align-items: center;
  min-height: 44px;
  gap: 14px;
  font-size: 11px;
  padding: 0;
  margin: 0;
  background: white;
  line-height: 1.5;
  border-bottom: 1px solid #f7f3f9;
  border-radius: 0;
  text-align: left;
}
.option-row:last-child {
  border-bottom: 0;
}
.option-label {
  color: #b2a2bc;
}
.option-content {
  flex: 1;
  color: #746080;
}
.option-small {
  font-size: 9px;
  color: #aa91ba;
}
.shop-card {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 12px 0;
  padding: 18px 20px;
  background: white;
}
.shop-avatar {
  width: 43px;
  height: 43px;
  border-radius: 12px;
}
.shop-copy {
  flex: 1;
  min-width: 0;
}
.shop-name {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 650;
}
.shop-description {
  display: block;
  font-size: 9px;
  color: #b2a0bf;
  margin-top: 7px;
}
.visit-shop {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #f4edfc;
  color: #a07ac7;
  font-size: 9px;
  padding: 7px 9px;
  border-radius: 20px;
  margin: 0;
  line-height: 1.5;
}
.description {
  background: white;
  padding: 22px 20px;
}
.description-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #9572af;
  font-size: 13px;
  font-weight: 600;
}
.description-heading view {
  height: 1px;
  width: 23px;
  background: #e6d7f2;
}
.description-copy {
  display: block;
  text-align: center;
  font-size: 11px;
  line-height: 2.1;
  color: #a697b3;
  white-space: pre-line;
  margin: 20px 0;
}
.description-art {
  display: block;
  width: 100%;
  height: 190px;
  border-radius: 13px;
}
.description-note {
  display: flex;
  align-items: center;
  gap: 7px;
  justify-content: center;
  margin: 18px 0 0;
  font-size: 10px;
  color: #b39bc6;
}
.detail-demo-note {
  display: block;
  text-align: center;
  font-size: 9px;
  margin: 19px 0 8px;
  color: #c0b2c8;
}
.purchase-bar {
  position: fixed;
  z-index: 30;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 440px;
  padding: 11px 15px calc(11px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #eee8f3;
  display: flex;
  gap: 11px;
  align-items: center;
}
.purchase-small {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 0;
  background: transparent;
  padding: 0;
  min-width: 34px;
  font-size: 9px;
  color: #a194ab;
  line-height: 1.2;
}
.purchase-actions {
  display: flex;
  flex: 1;
  gap: 8px;
}
.purchase-actions button {
  flex: 1;
  line-height: 1.5;
  margin: 0;
  font-size: 12px;
  padding: 13px 6px;
  border-radius: 10px;
  color: white;
  font-weight: 550;
}
.add-button {
  background: #b38be4;
}
.buy-button {
  background: #ed82a5;
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
  color: #e87c9f;
  font-size: 25px;
  font-weight: 700;
  margin-top: 10px;
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
  font-size: 12px;
  color: #a08cae;
  background: #f7f3fa;
  border: 1px solid #f1ebf5;
  padding: 10px 20px;
  border-radius: 9px;
  margin: 0;
  line-height: 1.4;
}
.sku-variants button.chosen {
  color: #9466c4;
  border-color: #bd9ce0;
  background: #f5edff;
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
.shop-preview {
  text-align: center;
}
.shop-preview image {
  height: 88px;
  width: 88px;
  border-radius: 20px;
  display: block;
  margin: 0 auto 20px;
}
.shop-preview > text {
  font-size: 14px;
  display: block;
}
.shop-preview-copy {
  color: #b19bbf;
  font-size: 12px !important;
  line-height: 1.9;
  white-space: pre-line;
  margin: 15px 0 24px;
}
.shop-back {
  margin: 15px 0 0;
  padding: 0;
  background: transparent;
  color: #aa8dbf;
  font-size: 11px;
}
.missing-product {
  padding-top: 160px;
}
/* #ifdef MP-WEIXIN */
.gallery-top {
  padding-right: 112px;
}
/* #endif */
@media (max-width: 360px) {
  .detail-gallery {
    height: 360px;
  }
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
