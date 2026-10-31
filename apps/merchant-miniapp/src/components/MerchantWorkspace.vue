<script setup lang="ts">
import { computed, ref } from 'vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import AppHeader from '@starisle/ui/AppHeader.vue'
import BottomNav from '@starisle/ui/BottomNav.vue'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import OrderItems from '@starisle/user/OrderItems.vue'
import { logoutDemo, openLogin } from '@starisle/shared/auth'
import {
  createDemoProduct,
  DEMO_ASSETS,
  editDemoProduct,
  editDemoShop,
  getDemoState,
  money,
  resetDemoState,
  shipDemoOrder,
  toggleDemoProduct,
  type DemoOrder,
  type DemoProduct,
} from '@starisle/shared/demo'

const { state, sync, syncError, connected, syncing } = useDemoSync('merchant')
const busy = ref(false)
const tab = ref('home')
const status = ref('待发货')
const productFilter = ref('全部')
const sheet = ref<'ship' | 'order' | 'product' | 'shop' | 'message' | ''>('')
const activeOrderId = ref('')
const activeOrder = computed(
  () => state.value.merchantOrders.find((order) => order.id === activeOrderId.value) || null,
)
const carrier = ref('顺丰速运')
const tracking = ref('')
const error = ref('')
const productId = ref('')
const productTitle = ref('')
const productPrice = ref('')
const productStock = ref('')
const originalStock = ref(0)
const productCover = ref(DEMO_ASSETS.figurine)
const shopName = ref('')
const shopDescription = ref('')
const title = computed(
  () =>
    ({ home: '商家工作台', products: '商品管理', orders: '订单管理', profile: '我的小店' })[
      tab.value
    ] || '商家工作台',
)
const waiting = computed(
  () => state.value.merchantOrders.filter((order) => order.status === '待发货').length,
)
const completed = computed(
  () => state.value.merchantOrders.filter((order) => order.status === '已完成').length,
)
const revenue = computed(() =>
  state.value.merchantOrders.reduce((sum, order) => sum + order.amount, 0),
)
const published = computed(() => state.value.products.filter((product) => product.published).length)
const visibleOrders = computed(() =>
  state.value.merchantOrders.filter(
    (order) => status.value === '全部' || order.status === status.value,
  ),
)
const visibleProducts = computed(() =>
  state.value.products.filter(
    (product) =>
      productFilter.value === '全部' || product.published === (productFilter.value === '在售'),
  ),
)
function inspectOrder(order: DemoOrder) {
  activeOrderId.value = order.id
  sheet.value = 'order'
}
function viewWaitingOrders() {
  sheet.value = ''
  orders('待发货')
}
function changeTab(value: string) {
  tab.value = value
  if (value === 'orders') status.value = '全部'
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
function orders(value: string) {
  tab.value = 'orders'
  status.value = value
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
function openShip(order: DemoOrder) {
  activeOrderId.value = order.id
  carrier.value = '顺丰速运'
  tracking.value = ''
  error.value = ''
  sheet.value = 'ship'
}
async function ship() {
  if (busy.value) return
  busy.value = true
  try {
    state.value = await shipDemoOrder(activeOrder.value!.id, carrier.value, tracking.value)
    sheet.value = ''
    uni.showToast({ title: '模拟发货成功', icon: 'success' })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请稍后重试'
  } finally {
    busy.value = false
  }
}
function editProduct(product?: DemoProduct) {
  productId.value = product?.id || ''
  productTitle.value = product?.title || ''
  productPrice.value = product ? (product.price / 100).toFixed(2) : ''
  productStock.value = product ? String(product.stock) : ''
  originalStock.value = product?.stock || 0
  productCover.value = product?.cover || DEMO_ASSETS.figurine
  error.value = ''
  sheet.value = 'product'
}
async function saveProduct() {
  if (busy.value) return
  busy.value = true
  try {
    const stockChanged = productStock.value !== String(originalStock.value)
    state.value = productId.value
      ? await editDemoProduct(
          productId.value,
          productTitle.value,
          productPrice.value,
          stockChanged ? productStock.value : undefined,
          stockChanged ? originalStock.value : undefined,
        )
      : await createDemoProduct(
          productTitle.value,
          productPrice.value,
          productStock.value,
          productCover.value,
        )
    sheet.value = ''
    uni.showToast({ title: productId.value ? '好物已更新' : '新品已上架', icon: 'success' })
  } catch (cause) {
    state.value = getDemoState()
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    busy.value = false
  }
}
function openShop() {
  shopName.value = state.value.shop.name
  shopDescription.value = state.value.shop.description
  error.value = ''
  sheet.value = 'shop'
}
async function saveShop() {
  if (busy.value) return
  busy.value = true
  try {
    state.value = await editDemoShop(shopName.value, shopDescription.value)
    sheet.value = ''
    uni.showToast({ title: '店铺资料已保存', icon: 'success' })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    busy.value = false
  }
}
function reset() {
  uni.showModal({
    title: '重置本店演示数据',
    content: '清空本店演示商品和订单。初始演示店铺会恢复样例商品，其他店铺的数据保留。',
    confirmColor: '#d9985d',
    async success(result) {
      if (!result.confirm || busy.value) return
      busy.value = true
      try {
        state.value = await resetDemoState()
      } catch (cause) {
        uni.showToast({ title: cause instanceof Error ? cause.message : '重置失败', icon: 'none' })
      } finally {
        busy.value = false
      }
    },
  })
}
async function logout() {
  try {
    await logoutDemo()
  } catch (cause) {
    uni.showToast({
      title: cause instanceof Error ? cause.message : '退出失败，请重试',
      icon: 'none',
    })
  }
}
async function toggleProduct(id: string) {
  if (busy.value) return
  busy.value = true
  try {
    state.value = await toggleDemoProduct(id)
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error ? cause.message : '操作失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view class="app-screen merchant-screen">
    <AppHeader :title="title" badge @message="sheet = 'message'" />
    <SyncStatus :connected="connected" :syncing="syncing" :error="syncError" @retry="sync" />
    <view class="workspace-body">
      <template v-if="tab === 'home'">
        <view class="shop-banner">
          <view class="shop-banner-art" />
          <view class="shop-banner-top">
            <image :src="DEMO_ASSETS.figurine" class="shop-logo" mode="aspectFill" />
            <view class="shop-banner-copy">
              <view class="shop-title-line">
                <text>{{ state.shop.name }}</text>
                <view class="open-badge">
                  <view />
                  营业中
                </view>
              </view>
              <text class="shop-tagline">{{ state.shop.description }}</text>
              <view class="shop-identity">
                星屿认证商家
                <Icon name="shield" tone="orange" :size="11" />
              </view>
            </view>
            <button class="manage-shop" data-testid="manage-shop" @click="openShop">
              <Icon name="settings" tone="orange" :size="15" />
            </button>
          </view>
          <view class="shop-banner-bottom">
            <text>把喜欢的事，认真做成一间小店。</text>
            <Icon name="sparkles" tone="orange" :size="17" />
          </view>
        </view>
        <view class="overview">
          <view class="section-heading">
            <view class="overview-heading">
              <text>经营概览</text>
              <view class="overview-dot" />
              <text class="overview-label">小店的每一份进步</text>
            </view>
            <button class="text-link" @click="orders('全部')">
              查看明细
              <Icon name="chevron-right" :size="12" />
            </button>
          </view>
          <view class="metrics">
            <view>
              <text class="metric-value">{{ state.merchantOrders.length }}</text>
              <text class="metric-label">订单数</text>
              <text class="metric-detail">每一份信任</text>
            </view>
            <view class="metric-money">
              <text class="metric-value">
                <text>¥</text>
                {{ money(revenue) }}
              </text>
              <text class="metric-label">有效成交额</text>
              <text class="metric-detail">模拟支付成功订单</text>
            </view>
            <view>
              <text class="metric-value">{{ published }}</text>
              <text class="metric-label">在售商品</text>
              <text class="metric-detail">持续为热爱上新</text>
            </view>
          </view>
        </view>
        <view class="quick-actions">
          <button @click="changeTab('products')">
            <view class="quick-action-icon peach">
              <Icon name="bag" tone="orange" :size="24" />
            </view>
            <text>商品管理</text>
            <text class="quick-action-note">打理每一份心意</text>
          </button>
          <button @click="editProduct()" data-testid="publish-product">
            <view class="quick-action-icon mint"><Icon name="plus" tone="teal" :size="24" /></view>
            <text>发布新品</text>
            <text class="quick-action-note">让新灵感上岛</text>
          </button>
          <button @click="orders('全部')">
            <view class="quick-action-icon lilac">
              <Icon name="receipt" tone="purple" :size="24" />
            </view>
            <text>订单管理</text>
            <text class="quick-action-note">认真回应每份喜欢</text>
          </button>
        </view>
        <view class="todo-heading">
          <view class="section-heading-title">
            <view class="heading-accent" />
            <text>小店待办</text>
          </view>
          <text class="todo-total">还有 {{ waiting }} 件事等你处理</text>
        </view>
        <view class="todo-card">
          <button class="todo-row" @click="orders('待发货')" data-testid="waiting-orders">
            <view class="todo-icon blue"><Icon name="truck" tone="blue" :size="18" /></view>
            <text>待发货订单</text>
            <text class="todo-count">{{ waiting }}</text>
            <Icon name="chevron-right" :size="13" />
          </button>
          <button class="todo-row" @click="orders('已完成')">
            <view class="todo-icon pink"><Icon name="receipt" tone="orange" :size="18" /></view>
            <text>已完成订单</text>
            <text class="todo-count pink-count">{{ completed }}</text>
            <Icon name="chevron-right" :size="13" />
          </button>
          <button class="todo-row" @click="openShop">
            <view class="todo-icon orange"><Icon name="settings" tone="orange" :size="18" /></view>
            <text>完善店铺资料</text>
            <text class="todo-tag">让同好更了解你</text>
            <Icon name="chevron-right" :size="13" />
          </button>
        </view>
      </template>
      <view v-if="tab === 'home' || tab === 'orders'" class="orders-section">
        <view class="section-heading">
          <view class="section-heading-title">
            <text>{{ tab === 'home' ? '最近订单' : '小店的订单' }}</text>
          </view>
          <button v-if="tab === 'home'" class="text-link" @click="orders('全部')">
            查看全部
            <Icon name="chevron-right" :size="12" />
          </button>
          <text v-else class="list-count">{{ visibleOrders.length }} 笔</text>
        </view>
        <view class="status-tabs">
          <button
            v-for="item in ['待发货', '待收货', '已完成', '全部']"
            :key="item"
            :class="{ selected: status === item }"
            :data-testid="`status-${item}`"
            @click="status = item"
          >
            {{ item }}
            <text v-if="item === '待发货' && waiting">{{ waiting }}</text>
          </button>
        </view>
        <view
          v-for="order in visibleOrders"
          :key="order.id"
          class="merchant-order"
          :data-testid="`order-${order.id}`"
        >
          <view class="merchant-order-heading">
            <view class="order-buyer">
              <Icon name="user" :size="12" />
              {{ order.buyer }}
            </view>
            <text class="merchant-order-status">
              {{ order.status }}
            </text>
          </view>
          <view class="merchant-order-product" @click="inspectOrder(order)">
            <OrderItems :order="order" compact />
            <text class="merchant-order-price">¥{{ money(order.amount) }}</text>
          </view>
          <view class="merchant-order-footer">
            <text>{{ order.createdAt }}</text>
            <button
              v-if="order.status === '待发货'"
              class="order-action"
              :data-testid="`ship-${order.id}`"
              @click="openShip(order)"
            >
              <Icon name="truck" tone="orange" :size="13" />
              去发货
            </button>
            <button v-else class="order-action neutral-action" @click="inspectOrder(order)">
              查看详情
            </button>
          </view>
        </view>
        <view v-if="!visibleOrders.length" class="empty-state">
          <Icon name="receipt" tone="orange" :size="35" />
          <text class="empty-title">这一栏已经整理好了</text>
          <text class="empty-copy">去看看其他订单，或为小店准备下一次上新。</text>
        </view>
      </view>
      <view v-if="tab === 'products'" class="products-section">
        <view class="product-toolbar">
          <text class="product-total">把每一份心意，好好陈列</text>
          <button class="new-product-button" @click="editProduct()">
            <Icon name="plus" tone="white" :size="14" />
            发布商品
          </button>
        </view>
        <view class="product-filters">
          <button
            v-for="item in ['全部', '在售', '仓库']"
            :key="item"
            :class="{ selected: productFilter === item }"
            @click="productFilter = item"
          >
            {{ item }}
          </button>
        </view>
        <view
          v-for="product in visibleProducts"
          :key="product.id"
          class="managed-product"
          :data-testid="`managed-${product.id}`"
        >
          <view class="managed-product-main">
            <image :src="product.cover" mode="aspectFill" />
            <view>
              <text class="managed-product-title">{{ product.title }}</text>
              <text class="managed-product-stock">
                库存 {{ product.stock }} · 已售 {{ product.sold }}
              </text>
              <text class="managed-product-price">¥{{ money(product.price) }}</text>
            </view>
            <text class="publication-status" :class="{ off: !product.published }">
              {{ product.published ? '在售' : '已下架' }}
            </text>
          </view>
          <view class="managed-product-actions">
            <button
              @click="toggleProduct(product.id)"
              :disabled="busy"
              :data-testid="`toggle-${product.id}`"
            >
              {{ product.published ? '下架' : '上架' }}
            </button>
            <button
              class="edit-action"
              @click="editProduct(product)"
              :data-testid="`edit-${product.id}`"
            >
              编辑商品
            </button>
          </view>
        </view>
      </view>
      <view v-if="tab === 'profile'" class="merchant-profile">
        <image :src="DEMO_ASSETS.figurine" class="profile-shop-logo" mode="aspectFill" />
        <text class="profile-shop-name">{{ state.shop.name }}</text>
        <text class="profile-shop-description">{{ state.shop.description }}</text>
        <view class="profile-menu">
          <button @click="openShop">
            <Icon name="bag" tone="orange" />
            <text>店铺资料</text>
            <Icon name="chevron-right" :size="16" />
          </button>
          <button @click="sheet = 'message'">
            <Icon name="message" tone="purple" />
            <text>小店消息</text>
            <Icon name="chevron-right" :size="16" />
          </button>
          <button @click="reset">
            <Icon name="settings" :size="21" />
            <text>重置本店演示数据</text>
            <Icon name="chevron-right" :size="16" />
          </button>
        </view>
        <button class="secondary-button" data-testid="switch-role" @click="openLogin('user')">
          切换身份
        </button>
        <button class="secondary-button" data-testid="logout" @click="logout">退出登录</button>
        <text class="demo-explanation">
          当前为商家端视觉样板，商品、库存与订单已和用户端联动，所有支付与物流均为模拟。
        </text>
      </view>
      <view v-if="tab === 'home'" class="merchant-encouragement">
        <Icon name="sparkles" tone="orange" :size="16" />
        <text>小小的店，也装得下大大的热爱。</text>
      </view>
    </view>
    <BottomNav :current="tab" merchant @change="changeTab" />
    <Sheet :visible="sheet === 'ship'" title="把心意送出去" @close="sheet = ''">
      <OrderItems v-if="activeOrder" :order="activeOrder" compact />
      <text class="form-label">物流公司</text>
      <text v-if="activeOrder" class="form-note">
        收货：{{ activeOrder.recipient.name }} · {{ activeOrder.recipient.phone }} ·
        {{ activeOrder.recipient.address }}
      </text>
      <input
        v-model="carrier"
        class="form-input"
        placeholder="例如：顺丰速运"
        aria-label="物流公司"
        data-testid="ship-carrier"
        maxlength="30"
      />
      <text class="form-label">物流单号</text>
      <input
        v-model="tracking"
        class="form-input"
        placeholder="请输入 8–24 位物流单号"
        aria-label="物流单号"
        data-testid="ship-tracking"
        maxlength="24"
      />
      <text v-if="error" class="form-error" data-testid="ship-error">{{ error }}</text>
      <text class="form-note">本次为本地模拟发货，不会联系真实物流公司。</text>
      <button
        class="primary-button merchant-primary"
        :disabled="busy"
        :loading="busy"
        @click="ship"
        data-testid="confirm-ship"
      >
        确认模拟发货
      </button>
    </Sheet>
    <Sheet :visible="sheet === 'order'" title="订单详情" @close="sheet = ''">
      <template v-if="activeOrder">
        <OrderItems :order="activeOrder" />
        <text class="order-detail-amount">合计 ¥{{ money(activeOrder.amount) }}</text>
        <view class="order-detail-row">
          <text>订单编号</text>
          <text>{{ activeOrder.id }}</text>
        </view>
        <view class="order-detail-row">
          <text>订单状态</text>
          <text>{{ activeOrder.status }}</text>
        </view>
        <view class="order-detail-row">
          <text>同好昵称</text>
          <text>{{ activeOrder.buyer }}</text>
        </view>
        <view class="order-detail-row">
          <text>收货人</text>
          <text>{{ activeOrder.recipient.name }} · {{ activeOrder.recipient.phone }}</text>
        </view>
        <view class="order-detail-row">
          <text>收货地址</text>
          <text>{{ activeOrder.recipient.address }}</text>
        </view>
        <view v-if="activeOrder.completedAt" class="order-detail-row">
          <text>完成时间</text>
          <text>{{ activeOrder.completedAt }}</text>
        </view>
        <view v-if="activeOrder.tracking" class="tracking-info">
          <Icon name="truck" tone="orange" />
          <view>
            <text>{{ activeOrder.carrier }}</text>
            <text>{{ activeOrder.tracking }}</text>
          </view>
        </view>
        <text class="form-note">此订单为演示样例，不包含真实个人或交易信息。</text>
      </template>
    </Sheet>
    <Sheet
      :visible="sheet === 'product'"
      :title="productId ? '编辑这份好物' : '让新灵感上岛'"
      @close="sheet = ''"
    >
      <view v-if="!productId" class="cover-choices">
        <button
          v-for="cover in [DEMO_ASSETS.figurine, DEMO_ASSETS.hero]"
          :key="cover"
          :class="{ chosen: productCover === cover }"
          @click="productCover = cover"
        >
          <image :src="cover" mode="aspectFill" />
          <text>{{ productCover === cover ? '已选封面' : '选择封面' }}</text>
        </button>
      </view>
      <text class="form-label">商品名称</text>
      <input
        v-model="productTitle"
        class="form-input"
        placeholder="给这份心意起一个名字"
        aria-label="商品名称"
        data-testid="edit-product-title"
        maxlength="60"
      />
      <text class="form-label">价格（元）</text>
      <input
        v-model="productPrice"
        class="form-input"
        type="digit"
        placeholder="例如 128.00"
        aria-label="商品价格"
        data-testid="edit-product-price"
      />
      <text class="form-label">库存数量</text>
      <input
        v-model="productStock"
        class="form-input"
        type="number"
        placeholder="请输入整数库存"
        aria-label="商品库存"
        data-testid="edit-product-stock"
      />
      <text v-if="error" class="form-error">{{ error }}</text>
      <text class="form-note">保存后将同步到用户端商品列表。</text>
      <button
        class="primary-button merchant-primary"
        :disabled="busy"
        :loading="busy"
        @click="saveProduct"
        data-testid="save-product"
      >
        {{ productId ? '保存修改' : '发布这份好物' }}
      </button>
    </Sheet>
    <Sheet :visible="sheet === 'shop'" title="打理你的小店" @close="sheet = ''">
      <text class="form-label">店铺名称</text>
      <input v-model="shopName" class="form-input" maxlength="20" aria-label="店铺名称" />
      <text class="form-label">一句话介绍</text>
      <input v-model="shopDescription" class="form-input" maxlength="50" aria-label="店铺介绍" />
      <text v-if="error" class="form-error">{{ error }}</text>
      <text class="form-note">把小店的独特之处，介绍给每一位同好。</text>
      <button
        class="primary-button merchant-primary"
        :disabled="busy"
        :loading="busy"
        @click="saveShop"
      >
        保存店铺资料
      </button>
    </Sheet>
    <Sheet :visible="sheet === 'message'" title="小店来信" @close="sheet = ''">
      <view class="shop-message">
        <Icon name="truck" tone="blue" :size="24" />
        <view>
          <text>有 {{ waiting }} 份心意等待出发</text>
          <text>认真打包，让每一次期待都被温柔接住。</text>
        </view>
      </view>
      <view class="shop-message">
        <Icon name="sparkles" tone="orange" :size="24" />
        <view>
          <text>欢迎把热爱带上岛</text>
          <text>作品、商品与小店，会在这里遇见同频的人。</text>
        </view>
      </view>
      <button class="secondary-button" @click="viewWaitingOrders">去处理待发货订单</button>
    </Sheet>
  </view>
</template>

<style scoped>
.merchant-screen {
  background: #faf8f6;
}
.workspace-body {
  padding: 11px 20px 0;
}
.shop-banner {
  position: relative;
  border: 1px solid #f3e8dd;
  border-radius: 16px;
  background: #fffaf5;
  overflow: hidden;
}
.shop-banner-art {
  position: absolute;
  width: 160px;
  height: 160px;
  border: 1px solid #f5e1cd;
  border-radius: 50%;
  right: -60px;
  top: -80px;
}
.shop-banner-top {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 14px 15px;
  position: relative;
}
.shop-logo {
  height: 51px;
  width: 51px;
  border-radius: 13px;
  border: 3px solid white;
}
.shop-banner-copy {
  flex: 1;
  min-width: 0;
}
.shop-title-line {
  display: flex;
  align-items: center;
  gap: 7px;
}
.shop-title-line > text:first-child {
  font-size: 16px;
  font-weight: 750;
}
.open-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #71a589;
  font-size: 8px;
  white-space: nowrap;
  background: #f0f8ee;
  padding: 3px 5px;
  border-radius: 4px;
}
.open-badge view {
  width: 4px;
  height: 4px;
  background: #83b69b;
  border-radius: 50%;
}
.shop-tagline {
  display: block;
  color: #ad9988;
  font-size: 9px;
  margin-top: 7px;
}
.shop-identity {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #c5a17c;
  font-size: 8px;
  margin-top: 7px;
}
.manage-shop {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #f1e5d8;
  margin: 0;
  padding: 8px;
  border-radius: 9px;
  display: flex;
}
.shop-banner-bottom {
  padding: 10px 15px;
  font-size: 9px;
  color: #c2a388;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(246, 230, 212, 0.36);
  border-top: 1px solid #f5e8da;
}
.overview {
  margin-top: 21px;
  padding-bottom: 16px;
  border-bottom: 1px solid #efe9e3;
}
.overview-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 650;
}
.overview-dot {
  width: 3px;
  height: 3px;
  background: #d7c8bb;
  border-radius: 50%;
}
.overview-label {
  font-size: 9px;
  font-weight: 400;
  color: #9b8778;
}
.metrics {
  display: flex;
  justify-content: space-between;
  padding: 6px 0 0;
}
.metrics > view {
  flex: 1;
  text-align: center;
  border-right: 1px solid #eee8e2;
}
.metrics > view:last-child {
  border: 0;
}
.metric-value {
  display: block;
  color: #4c4149;
  font-weight: 750;
  font-size: 26px;
  letter-spacing: -0.5px;
  line-height: 1.5;
}
.metric-value > text {
  font-size: 15px;
  margin-right: 3px;
}
.metric-money .metric-value {
  color: #d99a60;
}
.metric-label {
  display: block;
  color: #8e7e76;
  font-size: 11px;
  margin: 4px 0 6px;
}
.metric-detail {
  color: #a8917f;
  font-size: 9px;
}
.quick-actions {
  display: flex;
  gap: 8px;
  padding: 19px 0 21px;
}
.quick-actions > button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  padding: 0;
  margin: 0;
  line-height: 1.5;
  font-size: 11px;
  color: #77645c;
}
.quick-action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 43px;
  height: 43px;
  border-radius: 15px;
  margin-bottom: 9px;
}
.peach {
  background: #ffead9;
}
.mint {
  background: #e4f3ed;
}
.lilac {
  background: #eee5f7;
}
.quick-action-note {
  font-size: 9px;
  color: #a38e7f;
  margin-top: 5px;
}
.todo-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 5px;
  margin-bottom: 13px;
}
.todo-heading .section-heading-title {
  font-size: 16px;
}
.heading-accent {
  width: 4px;
  height: 15px;
  border-radius: 3px;
  background: #e7b986;
}
.todo-total {
  font-size: 9px;
  color: #c1ad9d;
}
.todo-card {
  background: white;
  border: 1px solid #f2ece7;
  border-radius: 14px;
  padding: 0 13px;
}
.todo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  width: 100%;
  border-radius: 0;
  border-bottom: 1px solid #f7f2ed;
  line-height: 1.5;
  margin: 0;
  padding: 10px 0;
  text-align: left;
  font-size: 12px;
  color: #7b6d65;
}
.todo-row:last-child {
  border: 0;
}
.todo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  border-radius: 10px;
}
.todo-icon.blue {
  background: #eaf0fc;
}
.todo-icon.pink {
  background: #ffedf2;
}
.todo-icon.orange {
  background: #fff2e4;
}
.todo-count {
  margin-left: auto;
  color: #7296da;
  background: #f0f4ff;
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 650;
}
.pink-count {
  color: #d88ca7;
  background: #fff1f5;
}
.todo-tag {
  margin-left: auto;
  font-size: 8px;
  color: #c4afa0;
}
.orders-section {
  margin-top: 26px;
}
.orders-section .section-heading-title {
  font-size: 16px;
}
.list-count {
  font-size: 11px;
  color: #b09b8b;
}
.status-tabs {
  display: flex;
  gap: 20px;
  margin: 3px 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee7e0;
}
.status-tabs button {
  margin: 0;
  padding: 0;
  color: #b3a398;
  background: transparent;
  border-radius: 0;
  font-size: 11px;
  line-height: 1.5;
}
.status-tabs button.selected {
  color: #c28c57;
  font-weight: 650;
}
.status-tabs button text {
  margin-left: 4px;
  font-size: 8px;
  background: #faead7;
  border-radius: 4px;
  padding: 1px 4px;
}
.merchant-order {
  background: white;
  border: 1px solid #f1ebe5;
  border-radius: 13px;
  margin-bottom: 12px;
  padding: 13px;
}
.merchant-order-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  padding-bottom: 13px;
}
.merchant-order-heading > .order-buyer {
  display: flex;
  gap: 5px;
  align-items: center;
  color: #99867c;
}
.merchant-order-status {
  color: #b58b62;
  font-size: 9px;
}
.merchant-order-status.status-refund {
  color: #de8da9;
}
.merchant-order-product > .order-items {
  flex: 1;
}
.merchant-order-product {
  display: flex;
  gap: 10px;
}
.merchant-order-product image {
  height: 69px;
  width: 61px;
  border-radius: 8px;
}
.merchant-order-copy {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 550;
  line-height: 1.7;
}
.merchant-order-variant {
  display: block;
  color: #bca99e;
  font-size: 9px;
  font-weight: 400;
  margin-top: 5px;
}
.merchant-order-number {
  display: block;
  font-size: 8px;
  color: #d1c0b5;
  font-weight: 400;
  margin-top: 5px;
}
.merchant-order-price {
  font-size: 13px;
  color: #756258;
  font-weight: 650;
  white-space: nowrap;
}
.merchant-order-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #faf5f1;
}
.merchant-order-footer > text {
  font-size: 8px;
  color: #a78e7e;
}
.order-action {
  display: flex;
  gap: 4px;
  align-items: center;
  border: 1px solid #eddbc6;
  background: #fffaf3;
  color: #c19260;
  padding: 5px 11px;
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
  border-radius: 6px;
}
.refund-action {
  border-color: #efd5df;
  background: #fff7fa;
  color: #cd8ba6;
}
.neutral-action {
  border-color: #e9e0d8;
  background: white;
  color: #b3a193;
}
.merchant-encouragement {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #c7b29e;
  font-size: 9px;
  padding: 19px 0 8px;
}
.product-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 21px;
  gap: 10px;
}
.product-total {
  font-size: 10px;
  color: #b49e8d;
}
.new-product-button {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: white;
  background: #deb080;
  border-radius: 8px;
  padding: 9px 11px;
  line-height: 1.5;
  margin: 0;
}
.product-filters {
  display: flex;
  gap: 23px;
  margin-bottom: 20px;
}
.product-filters button {
  padding: 0 0 9px;
  margin: 0;
  background: transparent;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #b7a494;
}
.product-filters button.selected {
  border-color: #d7ad7e;
  color: #b68c5c;
}
.managed-product {
  background: white;
  border-radius: 13px;
  border: 1px solid #f1e8df;
  margin-bottom: 13px;
  padding: 15px 13px;
}
.managed-product-main {
  display: flex;
  gap: 11px;
  align-items: flex-start;
}
.managed-product-main image {
  width: 72px;
  height: 85px;
  border-radius: 9px;
}
.managed-product-main > view {
  flex: 1;
  min-width: 0;
}
.managed-product-title {
  font-size: 12px;
  line-height: 1.7;
  display: block;
}
.managed-product-stock {
  display: block;
  font-size: 9px;
  color: #baaa9c;
  margin-top: 8px;
}
.managed-product-price {
  display: block;
  color: #c59160;
  font-size: 16px;
  margin-top: 12px;
  font-weight: 650;
}
.publication-status {
  color: #88ad96;
  background: #f1f7ef;
  font-size: 8px;
  padding: 3px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.publication-status.off {
  color: #bbaaa0;
  background: #f7f3f0;
}
.managed-product-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}
.managed-product-actions button {
  font-size: 10px;
  padding: 6px 12px;
  background: white;
  color: #baa597;
  border: 1px solid #eee3d8;
  border-radius: 7px;
  line-height: 1.4;
  margin: 0;
}
.managed-product-actions button.edit-action {
  color: #c0976f;
  background: #fffbf6;
  border-color: #ead9c4;
}
.merchant-profile {
  padding-top: 24px;
  text-align: center;
}
.profile-shop-logo {
  height: 85px;
  width: 85px;
  border-radius: 23px;
  border: 4px solid white;
  box-shadow: 0 6px 20px #eadecf;
}
.profile-shop-name {
  display: block;
  font-size: 22px;
  font-weight: 750;
  margin: 18px 0 10px;
}
.profile-shop-description {
  font-size: 12px;
  color: #bea48f;
}
.profile-menu {
  background: white;
  border-radius: 14px;
  padding: 0 16px;
  margin-top: 30px;
}
.profile-menu button {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 20px 0;
  background: white;
  border-bottom: 1px solid #f6eee7;
  margin: 0;
  line-height: 1.5;
  border-radius: 0;
  color: #9c8372;
}
.profile-menu button:last-child {
  border: 0;
}
.profile-menu button text {
  flex: 1;
  text-align: left;
  font-size: 13px;
}
.demo-explanation {
  display: block;
  color: #c2ac99;
  font-size: 10px;
  line-height: 1.9;
  margin-top: 25px;
}
.shipping-summary {
  display: flex;
  gap: 13px;
  align-items: center;
}
.shipping-summary image {
  width: 70px;
  height: 80px;
  border-radius: 10px;
}
.shipping-summary > view {
  flex: 1;
  font-size: 13px;
  line-height: 1.7;
}
.shipping-summary-note {
  display: block;
  color: #bba494;
  font-size: 10px;
  margin-top: 8px;
}
.merchant-primary {
  background: #d9a674;
}
.order-detail-amount {
  display: block;
  color: #ce9a6a;
  font-size: 20px;
  font-weight: 650;
  margin-top: 9px;
}
.order-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  padding: 16px 0;
  border-bottom: 1px solid #f7efe8;
}
.order-detail-row > text:first-child {
  color: #b5a092;
}
.order-detail-row > text:last-child {
  color: #826e5e;
}
.tracking-info {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fffbf5;
  padding: 13px;
  border-radius: 10px;
  margin-top: 20px;
}
.tracking-info text {
  display: block;
  color: #b58e67;
  font-size: 12px;
  line-height: 1.9;
}
.cover-choices {
  display: flex;
  gap: 12px;
}
.cover-choices button {
  border: 2px solid transparent;
  background: #faf5ef;
  border-radius: 12px;
  margin: 0;
  padding: 5px;
  font-size: 10px;
  color: #bba18d;
  line-height: 1.5;
}
.cover-choices button.chosen {
  border-color: #deba92;
}
.cover-choices image {
  width: 70px;
  height: 75px;
  border-radius: 8px;
  display: block;
  margin-bottom: 6px;
}
.shop-message {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  margin-bottom: 23px;
  padding-bottom: 23px;
  border-bottom: 1px solid #f3ebe3;
}
.shop-message text {
  display: block;
  font-size: 13px;
  line-height: 1.7;
}
.shop-message text + text {
  font-size: 11px;
  color: #b7a28e;
  margin-top: 7px;
}
@media (max-width: 360px) {
  .workspace-body {
    padding-left: 15px;
    padding-right: 15px;
  }
  .shop-title-line {
    gap: 4px;
  }
  .shop-title-line > text:first-child {
    font-size: 14px;
  }
  .overview-label {
    font-size: 8px;
  }
  .quick-action-note {
    font-size: 7px;
  }
  .status-tabs {
    gap: 18px;
  }
}
</style>
