<script setup lang="ts">
defineProps<{ connected: boolean; syncing: boolean; error: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <view class="sync-status" :class="{ disconnected: error }" data-testid="sync-status">
    <view class="sync-dot" />
    <text>
      {{
        error
          ? '联动暂未连接，当前显示上次记录'
          : connected
            ? '演示联动已连接 · 自动更新'
            : '正在连接演示服务…'
      }}
    </text>
    <button v-if="error" :disabled="syncing" @click="$emit('retry')" data-testid="retry-sync">
      {{ syncing ? '连接中' : '重试' }}
    </button>
  </view>
</template>

<style scoped>
.sync-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 20px 8px;
  padding: 9px 10px;
  border-radius: 9px;
  background: #f0ebf7;
  color: #9b89af;
  font-size: 10px;
  line-height: 1.6;
}
.sync-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #92b9ac;
}
.sync-status text {
  flex: 1;
}
.disconnected {
  color: #ad7953;
  background: #fff1e6;
}
.disconnected .sync-dot {
  background: #d99d6f;
}
.sync-status button {
  margin: 0;
  padding: 0 4px;
  background: transparent;
  color: inherit;
  font-size: 10px;
  line-height: 1.8;
}
</style>
