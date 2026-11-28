<script setup lang="ts">
import Icon from '@starisle/ui/Icon.vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import BuyerOrders from './BuyerOrders.vue'

const { state, refresh, sync, syncError, syncing, connected } = useDemoSync()
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0

function back() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index?tab=profile' })
}

function browse() {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<template>
  <view class="app-screen buyer-order-page" data-testid="buyer-orders-page">
    <view class="order-page-nav" :style="{ paddingTop: statusHeight + 'px' }">
      <view class="order-page-heading">
        <button class="icon-button" aria-label="返回" data-testid="buyer-orders-back" @click="back">
          <Icon name="chevron-left" tone="ink" :size="20" />
        </button>
        <text role="heading" aria-level="1" class="order-page-title">我的订单</text>
      </view>
    </view>
    <view class="order-page-content">
      <SyncStatus
        v-if="syncError"
        :connected="connected"
        :syncing="syncing"
        :error="syncError"
        @retry="sync"
      />
      <text v-if="!connected && !syncError && !state.orders.length" class="order-page-loading">
        正在加载订单…
      </text>
      <BuyerOrders v-else :state="state" searchable @refresh="refresh" @browse="browse" />
    </view>
  </view>
</template>

<style scoped>
.buyer-order-page {
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: #fff;
  color: #2d2240;
}
.order-page-heading {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  min-height: 50px;
  padding: 0 12px;
}
.order-page-title {
  font-size: 17px;
  font-weight: 750;
  text-align: center;
}
.order-page-content {
  padding: 6px 14px 0;
}
.order-page-loading {
  display: block;
  padding: 36px 12px;
  color: #665775;
  text-align: center;
}
</style>
