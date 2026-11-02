<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Icon from './Icon.vue'
import AdminDashboard from './AdminDashboard.vue'
import {
  logoutDemo,
  openLogin,
  refreshDemoSession,
  requireDemoLogin,
  type DemoSession,
} from '@starisle/shared/auth'

const session = ref<DemoSession>()
const error = ref('')
const busy = ref(false)
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
let pending: Promise<void> | undefined
let generation = 0
function verify() {
  if (pending) return pending
  session.value = undefined
  error.value = ''
  if (!requireDemoLogin('admin')) return
  const currentGeneration = ++generation
  pending = (async () => {
    try {
      const current = await refreshDemoSession()
      if (generation !== currentGeneration) return
      if (current.role !== 'admin') {
        openLogin('admin')
        return
      }
      session.value = current
    } catch (cause) {
      if (generation === currentGeneration)
        error.value = cause instanceof Error ? cause.message : '无法确认登录状态，请重试'
    } finally {
      if (generation === currentGeneration) pending = undefined
    }
  })()
  return pending
}
function pause() {
  generation += 1
  pending = undefined
  session.value = undefined
}
async function logout() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await logoutDemo('admin')
    session.value = undefined
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '退出失败，请重试'
  } finally {
    busy.value = false
  }
}
onMounted(verify)
defineExpose({ verify, pause })
</script>

<template>
  <view class="admin-screen" :style="{ paddingTop: `${statusHeight + 24}px` }">
    <view class="admin-brand">
      <Icon name="sparkles" tone="purple" :size="25" />
      <text>星屿</text>
      <text class="admin-badge">管理员</text>
    </view>
    <view v-if="session" class="admin-content" data-testid="admin-workspace">
      <view class="admin-account">
        <text>当前账号</text>
        <text class="account-name" data-testid="admin-username">
          {{ session.account.username }}
        </text>
      </view>
      <text v-if="error" class="admin-error" role="alert" data-testid="admin-error">
        {{ error }}
      </text>
      <button
        class="secondary-button"
        :disabled="busy"
        :loading="busy"
        data-testid="admin-logout"
        @click="logout"
      >
        退出登录
      </button>
      <AdminDashboard />
    </view>
    <view v-else class="admin-status">
      <text v-if="!error" data-testid="admin-checking">正在验证登录…</text>
      <template v-else>
        <text class="admin-error" role="alert" data-testid="admin-error">{{ error }}</text>
        <button class="secondary-button" data-testid="admin-retry" @click="verify">重新连接</button>
      </template>
    </view>
  </view>
</template>

<style scoped>
.admin-screen {
  max-width: 440px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 24px 26px calc(36px + env(safe-area-inset-bottom));
  background: #faf8fe;
  color: #393047;
}
.admin-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 23px;
  font-weight: 700;
}
.admin-badge {
  margin-left: 7px;
  color: #7952b5;
  font-size: 12px;
  font-weight: 400;
}
.admin-content,
.admin-status {
  margin-top: 26px;
}
.admin-title {
  display: block;
  margin-top: 22px;
  font-family: 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 33px;
  font-weight: 700;
  line-height: 1.5;
  white-space: pre-line;
}
.admin-copy {
  display: block;
  margin: 16px 0 32px;
  color: #8b7b9c;
  font-size: 13px;
  line-height: 1.9;
}
.admin-account {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  margin-bottom: 28px;
  border-top: 1px solid #eae3f1;
  border-bottom: 1px solid #eae3f1;
  color: #8b7b9c;
  font-size: 13px;
}
.account-name {
  color: #49365e;
  font-size: 17px;
  font-weight: 600;
}
.admin-error {
  display: block;
  margin-bottom: 20px;
  color: #a33f62;
  font-size: 13px;
  line-height: 1.8;
}
.admin-status {
  color: #8b7b9c;
  font-size: 14px;
}
</style>
