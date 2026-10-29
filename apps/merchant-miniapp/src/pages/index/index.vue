<script setup lang="ts">
const preparations = [
  { title: '给小店起个名字', detail: '让同好们一眼记住你的风格。' },
  { title: '准备商品与作品', detail: '整理图片、价格与库存，让每份心意被看见。' },
  { title: '安排发货与售后', detail: '写清发货时间，把期待好好送到。' },
]
</script>

<template>
  <view class="workspace">
    <view class="masthead"><text class="brand">星屿 ✦</text><text class="edition">商家中心</text></view>
    <view class="welcome">
      <text class="welcome-mark">✧</text>
      <text class="welcome-title">让热爱，成为一家小店。</text>
      <text class="welcome-copy">从第一件作品开始，在星屿遇见喜欢它的人。</text>
    </view>
    <view class="notice"><text class="notice-title">入驻即将开放</text><text class="notice-copy">店铺、商品与订单管理正在准备中，期待与你相遇。</text></view>
    <text class="section-title">开店前，可以先准备这些</text>
    <view v-for="item in preparations" :key="item.title" class="preparation">
      <text class="preparation-title">{{ item.title }}</text>
      <text class="preparation-detail">{{ item.detail }}</text>
    </view>
    <text class="footer-note">每一份认真创作，都值得拥有自己的小岛。</text>
  </view>
</template>

<style scoped>
.workspace { max-width: 820px; margin: 0 auto; padding: 44rpx 36rpx 80rpx; }
.masthead { display: flex; justify-content: space-between; align-items: center; }
.brand { font-size: 48rpx; font-weight: 800; letter-spacing: 5rpx; color: #355f8a; }
.edition { font-size: 24rpx; color: #62758a; }
.welcome { padding: 68rpx 0 50rpx; }
.welcome-mark { display: block; color: #e8618e; font-size: 94rpx; line-height: 1.2; }
.welcome-title { display: block; margin-top: 24rpx; font-size: 43rpx; font-weight: 700; line-height: 1.6; }
.welcome-copy { display: block; margin-top: 20rpx; font-size: 27rpx; color: #62758a; line-height: 1.9; }
.notice { padding: 30rpx; background: #e1edf7; border-left: 6rpx solid #355f8a; border-radius: 0 16rpx 16rpx 0; }
.notice-title { display: block; font-size: 30rpx; font-weight: 600; color: #355f8a; }
.notice-copy { display: block; margin-top: 12rpx; font-size: 25rpx; color: #52667c; line-height: 1.9; }
.section-title { display: block; margin: 60rpx 0 12rpx; font-size: 30rpx; font-weight: 700; }
.preparation { padding: 30rpx 0; border-bottom: 2rpx solid #d7e2ed; }
.preparation-title { display: block; font-size: 29rpx; font-weight: 600; }
.preparation-detail { display: block; margin-top: 12rpx; font-size: 25rpx; color: #62758a; line-height: 1.8; }
.footer-note { display: block; margin-top: 52rpx; font-size: 24rpx; color: #62758a; line-height: 1.8; }
</style>
