<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
const props = withDefaults(
  defineProps<{ current: string; merchant?: boolean; cartCount?: number }>(),
  { merchant: false, cartCount: 0 },
)
defineEmits<{ change: [value: string] }>()
const items = computed(() =>
  props.merchant
    ? [
        { key: 'home', label: '工作台', icon: 'home' },
        { key: 'products', label: '商品', icon: 'bag' },
        { key: 'orders', label: '订单', icon: 'receipt' },
        { key: 'profile', label: '我的', icon: 'user' },
      ]
    : [
        { key: 'home', label: '首页', icon: 'home' },
        { key: 'discover', label: '发现', icon: 'compass' },
        { key: 'cart', label: '购物车', icon: 'cart' },
        { key: 'profile', label: '我的', icon: 'user' },
      ],
)
</script>

<template>
  <view class="bottom-nav" :class="{ 'merchant-nav': merchant }">
    <button
      v-for="item in items"
      :key="item.key"
      class="nav-item"
      :class="{ active: current === item.key }"
      :aria-label="item.label"
      :data-testid="`nav-${item.key}`"
      @click="$emit('change', item.key)"
    >
      <view class="nav-icon">
        <Icon
          :name="item.icon"
          :tone="current === item.key ? (merchant ? 'orange' : 'purple') : 'muted'"
          :size="22"
        />
        <text v-if="item.key === 'cart' && cartCount" class="nav-badge">
          {{ cartCount > 99 ? '99+' : cartCount }}
        </text>
      </view>
      <text>{{ item.label }}</text>
      <view v-if="current === item.key" class="active-dot" />
    </button>
  </view>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 30;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 440px;
  display: flex;
  justify-content: space-around;
  background: rgba(255, 255, 255, 0.97);
  border-top: 1px solid #eeeaf3;
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  color: #9891a4;
  font-size: 10px;
  background: transparent;
  width: 25%;
  padding: 4px 0 7px;
  margin: 0;
  line-height: 1.2;
  border-radius: 0;
}
.nav-item.active {
  color: #8b5cf6;
}
.merchant-nav .nav-item.active {
  color: #d48a42;
}
.nav-icon {
  position: relative;
  height: 23px;
}
.nav-badge {
  position: absolute;
  top: -5px;
  left: 14px;
  background: #ed83a3;
  color: white;
  border-radius: 10px;
  font-size: 9px;
  padding: 2px 4px;
  min-width: 8px;
  text-align: center;
  border: 2px solid white;
}
.active-dot {
  position: absolute;
  width: 4px;
  height: 4px;
  bottom: 0;
  border-radius: 50%;
  background: currentColor;
}
</style>
