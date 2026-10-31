<script setup lang="ts">
import { ref, watch } from 'vue'
import { validateRecipient, type DemoRecipient } from '@starisle/shared/demo'
const props = withDefaults(
  defineProps<{
    value: DemoRecipient
    makeDefault?: boolean
    showDefault?: boolean
    label?: string
  }>(),
  { makeDefault: false, showDefault: true, label: '保存地址' },
)
const emit = defineEmits<{ save: [recipient: DemoRecipient, makeDefault: boolean] }>()
const form = ref({ ...props.value })
const defaultAddress = ref(props.makeDefault)
const error = ref('')
watch(
  () => props.value,
  (value) => {
    form.value = { ...value }
    defaultAddress.value = props.makeDefault
    error.value = ''
  },
)
function blur(field: keyof DemoRecipient, event: unknown) {
  const value = (event as { detail?: { value?: unknown } })?.detail?.value
  if (typeof value === 'string') form.value[field] = value
}
function save() {
  try {
    const recipient = validateRecipient(form.value)
    error.value = ''
    emit('save', recipient, defaultAddress.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请检查收货信息'
  }
}
</script>
<template>
  <view class="address-editor">
    <text class="form-note">用于模拟下单，请填写虚构收货信息。</text>
    <text class="form-label">收货人</text>
    <input
      v-model="form.name"
      @blur="blur('name', $event)"
      class="form-input"
      aria-label="收货人"
      data-testid="recipient-name"
      maxlength="30"
      placeholder="请输入收货人"
    />
    <text class="form-label">手机号</text>
    <input
      v-model="form.phone"
      @blur="blur('phone', $event)"
      class="form-input"
      aria-label="手机号"
      data-testid="recipient-phone"
      maxlength="11"
      type="number"
      placeholder="请输入 11 位手机号"
    />
    <text class="form-label">收货地址</text>
    <input
      v-model="form.address"
      @blur="blur('address', $event)"
      class="form-input"
      aria-label="收货地址"
      data-testid="recipient-address"
      maxlength="200"
      placeholder="请输入完整收货地址"
    />
    <button
      v-if="showDefault"
      class="default-toggle"
      :aria-pressed="defaultAddress"
      data-testid="address-default-toggle"
      @click="defaultAddress = !defaultAddress"
    >
      <text class="toggle-dot" :class="{ selected: defaultAddress }">
        {{ defaultAddress ? '✓' : '' }}
      </text>
      设为默认地址
    </button>
    <text v-if="error" class="form-error" data-testid="address-error">{{ error }}</text>
    <button class="primary-button" data-testid="save-recipient" @click="save">{{ label }}</button>
  </view>
</template>
<style scoped>
.default-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  margin: 4px 0 20px;
  font-size: 12px;
  background: transparent;
  color: #8b759f;
  text-align: left;
  line-height: 28px;
}
.toggle-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #dcd0eb;
  color: white;
  font-size: 12px;
}
.toggle-dot.selected {
  background: #9c75d4;
  border-color: #9c75d4;
}
</style>
