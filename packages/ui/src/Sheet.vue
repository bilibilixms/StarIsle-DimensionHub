<script setup lang="ts">
withDefaults(defineProps<{ visible: boolean; title: string }>(), { visible: false })
defineEmits<{ close: [] }>()
</script>

<template>
  <view v-if="visible" class="sheet-layer" role="dialog" aria-modal="true" :aria-label="title">
    <view class="sheet-mask" @click="$emit('close')" @touchmove.stop.prevent />
    <view class="sheet-panel">
      <view class="sheet-handle" />
      <view class="sheet-heading">
        <text>{{ title }}</text>
        <button class="sheet-close" aria-label="关闭弹窗" @click="$emit('close')">×</button>
      </view>
      <view class="sheet-body"><slot /></view>
    </view>
  </view>
</template>

<style scoped>
.sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}
.sheet-mask {
  position: absolute;
  inset: 0;
  background: rgba(39, 28, 57, 0.38);
}
.sheet-panel {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 440px;
  border-radius: 24px 24px 0 0;
  background: #fff;
  box-sizing: border-box;
  padding: 10px 22px calc(24px + env(safe-area-inset-bottom));
  max-height: 88vh;
  overflow-y: auto;
}
.sheet-handle {
  width: 34px;
  height: 4px;
  background: #eae5f0;
  border-radius: 4px;
  margin: 0 auto 14px;
}
.sheet-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 22px;
}
.sheet-close {
  font-size: 27px;
  color: #aaa1b5;
  background: #f7f4fb;
  height: 30px;
  width: 30px;
  padding: 0;
  line-height: 27px;
  margin: 0;
  border-radius: 50%;
  font-weight: 400;
}
.sheet-body {
  padding-bottom: 2px;
}
</style>
