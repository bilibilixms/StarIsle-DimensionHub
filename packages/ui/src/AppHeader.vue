<script setup lang="ts">
import Icon from './Icon.vue'
withDefaults(
  defineProps<{ title?: string; subtitle?: string; back?: boolean; badge?: boolean }>(),
  { title: '星屿', subtitle: '', back: false, badge: false },
)
defineEmits<{ back: []; message: [] }>()
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
</script>

<template>
  <view class="header" :style="{ paddingTop: `${statusHeight}px` }">
    <view class="header-content">
      <button v-if="back" class="icon-button back" aria-label="返回" @click="$emit('back')">
        <Icon name="chevron-left" tone="ink" />
      </button>
      <view class="identity">
        <view class="brand-line">
          <Icon v-if="!back" name="sparkles" tone="purple" :size="25" />
          <text :class="back || title !== '星屿' ? 'page-title' : 'wordmark'">{{ title }}</text>
        </view>
        <text v-if="subtitle" class="subtitle">{{ subtitle }}</text>
      </view>
      <view class="header-right">
        <text v-if="badge" class="demo-mark">演示</text>
        <button class="icon-button notification" aria-label="消息" @click="$emit('message')">
          <Icon name="bell" tone="ink" :size="21" />
          <view class="notification-dot" />
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.header {
  background: #fbfaff;
}
.header-content {
  height: 64px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.identity {
  flex: 1;
  min-width: 0;
}
.brand-line {
  display: flex;
  align-items: center;
  gap: 7px;
}
.wordmark {
  color: #6541a5;
  font-size: 29px;
  font-weight: 850;
  letter-spacing: 2px;
}
.page-title {
  font-size: 17px;
  font-weight: 650;
}
.subtitle {
  display: block;
  font-size: 10px;
  letter-spacing: 1.3px;
  color: #9b8bad;
  margin: 1px 0 0 34px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.demo-mark {
  color: #8c7c9c;
  background: #f0ebf7;
  font-size: 10px;
  padding: 3px 7px;
  border-radius: 5px;
}
.notification {
  position: relative;
}
.notification-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  height: 5px;
  width: 5px;
  background: #ef83a5;
  border: 2px solid #fbfaff;
  border-radius: 50%;
}
.back {
  margin-left: -9px !important;
}
/* Reserve the native capsule area in Weixin. */
/* #ifdef MP-WEIXIN */
.header-right {
  margin-right: 90px;
}
/* #endif */
</style>
