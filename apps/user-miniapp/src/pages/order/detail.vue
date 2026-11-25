<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import OrderDetail from '@starisle/user/OrderDetail.vue'
import { requireDemoLogin } from '@starisle/shared/auth'
const id = ref('')
const ready = ref(false)
const action = ref('')
onLoad((query) => {
  id.value = query?.id || ''
  action.value = query?.action === 'review' || query?.action === 'aftersale' ? query.action : ''
})
onShow(() => {
  const destination = `/pages/order/detail?id=${encodeURIComponent(id.value)}${action.value ? '&action=' + action.value : ''}`
  ready.value = requireDemoLogin('user', destination)
})
</script>
<template>
  <OrderDetail v-if="ready" :id="id" :action="action" />
</template>
