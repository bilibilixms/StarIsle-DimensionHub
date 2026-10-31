<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import { orderItems, money, type DemoOrder } from '@starisle/shared/demo'
const props = defineProps<{ order: DemoOrder; detail?: boolean; compact?: boolean }>()
const emit = defineEmits<{ open: [productId: string] }>()
const items = computed(() => orderItems(props.order))
function open(productId: string) {
  if (props.detail) emit('open', productId)
}
</script>
<template>
  <view class="order-items" :class="{ compact }">
    <view
      v-for="(item, index) in items"
      :key="`${item.productId}-${item.variant}`"
      class="order-item"
      :role="detail ? 'button' : undefined"
      :tabindex="detail ? 0 : undefined"
      :aria-label="detail ? `查看商品：${item.title}` : undefined"
      :data-testid="detail && index === 0 ? 'order-detail-product' : `order-item-${item.productId}`"
      @click="open(item.productId)"
      @keydown.enter.stop="open(item.productId)"
    >
      <image :src="item.cover" mode="aspectFill" />
      <view class="order-item-copy">
        <text
          class="order-item-title"
          :data-testid="detail && index === 0 ? 'order-detail-title' : undefined"
        >
          {{ item.title }}
        </text>
        <text class="order-item-variant">{{ item.variant }} × {{ item.quantity }}</text>
        <text v-if="detail" class="order-item-unit">单价 ¥{{ money(item.unitPrice) }}</text>
      </view>
      <text v-if="items.length > 1" class="order-item-amount">¥{{ money(item.amount) }}</text>
      <Icon v-if="detail" name="chevron-right" :size="14" />
    </view>
    <text v-if="items.length > 1" class="order-items-count" data-testid="order-items-count">
      共 {{ items.length }} 款商品，{{ order.quantity }} 件
    </text>
  </view>
</template>
<style scoped>
.order-items {
  width: 100%;
  min-width: 0;
}
.order-item {
  display: flex;
  gap: 13px;
  align-items: center;
  margin: 0 0 16px;
  text-align: left;
  line-height: 1.6;
}
.order-item:last-child {
  margin-bottom: 0;
}
.order-item[role='button'] {
  cursor: pointer;
}
.order-item > image {
  width: 80px;
  height: 92px;
  border-radius: 10px;
  flex-shrink: 0;
}
.order-item-copy {
  flex: 1;
  min-width: 0;
}
.order-item-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  word-break: break-all;
}
.order-item-variant {
  display: block;
  margin-top: 7px;
  font-size: 12px;
  color: #a18bad;
}
.order-item-unit {
  display: block;
  margin-top: 7px;
  color: #7c658d;
  font-size: 12px;
}
.order-item-amount {
  color: #b58caa;
  font-size: 12px;
}
.order-items-count {
  display: block;
  color: #a18bad;
  font-size: 11px;
  margin: 6px 0 12px;
}
.compact .order-item {
  gap: 11px;
}
.compact .order-item > image {
  width: 58px;
  height: 65px;
  border-radius: 8px;
}
.compact .order-item-title {
  font-size: 12px;
}
.compact .order-item-variant {
  font-size: 10px;
  margin-top: 5px;
}
</style>
