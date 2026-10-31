<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppHeader from '@starisle/ui/AppHeader.vue'
import BottomNav from '@starisle/ui/BottomNav.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import Icon from '@starisle/ui/Icon.vue'
import SyncStatus from '@starisle/ui/SyncStatus.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import HomeContent from '../../components/HomeContent.vue'
import CartContent from '../../components/CartContent.vue'
import ProfileContent from '../../components/ProfileContent.vue'

const { state, refresh, sync, syncError, connected, syncing } = useDemoSync()
const tab = ref('home')
const messages = ref(false)
const read = ref(false)
const cartCount = computed(() => state.value.cart.reduce((sum, item) => sum + item.quantity, 0))
const title = computed(() =>
  tab.value === 'cart' ? '购物车' : tab.value === 'profile' ? '我的小岛' : '星屿',
)
function changeTab(value: string) {
  tab.value = value
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  refresh()
}
onLoad((query) => {
  if (query?.tab && ['home', 'discover', 'cart', 'profile'].includes(query.tab))
    tab.value = query.tab
})
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
    <ProfileContent v-else :state="state" @refresh="refresh" @browse="changeTab('home')" />
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
