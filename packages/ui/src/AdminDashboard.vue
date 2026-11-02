<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Sheet from './Sheet.vue'
import {
  loadAdminState,
  submitAdminCommand,
  type AdminState,
  type AdminCommand,
} from '@starisle/shared/admin'
import { money, orderItems, type DemoOrder } from '@starisle/shared/demo'
const state = ref<AdminState>()
const tab = ref('home')
const query = ref('')
const filter = ref('全部')
const error = ref('')
const busy = ref(false)
const loading = ref(false)
const action = ref<{ title: string; command: AdminCommand; required: boolean }>()
const reason = ref('')
const actionError = ref('')
const detail = ref<DemoOrder>()
watch(state, (next) => {
  if (detail.value) detail.value = next?.orders.find((order) => order.id === detail.value?.id)
})
const notice = ref('')
let epoch = 0
let stopped = false
let timer: ReturnType<typeof setInterval> | undefined
const tabs = [
  { key: 'home', label: '工作台' },
  { key: 'accounts', label: '账号管理' },
  { key: 'shops', label: '商家审核' },
  { key: 'products', label: '商品管理' },
  { key: 'orders', label: '订单查询' },
  { key: 'logs', label: '操作记录' },
]
const statusNames: Record<string, string> = {
  PENDING: '待审核',
  ACTIVE: '营业中',
  REJECTED: '审核未通过',
  SUSPENDED: '已暂停',
  user: '用户',
  merchant: '商家',
  admin: '管理员',
}
const label = (value: string) => statusNames[value] || value
const shopStatus = (shop: { status?: string }) => label(shop.status || 'ACTIVE')
const filters = computed(
  () =>
    ({
      accounts: ['全部', '正常', '已禁用', '用户', '商家'],
      shops: ['全部', '待审核', '营业中', '审核未通过', '已暂停'],
      products: ['全部', '展示中', '商家下架', '管理员下架'],
      orders: ['全部', '待发货', '待收货', '已完成'],
    })[tab.value] || [],
)
const matches = (...values: unknown[]) =>
  values.join(' ').toLowerCase().includes(query.value.trim().toLowerCase())
