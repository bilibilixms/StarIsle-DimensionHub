<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import {
  money,
  orderItems,
  receiveDemoOrder,
  REFUND_STATUS_LABELS,
  reviewItemKey,
  type DemoOrder,
  type DemoState,
} from '@starisle/shared/demo'
import OrderItems from './OrderItems.vue'

const props = defineProps<{ state: DemoState; searchable?: boolean }>()
const emit = defineEmits<{ refresh: []; browse: [] }>()
const filters = [
  { id: 'all', label: '全部', icon: 'receipt', tone: 'purple' },
  { id: 'shipping', label: '待发货', icon: 'bag', tone: 'purple' },
  { id: 'receiving', label: '待收货', icon: 'truck', tone: 'purple' },
  { id: 'review', label: '待评价', icon: 'message', tone: 'purple' },
  { id: 'aftersale', label: '退款售后', icon: 'refund', tone: 'pink' },
] as const
type Filter = (typeof filters)[number]['id']
type DetailAction = 'logistics' | 'review' | 'aftersale'
const filter = ref<Filter>('all')
const keyword = ref('')
const receiving = ref('')

const reviewedItems = computed(() => {
  const byOrder = new Map<string, Set<string>>()
  for (const { orderId, itemKey } of props.state.reviews) {
    if (!orderId || !itemKey) continue
    let items = byOrder.get(orderId)
    if (!items) {
      items = new Set<string>()
      byOrder.set(orderId, items)
    }
    items.add(itemKey)
  }
  return byOrder
})

const records = computed(() =>
  props.state.orders.map((order) => {
    const items = orderItems(order)
    const reviewed = reviewedItems.value.get(order.id)
    const shop = order.shopName || props.state.shop.name
    const needsReview =
      order.status === '已完成' && items.some((item) => !reviewed?.has(reviewItemKey(item)))
    const aftersale =
      order.status === '退款中' ||
      order.status === '已退款' ||
      !!order.refund ||
      !!order.refundHistory?.length
    return {
      order,
      shop,
      needsReview,
      aftersale,
      showReviews: order.status === '已完成' || !!reviewed?.size,
      searchText: [order.id, shop, ...items.map((item) => item.title)].join(' ').toLowerCase(),
    }
  }),
)
type RecordEntry = (typeof records.value)[number]

function matches(record: RecordEntry, selected: Filter): boolean {
  switch (selected) {
    case 'shipping':
      return record.order.status === '待发货'
    case 'receiving':
      return record.order.status === '待收货'
    case 'review':
      return record.needsReview
    case 'aftersale':
      return record.aftersale
    default:
      return true
  }
}

const shown = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return records.value.filter(
    (record) => matches(record, filter.value) && (!query || record.searchText.includes(query)),
  )
})
const emptyTitle = computed(() => {
  if (keyword.value.trim()) return '没有找到匹配的订单'
  const current = filters.find(({ id }) => id === filter.value)
  return current?.id === 'all' ? '暂时没有订单' : `暂无${current?.label || ''}订单`
})

function openOrder(id: string, action?: DetailAction) {
  uni.navigateTo({
    url: `/pages/order/detail?id=${encodeURIComponent(id)}${action ? '&action=' + action : ''}`,
  })
}

function receive(order: DemoOrder) {
  if (receiving.value) return
  receiving.value = order.id
  uni.showModal({
    title: '确认收到好物',
    content: '确认后订单将完成，商家也会看到收货状态。',
    confirmText: '确认收货',
    async success(result) {
      try {
        if (!result.confirm) return
        await receiveDemoOrder(order.id)
        emit('refresh')
        uni.showToast({ title: '已确认收货', icon: 'success' })
      } catch (error) {
        uni.showToast({
          title: error instanceof Error ? error.message : '操作失败，请重试',
          icon: 'none',
        })
      } finally {
        receiving.value = ''
      }
    },
    fail() {
      receiving.value = ''
    },
  })
}

