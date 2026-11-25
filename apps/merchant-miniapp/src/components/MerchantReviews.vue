<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import ReviewCard from '@starisle/ui/ReviewCard.vue'
import { replyDemoReview, type DemoReviewView, type DemoState } from '@starisle/shared/demo'
const props = defineProps<{ reviews: DemoReviewView[] }>()
const emit = defineEmits<{ updated: [state: DemoState]; back: [] }>()
const pending = ref(false)
const busy = ref(false)
const error = ref('')
const replies = reactive<Record<string, string>>({})
const visible = computed(() => props.reviews.filter((review) => !pending.value || !review.reply))
const average = computed(() =>
  props.reviews.length
    ? (
        props.reviews.reduce((sum, review) => sum + review.rating, 0) / props.reviews.length
      ).toFixed(1)
    : '暂无',
)
async function reply(id: string) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    emit('updated', await replyDemoReview(id, replies[id] || ''))
    uni.showToast({ title: '回复已发布', icon: 'success' })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '回复失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <view class="merchant-reviews" data-testid="merchant-reviews">
    <button class="secondary-button" @click="$emit('back')">返回工作台</button>
    <view class="review-summary">
      <text>店铺评分 {{ average }}</text>
      <text>
        {{ reviews.length }} 条评价 ·
        {{ reviews.filter((review) => !review.reply).length }} 条待回复
      </text>
    </view>
    <view class="review-tabs">
      <button class="secondary-button" :class="{ selected: !pending }" @click="pending = false">
        全部评价
      </button>
      <button class="secondary-button" :class="{ selected: pending }" @click="pending = true">
        待回复
      </button>
    </view>
    <text v-if="error" class="form-error" data-testid="reply-error">{{ error }}</text>
    <ReviewCard v-for="review in visible" :key="review.id" :review="review" show-product>
      <view v-if="!review.reply" class="reply-form">
        <textarea
          v-model="replies[review.id]"
          :disabled="busy"
          maxlength="500"
          placeholder="认真回应买家的体验，最多 500 字"
          aria-label="商家回复"
          :data-testid="`reply-content-${review.id}`"
        />
        <text class="reply-note">回复对所有用户可见，发布后不可修改。</text>
        <button
          class="primary-button"
          :disabled="busy || !replies[review.id]?.trim()"
          :loading="busy"
          :data-testid="`reply-submit-${review.id}`"
          @click="reply(review.id)"
        >
          发布回复
        </button>
      </view>
    </ReviewCard>
    <view v-if="!visible.length" class="empty-state">
      <text class="empty-title">{{ pending ? '评价已全部回复' : '暂时还没有评价' }}</text>
      <text class="empty-copy">买家确认收货后，可以在订单中分享购买体验。</text>
    </view>
  </view>
</template>
<style scoped>
.merchant-reviews {
  padding: 16px;
  background: #fff;
  border-radius: 14px;
}
.review-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 20px 0;
  font-size: 13px;
  color: #71583f;
}
.review-summary text:first-child {
  font-size: 22px;
  font-weight: 650;
}
.review-tabs {
  display: flex;
  gap: 10px;
}
.review-tabs .selected {
  background: #fff4e8;
  border-color: #d6aa75;
}
.reply-form {
  margin-top: 14px;
}
.reply-form textarea {
  box-sizing: border-box;
  width: 100%;
  height: 90px;
  padding: 12px;
  border: 1px solid #eee0d2;
  border-radius: 10px;
  font-size: 13px;
}
.reply-note {
  display: block;
  margin: 10px 0;
  color: #8b7864;
  font-size: 10px;
}
</style>