const accounts = computed(() =>
  (state.value?.accounts || []).filter(
    (a) =>
      matches(a.phone, a.username, a.nickname, a.id) &&
      (filter.value === '全部' ||
        filter.value === (a.disabled ? '已禁用' : '正常') ||
        a.roles.some((r) => label(r) === filter.value)),
  ),
)
const shops = computed(() =>
  (state.value?.shops || []).filter(
    (s) =>
      matches(s.name, s.ownerPhone, s.id, s.reason) &&
      (filter.value === '全部' || filter.value === shopStatus(s)),
  ),
)
const products = computed(() =>
  (state.value?.products || []).filter(
    (p) =>
      matches(p.title, p.shopName, p.id, p.adminReason) &&
      (filter.value === '全部' ||
        (filter.value === '展示中' && p.visible) ||
        (filter.value === '商家下架' && !p.published && !p.adminHidden) ||
        (filter.value === '管理员下架' && p.adminHidden)),
  ),
)
const orders = computed(() =>
  (state.value?.orders || []).filter(
    (o) =>
      matches(
        o.id,
        o.buyer,
        o.buyerId,
        o.shopName,
        o.title,
        o.recipient?.name,
        o.recipient?.phone,
        state.value?.accounts.find((a) => a.id === o.buyerId)?.phone,
      ) &&
      (filter.value === '全部' || o.status === filter.value),
  ),
)
const logs = computed(() =>
  (state.value?.logs || []).filter((l) =>
    matches(l.action, l.targetName, l.targetId, l.reason, l.actor),
  ),
)
const count = computed(
  () =>
    ({
      accounts: accounts.value.length,
      shops: shops.value.length,
      products: products.value.length,
      orders: orders.value.length,
      logs: logs.value.length,
    })[tab.value] || 0,
)
function changeTab(value: string, selected = '全部') {
  tab.value = value
  filter.value = selected
  query.value = ''
  notice.value = ''
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
async function refresh() {
  if (loading.value || busy.value) return
  const current = ++epoch
  loading.value = true
  try {
    const next = await loadAdminState()
    if (!stopped && current === epoch) {
      state.value = next
      error.value = ''
    }
  } catch (cause) {
    if (!stopped && current === epoch)
      error.value = cause instanceof Error ? cause.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}
function open(title: string, command: AdminCommand, required = false) {
  action.value = { title, command, required }
  reason.value = ''
  actionError.value = ''
  notice.value = ''
}
async function submit() {
  if (!action.value || busy.value) return
  if (action.value.required && !reason.value.trim()) {
    actionError.value = '请填写处理原因'
    return
  }
  busy.value = true
  ++epoch
  actionError.value = ''
  try {
    state.value = await submitAdminCommand({ ...action.value.command, reason: reason.value.trim() })
    notice.value = `${action.value.title}成功`
    action.value = undefined
    error.value = ''
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : '操作失败，请重试'
  } finally {
    busy.value = false
  }
}
function reloadAction() {
  action.value = undefined
  void refresh()
}
onMounted(() => {
  void refresh()
  timer = setInterval(() => {
    void refresh()
  }, 2500)
})
onUnmounted(() => {
  stopped = true
  ++epoch
  if (timer) clearInterval(timer)
})
</script>

<template>
  <view class="management" data-testid="admin-dashboard">
    <view class="management-heading">
      <text>平台管理</text>
      <button
        class="text-button"
        data-testid="admin-refresh"
        :disabled="loading || busy"
        @click="refresh"
      >
        {{ loading ? '同步中…' : '刷新' }}
      </button>
    </view>
    <view class="module-nav">
      <button
        v-for="item in tabs"
        :key="item.key"
        :class="{ selected: tab === item.key }"
        :data-testid="`admin-tab-${item.key}`"
        @click="changeTab(item.key)"
      >
        {{ item.label }}
      </button>
    </view>
    <text v-if="error" class="error" role="alert" data-testid="admin-data-error">{{ error }}</text>
    <text v-if="notice" class="notice" role="status" data-testid="admin-notice">{{ notice }}</text>
    <text v-if="!state && !error" class="empty">正在加载管理数据…</text>
    <template v-if="state">
      <template v-if="tab === 'home'">
        <view class="overview-title">
          <text>今日待办</text>
          <text>数据自动同步</text>
        </view>
        <button
          class="pending"
          data-testid="admin-pending-shops"
          @click="changeTab('shops', '待审核')"
        >
          <view>
            <text>商家入驻审核</text>
            <text class="muted">查看申请，处理通过或驳回</text>
          </view>
          <text class="pending-count">{{ state.summary.pendingShops }}</text>
        </button>
        <view class="metrics">
          <button @click="changeTab('accounts')">
            <text>{{ state.summary.accounts }}</text>
            <text>用户与商家账号</text>
          </button>
          <button @click="changeTab('shops', '营业中')">
            <text>{{ state.summary.activeShops }}</text>
            <text>营业店铺</text>
          </button>
          <button @click="changeTab('products', '展示中')">
            <text>{{ state.summary.publishedProducts }}</text>
            <text>展示中商品</text>
          </button>
          <button @click="changeTab('orders')">
            <text>{{ state.summary.orders }}</text>
            <text>订单总数</text>
          </button>
        </view>
        <view class="revenue">
          <text>模拟成交总额</text>
          <text>¥{{ money(state.summary.revenue) }}</text>
        </view>
      </template>
      <template v-else>
        <view class="search">
          <input
            v-model="query"
            maxlength="100"
            :placeholder="tab === 'orders' ? '搜索订单号、用户或店铺' : '搜索名称、账号或关键词'"
            aria-label="管理列表搜索"
            data-testid="admin-search"
          />
        </view>
        <view v-if="filters.length" class="filters">
          <button
            v-for="item in filters"
            :key="item"
            :class="{ selected: filter === item }"
            :data-testid="`admin-filter-${item}`"
            @click="filter = item"
          >
            {{ item }}
          </button>
        </view>
        <text class="result-count">共 {{ count }} 条</text>
        <view v-if="tab === 'accounts'" class="list">
          <view
            v-for="account in accounts"
            :key="account.id"
            class="row"
            :data-testid="`admin-account-${account.id}`"
          >
            <view class="row-heading">
              <text class="title">{{ account.nickname }}</text>
              <text :class="account.disabled ? 'bad' : 'good'">
                {{ account.disabled ? '已禁用' : '正常' }}
              </text>
            </view>
            <text class="muted">
              {{ account.phone || account.username }} · {{ account.roles.map(label).join('、') }}
            </text>
            <text class="identifier">{{ account.id }}</text>
            <text v-if="account.reason" class="reason">处理原因：{{ account.reason }}</text>
            <button
              v-if="!account.roles.includes('admin')"
              class="row-action"
              :disabled="busy"
              :data-testid="`admin-account-action-${account.id}`"
              @click="
                open(
                  account.disabled ? '恢复账号' : '禁用账号',
                  {
                    type: 'setAccountDisabled',
                    id: account.id,
                    version: account.managementVersion,
                    disabled: !account.disabled,
                  },
                  !account.disabled,
                )
              "
            >
              {{ account.disabled ? '恢复账号' : '禁用账号' }}
            </button>
            <text v-else class="muted">平台管理员账号</text>
          </view>
        </view>
        <view v-if="tab === 'shops'" class="list">
          <view
            v-for="shop in shops"
            :key="shop.id"
            class="row"
            :data-testid="`admin-shop-${shop.id}`"
          >
            <view class="row-heading">
              <text class="title">{{ shop.name }}</text>
              <text :class="shop.status === 'ACTIVE' ? 'good' : 'bad'">{{ shopStatus(shop) }}</text>
            </view>
            <text class="muted">商家账号：{{ shop.ownerPhone || '—' }}</text>
            <text class="description">{{ shop.description }}</text>
            <text class="identifier">{{ shop.id }}</text>
            <text v-if="shop.ownerDisabled" class="reason">所属账号已禁用，商品暂停展示。</text>
            <text v-if="shop.reason" class="reason">处理原因：{{ shop.reason }}</text>
            <view v-if="shop.status === 'PENDING'" class="actions">
              <button
                class="row-action"
                :disabled="busy"
                :data-testid="`admin-approve-${shop.id}`"
                @click="
                  open('通过商家审核', {
                    type: 'reviewShop',
                    id: shop.id,
                    version: shop.managementVersion,
                    decision: 'approve',
                  })
                "
              >
                通过审核
              </button>
              <button
                class="row-action danger"
                :disabled="busy"
                :data-testid="`admin-reject-${shop.id}`"
                @click="
                  open(
                    '驳回商家审核',
                    {
                      type: 'reviewShop',
                      id: shop.id,
                      version: shop.managementVersion,
                      decision: 'reject',
                    },
                    true,
                  )
                "
              >
                驳回申请
              </button>
            </view>
            <button
              v-if="shop.status === 'ACTIVE' || shop.status === 'SUSPENDED'"
              class="row-action"
              :disabled="busy"
              :data-testid="`admin-shop-action-${shop.id}`"
              @click="
                open(
                  shop.status === 'SUSPENDED' ? '恢复店铺' : '暂停店铺',
                  {
                    type: 'setShopSuspended',
                    id: shop.id,
                    version: shop.managementVersion,
                    suspended: shop.status !== 'SUSPENDED',
                  },
                  shop.status !== 'SUSPENDED',
                )
              "
            >
              {{ shop.status === 'SUSPENDED' ? '恢复营业' : '暂停店铺' }}
            </button>
          </view>
        </view>
        <view v-if="tab === 'products'" class="list">
          <view
            v-for="product in products"
            :key="product.id"
            class="row"
            :data-testid="`admin-product-${product.id}`"
          >
            <view class="product-heading">
              <image :src="product.cover" mode="aspectFill" />
              <view>
                <text class="title">{{ product.title }}</text>
                <text class="muted">{{ product.shopName }}</text>
                <text class="price">¥{{ money(product.price) }} · 库存 {{ product.stock }}</text>
              </view>
            </view>
            <text class="muted">
              {{
                product.adminHidden
                  ? '管理员下架'
                  : product.visible
                    ? '展示中'
                    : product.published
                      ? '店铺暂未营业'
                      : '商家已下架'
              }}
            </text>
            <text v-if="product.adminReason" class="reason">
              处理原因：{{ product.adminReason }}
            </text>
            <button
              class="row-action"
              :disabled="busy"
              :data-testid="`admin-product-action-${product.id}`"
              @click="
                open(
                  product.adminHidden ? '恢复商品展示' : '下架商品',
                  {
                    type: 'setProductHidden',
                    id: product.id,
                    version: product.managementVersion,
                    hidden: !product.adminHidden,
                  },
                  !product.adminHidden,
                )
              "
            >
              {{ product.adminHidden ? '恢复展示' : '下架商品' }}
            </button>
          </view>
        </view>
        <view v-if="tab === 'orders'" class="list">
          <button
            v-for="order in orders"
            :key="order.id"
            class="row order-row"
            :data-testid="`admin-order-${order.id}`"
            @click="detail = order"
          >
            <view class="row-heading">
              <text class="title">{{ order.shopName || '星屿小店' }}</text>
              <text class="good">{{ order.status }}</text>
            </view>
            <text class="identifier">{{ order.id }}</text>
            <text class="description">{{ order.title }}</text>
            <text class="muted">{{ order.buyer }} · {{ order.recipient?.name }}</text>
            <text class="price">共 {{ order.quantity }} 件 · ¥{{ money(order.amount) }}</text>
          </button>
        </view>
        <view v-if="tab === 'logs'" class="list">
          <view v-for="log in logs" :key="log.id" class="row" data-testid="admin-log">
            <view class="row-heading">
              <text class="title">{{ log.action }}</text>
              <text class="muted">{{ log.actor }}</text>
            </view>
            <text class="description">{{ log.targetName }}</text>
            <text class="identifier">{{ log.targetId }}</text>
            <text class="muted">{{ label(log.before) }} → {{ label(log.after) }}</text>
            <text class="reason">{{ log.reason }}</text>
            <text class="muted">{{ new Date(log.createdAt).toLocaleString('zh-CN') }}</text>
          </view>
        </view>
        <view v-if="!count" class="empty" data-testid="admin-empty">没有符合条件的记录</view>
      </template>
    </template>
    <Sheet
      :visible="!!action"
      :title="action?.title || '处理事项'"
      @close="!busy && (action = undefined)"
    >
      <template v-if="action">
        <text class="description">{{ action.title }}将同步影响用户或商家页面。</text>
        <text class="field-label">处理原因{{ action.required ? '（必填）' : '（选填）' }}</text>
        <textarea
          v-model="reason"
          maxlength="200"
          :disabled="busy"
          placeholder="填写本次操作的原因"
          aria-label="处理原因"
          data-testid="admin-action-reason"
        />
        <text v-if="actionError" class="error" role="alert" data-testid="admin-action-error">
          {{ actionError }}
        </text>
        <button
          class="primary-button"
          :disabled="busy"
          :loading="busy"
          data-testid="admin-confirm-action"
          @click="submit"
        >
          确认{{ action.title }}
        </button>
        <button
          v-if="actionError"
          class="text-button reload"
          :disabled="busy"
          data-testid="admin-reload-action"
          @click="reloadAction"
        >
          关闭并刷新列表
        </button>
      </template>
    </Sheet>
    <Sheet :visible="!!detail" title="订单详情" @close="detail = undefined">
      <view v-if="detail" class="order-detail" data-testid="admin-order-detail">
        <text class="title">{{ detail.status }} · ¥{{ money(detail.amount) }}</text>
        <text class="identifier">{{ detail.id }}</text>
        <text class="description">{{ detail.shopName }}</text>
        <view v-for="(item, index) in orderItems(detail)" :key="index" class="description">
          <text>{{ item.title }}</text>
          <text>{{ item.variant }} × {{ item.quantity }} · ¥{{ money(item.amount) }}</text>
        </view>
        <text class="field-label">收货信息</text>
        <text>{{ detail.recipient?.name }} · {{ detail.recipient?.phone }}</text>
        <text>{{ detail.recipient?.address }}</text>
        <text class="field-label">物流信息</text>
        <text>{{ detail.carrier || '尚未发货' }} {{ detail.tracking || '' }}</text>
        <text class="field-label">下单时间</text>
        <text>{{ detail.createdAt }}</text>
        <text v-if="detail.completedAt">完成时间：{{ detail.completedAt }}</text>
      </view>
    </Sheet>
  </view>
</template>

<style scoped>
.management {
  margin-top: 28px;
  padding-bottom: 24px;
}
.management-heading,
.row-heading,
.overview-title,
.revenue {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.management-heading {
  font-size: 21px;
  font-weight: 700;
  margin-bottom: 18px;
}
.module-nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 22px;
}
.module-nav button,
.filters button {
  margin: 0;
  padding: 10px 5px;
  font-size: 12px;
  line-height: 1.4;
  background: #fff;
  color: #7d6d90;
  border: 1px solid #eae3f1;
  border-radius: 9px;
}
.module-nav button.selected,
.filters button.selected {
  background: #efe7fa;
  border-color: #b9a1db;
  color: #7952b5;
  font-weight: 600;
}
.text-button {
  margin: 0;
  padding: 5px;
  background: transparent;
  font-size: 12px;
  color: #7952b5;
  line-height: 1.4;
  font-weight: 400;
}
.overview-title {
  margin: 24px 0 12px;
  font-size: 16px;
  font-weight: 600;
}
.overview-title > text:last-child {
  font-size: 10px;
  color: #a093ae;
  font-weight: 400;
}
.pending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  width: 100%;
  margin: 0;
  padding: 20px 16px;
  background: #efe7fa;
  border-radius: 12px;
  font-size: 15px;
  line-height: 1.6;
  color: #49365e;
}
.pending-count {
  font-size: 30px;
  color: #7952b5;
  font-weight: 700;
}
.pending .muted {
  margin-top: 5px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 20px;
  border-top: 1px solid #eae3f1;
}
.metrics button {
  padding: 22px 4px;
  margin: 0;
  background: transparent;
  border-bottom: 1px solid #eae3f1;
  border-radius: 0;
  line-height: 1.5;
}
.metrics button > text:first-child {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: #49365e;
}
.metrics button > text:last-child {
  display: block;
  font-size: 11px;
  color: #8b7b9c;
  margin-top: 6px;
}
.revenue {
  margin-top: 22px;
  font-size: 13px;
  color: #8b7b9c;
}
.revenue > text:last-child {
  font-size: 23px;
  font-weight: 650;
  color: #7952b5;
}
.search {
  background: white;
  border: 1px solid #eae3f1;
  border-radius: 10px;
  padding: 0 12px;
  margin-bottom: 14px;
}
.search input {
  height: 43px;
  font-size: 13px;
  width: 100%;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 12px;
}
.filters button {
  padding: 6px 10px;
  font-size: 11px;
}
.result-count {
  display: block;
  font-size: 11px;
  color: #a093ae;
  margin: 10px 0;
}
.list {
  background: #fff;
  border-radius: 12px;
  padding: 0 14px;
}
.row {
  display: block;
  padding: 18px 0;
  border-bottom: 1px solid #eee9f4;
  overflow-wrap: anywhere;
}
.row:last-child {
  border-bottom: 0;
}
.row-heading {
  align-items: flex-start;
  margin-bottom: 7px;
  font-size: 11px;
}
.title {
  display: block;
  font-size: 14px;
  line-height: 1.6;
  font-weight: 650;
  color: #49365e;
}
.muted,
.identifier {
  display: block;
  font-size: 11px;
  line-height: 1.8;
  color: #9b8aa9;
}
.identifier {
  overflow-wrap: anywhere;
  font-size: 10px;
  margin-top: 4px;
}
.good {
  color: #438a78;
  white-space: nowrap;
}
.bad {
  color: #b1714c;
  white-space: nowrap;
}
.reason {
  display: block;
  font-size: 12px;
  line-height: 1.8;
  color: #a33f62;
  margin-top: 7px;
}
.description {
  display: block;
  font-size: 13px;
  line-height: 1.8;
  color: #70607e;
  margin: 7px 0;
}
.row-action {
  display: inline-block;
  background: #f4eefc;
  color: #7952b5;
  border-radius: 7px;
  font-size: 11px;
  line-height: 1.5;
  padding: 7px 11px;
  margin: 10px 0 0;
}
.row-action.danger {
  color: #a33f62;
  background: #fff0f5;
}
.actions {
  display: flex;
  gap: 10px;
}
.product-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}
.product-heading image {
  width: 62px;
  height: 72px;
  border-radius: 7px;
  flex-shrink: 0;
}
.product-heading > view {
  min-width: 0;
  flex: 1;
}
.price {
  display: block;
  font-size: 12px;
  color: #a16a90;
  margin-top: 7px;
}
.order-row {
  width: 100%;
  text-align: left;
  background: transparent;
  border-radius: 0;
  margin: 0;
  line-height: 1.5;
}
.empty {
  text-align: center;
  display: block;
  padding: 35px 8px;
  color: #9b8aa9;
  font-size: 13px;
}
.error {
  display: block;
  color: #a33f62;
  font-size: 12px;
  line-height: 1.8;
  margin: 12px 0;
}
.notice {
  display: block;
  color: #438a78;
  font-size: 12px;
  margin: 12px 0;
}
.field-label {
  display: block;
  font-size: 12px;
  color: #8b7b9c;
  margin: 18px 0 9px;
}
textarea {
  width: 100%;
  height: 95px;
  background: #faf8fe;
  border: 1px solid #eae3f1;
  border-radius: 9px;
  padding: 12px;
  font-size: 13px;
  box-sizing: border-box;
  margin-bottom: 18px;
}
.reload {
  margin: 14px auto 0;
}
.order-detail > text {
  display: block;
  line-height: 1.8;
  font-size: 12px;
}
.order-detail .title {
  font-size: 16px;
}
.order-detail .description > text {
  display: block;
}
</style>