function aftersaleLabel(order: DemoOrder) {
  if (order.status === '退款中') return '售后进度'
  if (order.status === '已退款') return '退款详情'
  return '申请售后'
}
</script>

<template>
  <view class="buyer-orders">
    <view v-if="searchable" class="order-search">
      <Icon name="search" tone="purple" :size="17" />
      <input
        v-model="keyword"
        confirm-type="search"
        placeholder="搜商品、店铺或订单号"
        aria-label="搜索订单"
        maxlength="100"
        data-testid="buyer-order-search"
      />
      <button
        v-if="keyword"
        class="icon-button clear-order-search"
        aria-label="清除搜索"
        data-testid="clear-order-search"
        @click="keyword = ''"
      >
        <text aria-hidden="true">×</text>
      </button>
    </view>
    <view class="order-filters" role="group" aria-label="订单状态">
      <button
        v-for="entry in filters"
        :key="entry.id"
        class="order-filter"
        :class="{ 'filter-active': filter === entry.id }"
        :aria-pressed="filter === entry.id"
        :data-testid="`buyer-orders-filter-${entry.id}`"
        @click="filter = entry.id"
      >
        <view class="order-filter-icon">
          <Icon :name="entry.icon" :tone="entry.tone" :size="22" />
        </view>
        <text>{{ entry.label }}</text>
      </button>
    </view>
    <view v-if="shown.length" class="buyer-order-list">
      <view
        v-for="{ order, shop, needsReview, showReviews } in shown"
        :key="order.id"
        class="order-card"
        :data-testid="`user-order-${order.id}`"
        role="button"
        tabindex="0"
        :aria-label="`查看${order.status}订单：${order.title}`"
        @click="openOrder(order.id)"
        @keydown.enter.self="openOrder(order.id)"
      >
        <view class="order-card-head">
          <view class="order-shop">
            <Icon name="bag" tone="purple" :size="16" />
            <text>{{ shop }}</text>
          </view>
          <text
            class="order-status"
            :class="{ 'status-aftersale': order.status === '退款中' || order.status === '已退款' }"
          >
            {{ order.status }}
          </text>
        </view>
        <button
          v-if="order.status === '待收货' && order.carrier && order.tracking"
          class="order-update"
          :data-testid="`logistics-${order.id}`"
          aria-label="查看物流"
          @click.stop="openOrder(order.id, 'logistics')"
        >
          <Icon name="truck" tone="purple" :size="16" />
          <text class="update-label">查看物流</text>
          <text class="update-detail">{{ order.carrier }} {{ order.tracking }}</text>
          <Icon name="chevron-right" tone="purple" :size="12" />
        </button>
        <view
          v-else-if="order.status === '退款中' && order.refund"
          class="order-update refund-update"
        >
          <Icon name="receipt" tone="purple" :size="16" />
          <text>{{ REFUND_STATUS_LABELS[order.refund.status] }}</text>
        </view>
        <OrderItems :order="order" compact />
        <view class="order-card-total">
          <text class="order-number">订单号 {{ order.id }}</text>
          <view class="amount">
            <text>实付&#32;</text>
            <text class="order-total">¥{{ money(order.amount) }}</text>
          </view>
        </view>
        <view class="order-card-actions" @click.stop>
          <button
            class="order-action"
            :data-testid="`aftersale-${order.id}`"
            @click.stop="openOrder(order.id, 'aftersale')"
          >
            {{ aftersaleLabel(order) }}
          </button>
          <button
            v-if="showReviews"
            class="order-action"
            :class="{ 'order-action-main': needsReview }"
            :data-testid="`review-order-${order.id}`"
            @click.stop="openOrder(order.id, 'review')"
          >
            {{ needsReview ? '去评价' : '查看评价' }}
          </button>
          <button
            v-if="order.status === '待收货'"
            class="order-action order-action-main"
            :disabled="!!receiving"
            :loading="receiving === order.id"
            :data-testid="`receive-${order.id}`"
            @click.stop="receive(order)"
          >
            确认收货
          </button>
        </view>
      </view>
    </view>
    <view v-else class="orders-empty" data-testid="buyer-orders-empty">
      <Icon name="receipt" tone="purple" :size="28" />
      <text>{{ emptyTitle }}</text>
      <button v-if="keyword" class="order-action" @click="keyword = ''">清除搜索</button>
      <button v-else-if="filter !== 'all'" class="order-action" @click="filter = 'all'">
        查看全部订单
      </button>
      <button v-else class="order-action order-action-main" @click="$emit('browse')">去逛逛</button>
    </view>
  </view>
