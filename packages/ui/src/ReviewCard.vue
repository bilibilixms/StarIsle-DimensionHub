<script setup lang="ts">
import type { DemoReviewView } from '@starisle/shared/demo'
const props = defineProps<{ review: DemoReviewView; showProduct?: boolean }>()
function preview(current: string) {
  uni.previewImage({ current, urls: props.review.images })
}
</script>
<template>
  <view class="review-card" :data-testid="`review-${review.id}`">
    <view class="review-heading">
      <text class="review-author">{{ review.author }}</text>
      <text class="review-score">
        {{ '★'.repeat(review.rating) }}{{ '☆'.repeat(5 - review.rating) }} · {{ review.rating }} 星
      </text>
    </view>
    <text v-if="showProduct" class="review-product">{{ review.productTitle }}</text>
    <text class="review-meta">
      {{ review.variant }} · {{ review.createdAt }} · 已购{{
        review.refunded ? ' · 交易已退款' : ''
      }}
    </text>
    <text class="review-content">{{ review.content }}</text>
    <view v-if="review.images.length" class="review-images">
      <image
        v-for="image in review.images"
        :key="image"
        :src="image"
        mode="aspectFill"
        @click="preview(image)"
      />
    </view>
    <view v-if="review.reply" class="review-reply">
      <text class="reply-heading">商家回复</text>
      <text>{{ review.reply.content }}</text>
      <text class="review-meta">{{ review.reply.createdAt }}</text>
    </view>
    <slot />
  </view>
</template>
<style scoped>
.review-card {
  padding: 16px 0;
  border-bottom: 1px solid #eee8f3;
}
.review-card:last-child {
  border-bottom: 0;
}
.review-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.review-author {
  color: #554461;
  font-size: 13px;
  font-weight: 600;
}
.review-score {
  color: #a66a19;
  font-size: 12px;
  flex-shrink: 0;
}
.review-product {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
}
.review-meta {
  display: block;
  margin-top: 7px;
  font-size: 10px;
  line-height: 1.7;
  color: #82738f;
  overflow-wrap: anywhere;
}
.review-content {
  display: block;
  margin-top: 12px;
  color: #514259;
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.review-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.review-images image {
  width: 76px;
  height: 76px;
  border-radius: 8px;
}
.review-reply {
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  background: #f7f3fb;
  font-size: 12px;
  line-height: 1.8;
  color: #67516f;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.reply-heading {
  display: block;
  font-weight: 600;
  margin-bottom: 5px;
}
</style>
