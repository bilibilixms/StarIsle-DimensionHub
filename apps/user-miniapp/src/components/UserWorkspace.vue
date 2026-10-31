<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppHeader from '@starisle/ui/AppHeader.vue'
import BottomNav from '@starisle/ui/BottomNav.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import Icon from '@starisle/ui/Icon.vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import HomeContent from './HomeContent.vue'
import CartContent from './CartContent.vue'
import ProfileContent from './ProfileContent.vue'
import { getDemoSession, openLogin, requireDemoLogin } from '@starisle/shared/auth'

const { state, refresh, sync, syncError, connected, syncing } = useDemoSync()
const props = defineProps<{ initialTab?: string }>()
const tab = ref(props.initialTab || 'home')
const messages = ref(false)
const read = ref(false)
const cartCount = computed(() => state.value.cart.reduce((sum, item) => sum + item.quantity, 0))
const title = computed(() =>
  tab.value === 'cart' ? '购物车' : tab.value === 'profile' ? '我的小岛' : '星屿',
)
function changeTab(value: string) {
  if (value === 'cart' && !requireDemoLogin('user', '/pages/index/index?tab=cart')) return
  tab.value = value
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  refresh()
}
watch(
  () => props.initialTab,
  (value) => {
    if (value) tab.value = value
  },
)
</script>

<template>
  <view class="app-screen">
    <AppHeader
      :title="title"
      :subtitle="tab === 'home' || tab === 'discover' ? '次元聚集地' : ''"
      badge
      @message="messages = true"
    />
    <SyncStatus :connected="connected" :syncing="syncing" :error="syncError" @retry="sync" />
    <HomeContent
      v-if="tab === 'home' || tab === 'discover'"
      :state="state"
      :discover="tab === 'discover'"
      @refresh="refresh"
    />
    <CartContent
      v-else-if="tab === 'cart'"
      :state="state"
      @refresh="refresh"
      @completed="changeTab('profile')"
      @browse="changeTab('home')"
    />
    <ProfileContent
      v-else-if="getDemoSession()"
      :state="state"
      @refresh="refresh"
      @browse="changeTab('home')"
    />
    <view v-else class="empty-state">
      <Icon name="user" tone="purple" :size="44" />
      <text class="empty-title">登录，拥有自己的小岛</text>
      <text class="empty-copy">收藏喜欢的好物，查看自己的订单。</text>
      <button
        class="primary-button"
        data-testid="guest-login"
        @click="openLogin('user', '/pages/index/index?tab=profile')"
      >
        登录 / 注册
      </button>
      <button class="secondary-button" data-testid="guest-switch" @click="openLogin()">
        选择其他身份
      </button>
    </view>
    <BottomNav :current="tab" :cart-count="cartCount" @change="changeTab" />
    <Sheet :visible="messages" title="来自小岛的消息" @close="messages = false">
      <view class="message-item">
        <Icon name="sparkles" tone="purple" :size="24" />
        <view>
          <text class="message-title">欢迎登岛，小星同学</text>
          <text class="message-copy">这里有周边、创作，还有和你一样热爱的人。</text>
        </view>
        <view v-if="!read" class="unread-dot" />
      </view>
      <view class="message-item">
        <Icon name="bag" tone="pink" :size="24" />
        <view>
          <text class="message-title">星之花旅人，已经上岛</text>
          <text class="message-copy">去收藏第一份心动吧。</text>
        </view>
      </view>
      <button class="secondary-button" @click="read = true">
        {{ read ? '消息已读' : '全部标为已读' }}
      </button>
    </Sheet>
  </view>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding: 0 0 22px;
  margin-bottom: 20px;
  border-bottom: 1px solid #f1eaf8;
}
.message-item > view {
  flex: 1;
}
.message-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.message-copy {
  display: block;
  font-size: 12px;
  line-height: 1.8;
  color: #a794b6;
  margin-top: 8px;
}
.unread-dot {
  width: 5px;
  height: 5px;
  background: #ed83a5;
  border-radius: 50%;
  flex: 0 0 5px !important;
}
</style>
