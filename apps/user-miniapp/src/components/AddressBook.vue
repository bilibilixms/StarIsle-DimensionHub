<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import Sheet from '@starisle/ui/Sheet.vue'
import { useDemoSync } from '@starisle/ui/useDemoSync'
import {
  getCheckoutDraft,
  selectCheckoutAddress,
  saveDemoAddress,
  removeDemoAddress,
  setDefaultDemoAddress,
  getDemoState,
  type DemoRecipient,
  type DemoAddress,
} from '@starisle/shared/demo'
import AddressEditor from './AddressEditor.vue'
const props = defineProps<{ draftId?: string; add?: boolean }>()
const { state, refresh } = useDemoSync()
const editing = ref(false)
const activeId = ref<string>()
const empty = (): DemoRecipient => ({ name: '', phone: '', address: '' })
const form = ref<DemoRecipient>(empty())
const makeDefault = ref(false)
const actionError = ref('')
const selectedId = computed(() =>
  props.draftId ? getCheckoutDraft(props.draftId)?.addressId : undefined,
)
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
function back() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index?tab=profile' })
}
function edit(address?: DemoAddress) {
  activeId.value = address?.id
  form.value = address
    ? { name: address.name, phone: address.phone, address: address.address }
    : empty()
  makeDefault.value = !state.value.addresses.length || address?.id === state.value.defaultAddressId
  editing.value = true
  actionError.value = ''
}
function choose(id: string) {
  if (!props.draftId) return
  try {
    selectCheckoutAddress(props.draftId, id)
    back()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : '选择失败'
  }
}
function save(recipient: DemoRecipient, isDefault: boolean) {
  try {
    const address = saveDemoAddress(recipient, activeId.value, isDefault)
    refresh()
    editing.value = false
    if (props.draftId) choose(address.id)
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : '保存失败'
  }
}
function setDefault(id: string) {
  try {
    state.value = setDefaultDemoAddress(id)
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : '设置失败'
  }
}
function remove(id: string) {
  uni.showModal({
    title: '删除收货地址',
    content: '删除后，未提交订单需要重新选择收货地址。已生成订单的地址记录会保留。',
    confirmText: '删除',
    success(result) {
      if (result.confirm) {
        removeDemoAddress(id)
        state.value = getDemoState()
      }
    },
  })
}
onMounted(() => {
  if (props.add) edit()
})
</script>
<template>
  <view class="app-screen address-screen" data-testid="address-book">
    <view class="address-nav" :style="{ paddingTop: `${statusHeight + 10}px` }">
      <button class="icon-button" aria-label="返回" data-testid="address-back" @click="back">
        <Icon name="chevron-left" tone="ink" :size="20" />
      </button>
      <text>{{ draftId ? '选择收货地址' : '收货地址' }}</text>
    </view>
    <view class="address-content">
      <text class="address-tip">
        {{ draftId ? '选择本次订单的收货地址。' : '管理收货地址，让每一份心动准确送达。' }}
      </text>
      <text v-if="actionError" class="form-error" role="alert">{{ actionError }}</text>
      <view
        v-for="address in state.addresses"
        :key="address.id"
        class="address-card"
        :class="{ chosen: address.id === selectedId }"
        :data-testid="`address-${address.id}`"
      >
        <button class="address-select" :disabled="!draftId" @click="choose(address.id)">
          <view class="address-person">
            <text>{{ address.name }}</text>
            <text>{{ address.phone }}</text>
            <text
              v-if="address.id === state.defaultAddressId"
              class="default-badge"
              data-testid="default-address"
            >
              默认
            </text>
          </view>
          <text class="address-location">{{ address.address }}</text>
        </button>
        <view class="address-tools">
          <button
            v-if="address.id !== state.defaultAddressId"
            data-testid="set-default-address"
            @click="setDefault(address.id)"
          >
            设为默认
          </button>
          <text v-else class="default-note">默认收货地址</text>
          <view class="address-actions">
            <button data-testid="edit-address" @click="edit(address)">编辑</button>
            <button data-testid="delete-address" @click="remove(address.id)">删除</button>
            <button
              v-if="draftId"
              class="use-address"
              data-testid="use-address"
              @click="choose(address.id)"
            >
              送到这里
            </button>
          </view>
        </view>
      </view>
      <view v-if="!state.addresses.length" class="empty-state" data-testid="address-empty">
        <Icon name="pin" tone="purple" :size="36" />
        <text class="empty-title">添加第一份收货地址</text>
        <text class="empty-copy">填写收货信息后，就可以继续下单。</text>
      </view>
      <button class="primary-button add-address" data-testid="add-address" @click="edit()">
        新增收货地址
      </button>
    </view>
    <Sheet
      :visible="editing"
      :title="activeId ? '编辑收货地址' : '新增收货地址'"
      @close="editing = false"
    >
      <AddressEditor
        :value="form"
        :make-default="makeDefault"
        :label="draftId ? '保存并使用' : '保存地址'"
        @save="save"
      />
    </Sheet>
  </view>
</template>
<style scoped>
.address-screen {
  background: #f8f6fc;
  padding-bottom: calc(30px + env(safe-area-inset-bottom));
}
.address-nav {
  display: flex;
  gap: 15px;
  align-items: center;
  padding: 10px 20px;
  background: #fff;
  font-size: 17px;
  font-weight: 600;
}
.address-content {
  padding: 20px;
}
.address-tip {
  display: block;
  font-size: 12px;
  line-height: 1.8;
  color: #a08daf;
  margin-bottom: 20px;
}
.address-card {
  background: #fff;
  border: 1px solid #ede5f5;
  border-radius: 15px;
  margin-bottom: 14px;
  padding: 16px;
}
.address-card.chosen {
  border-color: #a581d4;
}
.address-select {
  padding: 0;
  width: 100%;
  margin: 0;
  background: transparent;
  text-align: left;
  line-height: 1.6;
}
.address-select[disabled] {
  color: inherit;
  background: transparent;
  opacity: 1;
}
.address-person {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #574364;
  font-weight: 600;
}
.address-person > text:nth-child(2) {
  font-weight: 400;
  font-size: 12px;
  color: #a18cae;
}
.default-badge {
  background: #f0e7fa;
  color: #9470bd;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
}
.address-location {
  display: block;
  font-size: 12px;
  color: #917b9f;
  margin-top: 10px;
  word-break: break-all;
}
.address-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid #f3edf8;
  margin-top: 13px;
  padding-top: 11px;
}
.address-tools button {
  background: transparent;
  padding: 4px 0;
  margin: 0;
  color: #a08bb4;
  font-size: 11px;
  line-height: 1.5;
}
.address-actions {
  display: flex;
  gap: 14px;
  align-items: center;
}
.default-note {
  color: #b8a9c3;
  font-size: 10px;
}
.address-actions .use-address {
  color: #8757b8;
}
.add-address {
  margin-top: 25px;
}
</style>
