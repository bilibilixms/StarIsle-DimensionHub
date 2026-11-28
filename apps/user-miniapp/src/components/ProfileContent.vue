<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import AddressEditor from './AddressEditor.vue'
import { getDemoSession, logoutDemo, openLogin } from '@starisle/shared/auth'
import {
  DEMO_ASSETS,
  money,
  editDemoRecipient,
  type DemoState,
  type DemoRecipient,
} from '@starisle/shared/demo'
const props = defineProps<{ state: DemoState }>()
const emit = defineEmits<{ refresh: [] }>()
const showFavorites = ref(false)
const addressSheet = ref(false)
const recipient = ref({ ...props.state.recipient })
const editingAddressId = ref<string | null>(null)
const savingAddress = ref(false)
const addressError = ref('')
async function logout() {
  try {
    await logoutDemo()
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '退出失败，请重试',
      icon: 'none',
    })
  }
}
function openAddress() {
  addressError.value = ''
  editingAddressId.value = props.state.defaultAddressId || null
  recipient.value = props.state.addresses.length
    ? { ...props.state.recipient }
    : { name: '', phone: '', address: '' }
  addressSheet.value = true
}
function closeAddress() {
  if (!savingAddress.value) addressSheet.value = false
}
async function saveAddress(value: DemoRecipient) {
  if (savingAddress.value) return
  savingAddress.value = true
  addressError.value = ''
  try {
    await editDemoRecipient(value, editingAddressId.value)
    emit('refresh')
    addressSheet.value = false
  } catch (cause) {
    addressError.value = cause instanceof Error ? cause.message : '地址保存失败，请重试'
  } finally {
    savingAddress.value = false
  }
}
function manageAddresses() {
  uni.navigateTo({ url: '/pages/address/index' })
}

function openOrderList() {
  uni.navigateTo({ url: '/pages/order/index' })
}
function openProduct(id: string) {
  uni.navigateTo({ url: `/pages/product/detail?id=${id}` })
}
</script>

<template>
  <view class="profile-content">
    <view class="profile-card">
      <image :src="DEMO_ASSETS.hero" class="avatar" mode="aspectFill" />
      <view>
        <text class="profile-name">{{ getDemoSession()?.account.nickname || '星屿同学' }}</text>
        <text class="profile-motto">今天也要，为热爱心动。</text>
        <text class="profile-badge">星屿体验官</text>
      </view>
      <Icon name="sparkles" tone="purple" :size="30" />
    </view>
    <button
      class="secondary-button address-button"
      data-testid="edit-recipient"
      @click="openAddress"
    >
      {{
        state.addresses.length
          ? `演示收货地址：${state.recipient.name} · ${state.recipient.phone}`
          : '添加收货地址'
      }}
    </button>
    <button class="secondary-button" data-testid="manage-addresses" @click="manageAddresses">
      管理收货地址（{{ state.addresses.length }}）
    </button>
    <view class="profile-shortcuts">
      <button data-testid="open-order-list" @click="openOrderList">
        <text>{{ state.orders.length }}</text>
        <text>我的订单</text>
      </button>
      <button
        :class="{ active: showFavorites }"
        :aria-expanded="showFavorites"
        @click="showFavorites = !showFavorites"
        data-testid="show-favorites"
      >
        <text data-testid="favorite-count">{{ state.favorites.length }}</text>
        <text>我的收藏</text>
      </button>
    </view>
    <template v-if="showFavorites">
      <view class="section-heading">
        <view class="section-heading-title"><text>心动收藏</text></view>
      </view>
      <view
        v-for="product in state.products.filter((product) => state.favorites.includes(product.id))"
        :key="product.id"
        class="favorite-card"
        @click="openProduct(product.id)"
      >
        <image :src="product.cover" mode="aspectFill" />
        <view>
          <text>{{ product.title }}</text>
          <text class="favorite-price">¥{{ money(product.price) }}</text>
        </view>
        <Icon name="heart" tone="pink" :size="18" />
      </view>
      <view v-if="!state.favorites.length" class="empty-state">
        <Icon name="heart" tone="pink" :size="40" />
        <text class="empty-title">喜欢的，就先收藏起来</text>
        <text class="empty-copy">在商品卡片点亮爱心，下次还能找到它。</text>
      </view>
    </template>
    <view class="profile-actions">
      <button class="secondary-button" data-testid="switch-role" @click="openLogin('merchant')">
        切换身份
      </button>
      <button class="secondary-button logout-button" data-testid="logout" @click="logout">
        退出登录
      </button>
    </view>
    <text class="profile-footnote">这是一座正在生长的小岛。感谢你来做客。</text>
    <Sheet :visible="addressSheet" title="演示收货地址" @close="closeAddress">
      <AddressEditor
        :value="recipient"
        :busy="savingAddress"
        :save-error="addressError"
        :show-default="false"
        label="保存演示地址"
        @save="saveAddress"
      />
    </Sheet>
  </view>
</template>

<style scoped>
.address-button {
  margin: 16px 0;
  width: 100%;
  font-size: 11px;
}
.profile-content {
  padding: 14px 20px;
}
.profile-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 22px 18px;
  background: #eee5f8;
  border-radius: 18px;
}
.avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid white;
  object-position: 80% center;
}
.profile-card > view {
  flex: 1;
}
.profile-name {
  font-size: 20px;
  font-weight: 750;
  display: block;
}
.profile-motto {
  display: block;
  color: #9c86af;
  font-size: 10px;
  margin: 7px 0 9px;
}
.profile-badge {
  color: #a080be;
  background: #f8f4fc;
  border-radius: 20px;
  padding: 3px 8px;
  font-size: 8px;
}
.profile-shortcuts {
  display: flex;
  margin-top: 25px;
  gap: 15px;
}
.profile-shortcuts button {
  flex: 1;
  background: white;
  margin: 0;
  padding: 17px;
  border: 1px solid #f1eaf7;
  border-radius: 12px;
  line-height: 1.4;
}
.profile-shortcuts button.active {
  border-color: #cab4e7;
}
.profile-shortcuts text:first-child {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #9670c4;
}
.profile-shortcuts text:last-child {
  font-size: 11px;
  color: #a293af;
  margin-top: 5px;
  display: block;
}
.section-heading {
  margin-top: 25px;
}
.favorite-card {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px;
  background: white;
  border-radius: 12px;
  margin-bottom: 10px;
}
.favorite-card image {
  width: 65px;
  height: 74px;
  border-radius: 9px;
}
.favorite-card > view {
  flex: 1;
  font-size: 12px;
  line-height: 1.7;
}
.favorite-price {
  display: block;
  color: #df7a9c;
  margin-top: 10px;
}
.profile-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 30px;
}
.profile-actions .secondary-button {
  width: 100%;
  box-sizing: border-box;
}
.profile-actions .logout-button {
  color: #c93645;
  border-color: #edc4ca;
}
.profile-footnote {
  display: block;
  text-align: center;
  color: #bdb0c8;
  font-size: 9px;
  margin-top: 12px;
}
</style>