</template>

<style scoped>
.buyer-orders {
  color: #2d2240;
}
.order-search {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 9px;
  margin-bottom: 10px;
  padding: 0 13px;
  border: 1px solid #e8deef;
  border-radius: 12px;
  background: #fff;
}
.order-search input {
  flex: 1;
  min-width: 0;
  height: 40px;
  font-size: 13px;
}
.clear-order-search {
  width: 30px;
  height: 30px;
  flex: none;
  color: #665775;
  font-size: 21px;
}
.order-filters {
  display: flex;
  gap: 2px;
  margin-bottom: 13px;
  padding: 4px;
  border: 1px solid #443652;
  border-radius: 13px;
  background: #342b46;
}
.order-filter {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 62px;
  margin: 0;
  padding: 6px 0 12px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #e7dcf3;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}
.order-filter-icon {
  display: flex;
  filter: brightness(0) invert(1);
}
.filter-active {
  border-color: #b49ace;
  background: #574369;
  color: #fff;
  font-weight: 700;
}
.filter-active::before {
  position: absolute;
  bottom: 4px;
  left: 50%;
  width: 4px;
  height: 4px;
  transform: translateX(-50%) rotate(45deg);
  background: #f0e6fb;
  content: '';
}
.buyer-order-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.order-card {
  min-width: 0;
  padding: 13px 14px 12px;
  border: 1px solid #e8deef;
  border-radius: 15px;
  background: #fff;
}
.order-card-head,
.order-shop,
.order-update,
.order-card-total,
.amount {
  display: flex;
  align-items: center;
}
.order-card-head {
  justify-content: space-between;
  gap: 9px;
  padding-bottom: 12px;
}
.order-shop {
  min-width: 0;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
}
.order-shop text,
.update-detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-status {
  flex: none;
  padding: 4px 8px;
  border-radius: 7px;
  background: #f2ebfa;
  color: #7242ad;
  font-size: 11px;
  font-weight: 650;
}
.status-aftersale {
  background: #fbedea;
  color: #92464c;
}
.order-update {
  width: 100%;
  min-height: 36px;
  gap: 7px;
  margin: 0 0 12px;
  padding: 7px 9px;
  border-radius: 8px;
  background: #f6f0fb;
  color: #5c3d78;
  font-size: 11px;
  line-height: 1.35;
  text-align: left;
}
.update-label {
  flex: none;
  font-weight: 650;
}
.update-detail {
  flex: 1;
}
.order-card-total {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 7px 12px;
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid #efe9f4;
}
.order-number {
  font-size: 10px;
  color: #665775;
  overflow-wrap: anywhere;
}
.amount {
  gap: 5px;
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.order-total {
  font-size: 15px;
  font-weight: 750;
}
.order-card-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 11px;
}
.order-action {
  flex: none;
  min-height: 34px;
  margin: 0;
  padding: 7px 12px;
  border: 1px solid #ded3e8;
  border-radius: 16px;
  background: #fff;
  color: #51405f;
  font-size: 11px;
  line-height: 1.45;
}
.order-action-main {
  border-color: #9e7bc4;
  background: #f8f2ff;
  color: #6e3da6;
  font-weight: 650;
}
.orders-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 34px 12px;
  border: 1px solid #e8deef;
  border-radius: 15px;
  background: #fff;
  color: #665775;
  font-size: 13px;
}
</style>
