<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ReviewCard from '@starisle/ui/ReviewCard.vue'
import {
  orderItems,
  reviewItemKey,
  submitDemoReview,
  type DemoOrder,
  type DemoReviewView,
  type DemoState,
} from '@starisle/shared/demo'
import { uploadReviewImage } from '@starisle/shared/product-images'
const props = defineProps<{ order: DemoOrder; reviews: DemoReviewView[]; autoOpen?: boolean }>()
const emit = defineEmits<{ updated: [state: DemoState] }>()
const items = computed(() => orderItems(props.order))
const activeKey = ref('')
const busy = ref(false)
const error = ref('')
const drafts = reactive<Record<string, { rating: number; content: string; images: string[] }>>({})
watch(
  () => props.order.id,
  () => {
    activeKey.value = ''
    error.value = ''
    for (const key of Object.keys(drafts)) delete drafts[key]
  },
)
function findReview(key: string) {
  return props.reviews.find((review) => review.orderId === props.order.id && review.itemKey === key)
}
function open(key: string) {
  drafts[key] ||= { rating: 5, content: '', images: [] }
  activeKey.value = key
  error.value = ''
}
watch(
  () => `${props.autoOpen}:${props.order.id}:${props.order.status}`,
  () => {
    if (!props.autoOpen || props.order.status !== '已完成') return
    const item = items.value.find((item) => !findReview(reviewItemKey(item)))
    if (item) open(reviewItemKey(item))
  },
  { immediate: true },
)
function chooseImages(key: string) {
  const draft = drafts[key]
  if (!draft || busy.value || draft.images.length >= 3) return
  uni.chooseImage({
    count: 3 - draft.images.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    async success(result) {
      busy.value = true
      error.value = ''
      try {
        const paths =
          typeof result.tempFilePaths === 'string' ? [result.tempFilePaths] : result.tempFilePaths
        for (const path of paths) {
          if (draft.images.length >= 3) break
          draft.images.push(await uploadReviewImage(path))
        }
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '图片上传失败，请重试'
      } finally {
        busy.value = false
      }
    },
    fail(result) {
      if (!result.errMsg?.includes('cancel')) error.value = '无法选择图片，请重试'
    },
  })
}
async function submit(key: string) {
  if (busy.value || !drafts[key]) return
  busy.value = true
  error.value = ''
  try {
    const draft = drafts[key]
    emit(
      'updated',
      await submitDemoReview(props.order.id, key, draft.rating, draft.content, draft.images),
    )
    activeKey.value = ''
    uni.showToast({ title: '评价已发布', icon: 'success' })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '提交失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <view
    v-if="order.status === '已完成' || reviews.some((review) => review.orderId === order.id)"
    class="order-reviews"
    data-testid="order-reviews"
  >
    <text class="section-title">商品评价</text>
    <view v-for="(item, index) in items" :key="reviewItemKey(item)" class="review-item">
      <text class="item-title">{{ item.title }} · {{ item.variant }}</text>
      <ReviewCard
        v-if="findReview(reviewItemKey(item))"
        :review="findReview(reviewItemKey(item))!"
      />
      <template v-else-if="order.status === '已完成'">
        <button
          v-if="activeKey !== reviewItemKey(item)"
          class="secondary-button"
          :disabled="busy"
          :data-testid="`review-open-${index}`"
          @click="open(reviewItemKey(item))"
        >
          评价商品
        </button>
        <view v-else class="review-editor">
          <text class="field-label">商品评分</text>
          <view class="rating-buttons">
            <button
              v-for="star in 5"
              :key="star"
              :disabled="busy"
              :class="{ selected: drafts[reviewItemKey(item)].rating >= star }"
              :aria-label="`${star} 星`"
              :data-testid="`review-rating-${star}`"
              @click="drafts[reviewItemKey(item)].rating = star"
            >
              ★
            </button>
          </view>
          <textarea
            v-model="drafts[reviewItemKey(item)].content"
            class="review-input"
            :disabled="busy"
            maxlength="500"
            placeholder="说说商品的做工、实物体验，最多 500 字"
            aria-label="评价内容"
            data-testid="review-content"
          />
          <view class="review-photos">
            <view v-for="(image, imageIndex) in drafts[reviewItemKey(item)].images" :key="image">
              <image :src="image" mode="aspectFill" />
              <button
                :disabled="busy"
                :aria-label="`移除评价图片 ${imageIndex + 1}`"
                @click="drafts[reviewItemKey(item)].images.splice(imageIndex, 1)"
              >
                ×
              </button>
            </view>
          </view>
          <button
            v-if="drafts[reviewItemKey(item)].images.length < 3"
            class="secondary-button"
            :disabled="busy"
            data-testid="upload-review-image"
            @click="chooseImages(reviewItemKey(item))"
          >
            添加图片（{{ drafts[reviewItemKey(item)].images.length }}/3）
          </button>
          <text class="review-note">
            图片支持 JPG、PNG、WebP，每张不超过 2 MB。评价发布后不可修改。
          </text>
          <button
            class="primary-button"
            :disabled="busy || !drafts[reviewItemKey(item)].content.trim()"
            :loading="busy"
            data-testid="submit-review"
            @click="submit(reviewItemKey(item))"
          >
            发布评价
          </button>
        </view>
      </template>
    </view>
    <text v-if="error" class="form-error" data-testid="review-error">{{ error }}</text>
  </view>
</template>
<style scoped>
.order-reviews {
  margin-bottom: 20px;
  padding: 18px;
  background: #fff;
  border: 1px solid #eee8f4;
  border-radius: 14px;
}
.section-title {
  display: block;
  font-size: 15px;
  font-weight: 650;
}
.review-item {
  margin-top: 18px;
}
.item-title {
  display: block;
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.8;
  color: #65546d;
}
.field-label {
  font-size: 12px;
  color: #65546d;
}
.rating-buttons {
  display: flex;
  gap: 8px;
  margin: 8px 0 12px;
}
.rating-buttons button {
  margin: 0;
  padding: 4px 5px;
  background: transparent;
  font-size: 28px;
  line-height: 1.5;
  color: #ddd5e5;
}
.rating-buttons .selected {
  color: #c18a2d;
}
.review-input {
  box-sizing: border-box;
  width: 100%;
  height: 110px;
  padding: 12px;
  border: 1px solid #e8e0ef;
  border-radius: 10px;
  font-size: 13px;
  background: #fcfaff;
}
.review-photos {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.review-photos > view {
  position: relative;
}
.review-photos image {
  width: 70px;
  height: 70px;
  border-radius: 8px;
}
.review-photos button {
  position: absolute;
  top: 0;
  right: 0;
  margin: 0;
  padding: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #654970;
  color: #fff;
  line-height: 22px;
}
.review-note {
  display: block;
  margin: 12px 0;
  font-size: 10px;
  line-height: 1.8;
  color: #82738f;
}
</style>
