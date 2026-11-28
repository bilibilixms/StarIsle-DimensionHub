<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BuyerOrderPage from '@starisle/user/BuyerOrderPage.vue'
import { requireDemoLogin } from '@starisle/shared/auth'

const ready = ref(false)

onShow(() => {
  ready.value = requireDemoLogin('user', '/pages/order/index')
})
</script>

<template>
  <BuyerOrderPage v-if="ready" />
</template>
