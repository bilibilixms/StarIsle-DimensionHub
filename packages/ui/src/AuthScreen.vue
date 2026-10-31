<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { DEMO_ASSETS } from '@starisle/shared/demo'
import {
  submitDemoAuth,
  enterAfterLogin,
  browseAsGuest,
  validateDemoCredentials,
  DEMO_MERCHANT_VERIFICATION_CODE,
  type AuthRole,
} from '@starisle/shared/auth'

const props = defineProps<{ initialRole: AuthRole; destination?: string }>()
const role = ref('user')
const mode = ref<'login' | 'register'>('login')
const phone = ref('')
const password = ref('')
const shopName = ref('')
const qualificationCode = ref('')
const qualificationStep = ref(false)
const visiblePassword = ref(false)
const busy = ref(false)
const error = ref('')
const merchant = computed(() => role.value === 'merchant')
const available = computed(() => role.value === 'user' || merchant.value)
const verifying = computed(
  () => merchant.value && mode.value === 'register' && qualificationStep.value,
)
const statusHeight = uni.getSystemInfoSync().statusBarHeight || 0
const roles = [
  { key: 'user', name: '用户', copy: '发现你的心动', icon: 'user', tone: 'purple' },
  { key: 'merchant', name: '商家', copy: '经营自己的小店', icon: 'bag', tone: 'orange' },
  { key: 'artist', name: '画师', copy: '暂未开放', icon: 'brush', tone: 'muted' },
  { key: 'event', name: '漫展方', copy: '暂未开放', icon: 'ticket', tone: 'muted' },
]
watch(
  () => props.initialRole,
  (value) => {
    role.value = value
  },
  { immediate: true },
)
function selectRole(value: string) {
  if (busy.value) return
  role.value = value
  error.value = ''
  password.value = ''
  resetVerification()
}
function resetVerification() {
  qualificationStep.value = false
  qualificationCode.value = ''
  error.value = ''
}
function selectMode(value: 'login' | 'register') {
  if (busy.value) return
  mode.value = value
  resetVerification()
}
async function submit() {
  if (busy.value || !available.value) return
  error.value = ''
  busy.value = true
  try {
    validateDemoCredentials(phone.value, password.value)
    if (merchant.value && mode.value === 'register' && !qualificationStep.value) {
      qualificationStep.value = true
      return
    }
    const session = await submitDemoAuth(
      mode.value,
      role.value as AuthRole,
      phone.value,
      password.value,
      shopName.value,
      qualificationCode.value,
    )
    password.value = ''
    enterAfterLogin(session, props.destination)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请检查信息后重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view
    class="auth-screen"
    :class="{ 'auth-merchant': merchant }"
    :style="{ paddingTop: `${statusHeight + 22}px` }"
    data-testid="auth-screen"
  >
    <view class="auth-brand">
      <Icon name="sparkles" tone="purple" :size="23" />
      <text>星屿</text>
      <text class="brand-caption">次元聚集地</text>
    </view>
    <view class="auth-welcome">
      <view class="welcome-copy">
        <text class="welcome-title">在这里，{{ '\n' }}与热爱相遇。</text>
        <text class="welcome-subtitle">
          {{ merchant ? '让小小的店，装下大大的热爱。' : '收藏喜欢的事物，也成为自己的主角。' }}
        </text>
      </view>
      <image :src="DEMO_ASSETS.hero" class="welcome-art" mode="aspectFill" aria-hidden="true" />
    </view>
    <text class="identity-label">选择你的身份</text>
    <view class="identity-grid">
      <button
        v-for="item in roles"
        :key="item.key"
        class="identity-option"
        :class="{
          selected: role === item.key,
          upcoming: item.key === 'artist' || item.key === 'event',
        }"
        :disabled="busy"
        :data-testid="`role-${item.key}`"
        :aria-label="`选择${item.name}身份`"
        @click="selectRole(item.key)"
      >
        <Icon :name="item.icon" :tone="item.tone" :size="23" />
        <view class="identity-copy">
          <text class="identity-name">{{ item.name }}</text>
          <text class="identity-note">{{ item.copy }}</text>
        </view>
        <view class="identity-radio"><view v-if="role === item.key" /></view>
      </button>
    </view>
    <view v-if="available" class="auth-form">
      <view class="auth-tabs">
        <button
          :class="{ active: mode === 'login' }"
          :disabled="busy"
          data-testid="auth-login"
          @click="selectMode('login')"
        >
          登录
        </button>
        <button
          :class="{ active: mode === 'register' }"
          :disabled="busy"
          data-testid="auth-register"
          @click="selectMode('register')"
        >
          注册
        </button>
      </view>
      <view
        v-if="merchant && mode === 'register'"
        class="registration-progress"
        data-testid="merchant-registration-step"
      >
        <text :class="{ 'current-step': !verifying }">1 填写信息</text>
        <Icon name="chevron-right" tone="muted" :size="13" />
        <text :class="{ 'current-step': verifying }">2 资质验证</text>
      </view>
      <template v-if="!verifying">
        <view class="field">
          <text class="field-label">手机号</text>
          <input
            v-model="phone"
            type="number"
            maxlength="11"
            :disabled="busy"
            placeholder="请输入 11 位手机号"
            aria-label="手机号"
            data-testid="auth-phone"
          />
        </view>
        <view class="field">
          <text class="field-label">密码</text>
          <view class="password-field">
            <input
              v-model="password"
              :password="!visiblePassword"
              maxlength="128"
              :disabled="busy"
              placeholder="请输入至少 6 位密码"
              aria-label="密码"
              data-testid="auth-password"
              confirm-type="done"
              @confirm="submit"
            />
            <button
              class="password-toggle"
              :aria-label="visiblePassword ? '隐藏密码' : '显示密码'"
              @click="visiblePassword = !visiblePassword"
            >
              {{ visiblePassword ? '隐藏' : '显示' }}
            </button>
          </view>
        </view>
        <view v-if="merchant && mode === 'register'" class="field">
          <text class="field-label">
            店铺名称
            <text class="optional-label">选填</text>
          </text>
          <input
            v-model="shopName"
            maxlength="30"
            :disabled="busy"
            placeholder="给你的星屿小店起个名字"
            aria-label="店铺名称"
            data-testid="auth-shop"
          />
        </view>
      </template>
      <view v-else class="qualification-panel" data-testid="merchant-qualification">
        <text class="qualification-title">商家资质验证</text>
        <text class="qualification-copy">
          用于模拟商家资质与文件手续审核，输入演示验证码后即可开通商家身份。
        </text>
        <text class="qualification-account">注册手机号：{{ phone }}</text>
        <view class="qualification-demo" data-testid="merchant-demo-code">
          演示验证码：
          <text>{{ DEMO_MERCHANT_VERIFICATION_CODE }}</text>
        </view>
        <view class="field">
          <text class="field-label">资质验证码</text>
          <input
            v-model="qualificationCode"
            type="number"
            maxlength="4"
            :disabled="busy"
            placeholder="请输入页面显示的 4 位验证码"
            aria-label="商家资质验证码"
            data-testid="merchant-verification-code"
            confirm-type="done"
            @confirm="submit"
          />
        </view>
      </view>
      <text v-if="error" class="form-error auth-error" role="alert" data-testid="auth-error">
        {{ error }}
      </text>
      <button
        class="auth-submit"
        :disabled="busy"
        :loading="busy"
        data-testid="auth-submit"
        @click="submit"
      >
        {{
          busy
            ? '请稍候…'
            : mode === 'register'
              ? merchant
                ? verifying
                  ? '完成验证并注册'
                  : '下一步：资质验证'
                : '注册并登录'
              : merchant
                ? '登录商家工作台'
                : '登录星屿'
        }}
      </button>
      <button
        v-if="verifying"
        class="browse-button"
        :disabled="busy"
        data-testid="qualification-back"
        @click="resetVerification"
      >
        返回修改注册信息
      </button>
      <button
        v-if="!merchant"
        class="browse-button"
        :disabled="busy"
        data-testid="auth-browse"
        @click="browseAsGuest"
      >
        先逛逛，发现喜欢的好物
        <Icon name="chevron-right" tone="muted" :size="14" />
      </button>
      <text class="auth-note">
        {{
          merchant && mode === 'register'
            ? '商家注册需完成模拟资质验证，不发送短信。'
            : '手机号仅校验格式，不发送短信。'
        }}{{ '\n' }}请使用虚构手机号和非日常使用的密码。
      </text>
      <text class="demo-account">已有演示账号：13800000000 / 123456</text>
    </view>
    <view v-else class="coming-soon" data-testid="auth-coming-soon">
      <Icon name="sparkles" tone="purple" :size="32" />
      <text>{{ role === 'artist' ? '画师' : '漫展方' }}身份暂未开放</text>
      <text class="coming-copy">
        更多相遇，正在准备中。{{ '\n' }}你可以先选择用户身份，来岛上逛逛。
      </text>
    </view>
  </view>
</template>

<style scoped>
.auth-screen {
  max-width: 440px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 22px 25px calc(30px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #faf8fe;
  color: #393047;
  --auth-accent: #7952b5;
  --auth-tint: #efe7fa;
}
.auth-merchant {
  background: #fffaf5;
  --auth-accent: #ad6d35;
  --auth-tint: #faecd9;
}
.registration-progress {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0 0 20px;
  color: #a599b1;
  font-size: 12px;
}
.current-step {
  color: var(--auth-accent);
  font-weight: 600;
}
.qualification-title {
  display: block;
  font-size: 19px;
  font-weight: 600;
  color: #705034;
}
.qualification-copy {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.9;
  color: #93806f;
}
.qualification-account {
  display: block;
  font-size: 12px;
  margin-top: 15px;
  color: #8b786a;
}
.qualification-demo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0;
  padding: 15px;
  border-radius: 10px;
  background: var(--auth-tint);
  color: #9c6a3b;
  font-size: 13px;
}
.qualification-demo > text {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 5px;
}
.auth-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 22px;
  font-weight: 700;
}
.brand-caption {
  margin-left: 5px;
  font-size: 11px;
  color: #92859e;
  font-weight: 400;
}
.auth-welcome {
  position: relative;
  min-height: 168px;
  display: flex;
  align-items: center;
  margin: 16px 0 22px;
}
.welcome-copy {
  z-index: 1;
  width: 68%;
}
.welcome-title {
  white-space: pre-line;
  display: block;
  font-family: 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 31px;
  line-height: 1.48;
  font-weight: 700;
  letter-spacing: 1px;
}
.welcome-subtitle {
  display: block;
  max-width: 185px;
  margin-top: 10px;
  color: #8b7b9c;
  font-size: 11px;
  line-height: 1.8;
}
.welcome-art {
  position: absolute;
  right: -5px;
  top: 0;
  width: 119px;
  height: 165px;
  border-radius: 75px 75px 50px 50px;
  opacity: 0.88;
}
.identity-label {
  display: block;
  color: #7d6d90;
  font-size: 12px;
  margin-bottom: 12px;
}
.identity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}
.identity-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 70px;
  padding: 12px 11px;
  margin: 0;
  text-align: left;
  border: 1px solid #eae3f1;
  background: #fff;
  border-radius: 12px;
  line-height: 1.4;
  box-sizing: border-box;
}
.identity-option.selected {
  border-color: var(--auth-accent);
  background: var(--auth-tint);
}
.identity-copy {
  flex: 1;
  min-width: 0;
}
.identity-name {
  display: block;
  font-size: 14px;
  color: #49365e;
  font-weight: 600;
}
.identity-note {
  display: block;
  margin-top: 5px;
  font-size: 9px;
  color: #9b8aa9;
  white-space: nowrap;
}
.identity-radio {
  width: 10px;
  height: 10px;
  border: 1px solid #d5c8e3;
  border-radius: 50%;
  flex-shrink: 0;
  padding: 2px;
  box-sizing: content-box;
}
.selected .identity-radio {
  border-color: var(--auth-accent);
}
.identity-radio > view {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--auth-accent);
}
.upcoming {
  background: transparent;
}
.upcoming .identity-name,
.upcoming .identity-note {
  color: #aaa0b6;
}
.auth-tabs {
  display: flex;
  gap: 26px;
  margin: 26px 0 20px;
  border-bottom: 1px solid #eae3f1;
}
.auth-tabs button {
  margin: 0;
  padding: 0 0 12px;
  font-size: 17px;
  background: transparent;
  border-radius: 0;
  color: #a293ae;
  line-height: 1.5;
}
.auth-tabs button.active {
  font-weight: 600;
  color: var(--auth-accent);
  border-bottom: 2px solid var(--auth-accent);
}
.field {
  margin-bottom: 17px;
}
.field-label {
  display: block;
  font-size: 12px;
  margin-bottom: 9px;
  color: #70607e;
}
.field input {
  width: 100%;
  box-sizing: border-box;
  height: 46px;
  padding: 0 13px;
  border: 1px solid #ece5f1;
  border-radius: 9px;
  background: #fff;
  font-size: 14px;
  color: #43344f;
}
.field input:focus {
  border-color: var(--auth-accent);
}
.password-field {
  display: flex;
  position: relative;
}
.password-field input {
  padding-right: 59px;
}
.password-toggle {
  position: absolute;
  right: 3px;
  top: 4px;
  padding: 0 11px;
  height: 38px;
  line-height: 38px;
  font-size: 11px;
  color: #9685a6;
  background: transparent;
}
.optional-label {
  margin-left: 7px;
  color: #ad9fba;
  font-size: 10px;
}
.auth-error {
  display: block;
  margin-bottom: 14px;
}
.auth-submit {
  width: 100%;
  height: 48px;
  padding: 0;
  line-height: 48px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: var(--auth-accent);
  border-radius: 12px;
  margin-top: 6px;
}
.auth-submit[disabled] {
  opacity: 0.65;
}
.browse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 16px auto 0;
  padding: 6px 0;
  color: #9a8aa7;
  font-size: 12px;
  background: transparent;
  line-height: 1.6;
}
.auth-note {
  white-space: pre-line;
  display: block;
  margin-top: 20px;
  font-size: 10px;
  line-height: 1.9;
  text-align: center;
  color: #a599b1;
}
.demo-account {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  text-align: center;
  color: #a599b1;
}
.coming-soon {
  display: flex;
  flex-direction: column;
  gap: 15px;
  align-items: center;
  text-align: center;
  padding: 42px 0;
  color: #795a9a;
  font-size: 16px;
}
.coming-copy {
  white-space: pre-line;
  color: #9a8aa7;
  font-size: 12px;
  line-height: 1.9;
}
@media (max-width: 375px) {
  .auth-screen {
    padding-left: 20px;
    padding-right: 20px;
  }
  .identity-option {
    gap: 7px;
    padding: 11px 9px;
  }
  .welcome-title {
    white-space: pre-line;
    font-size: 29px;
  }
  .welcome-art {
    width: 104px;
  }
}
</style>
