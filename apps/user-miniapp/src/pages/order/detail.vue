<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import OrderDetail from '@starisle/user/OrderDetail.vue'
import { requireDemoLogin } from '@starisle/shared/auth'
const id = ref('')
const ready = ref(false)
onLoad((query) => {
  id.value = query?.id || ''
})
onShow(() => {
  const destination = `/pages/order/detail?id=${encodeURIComponent(id.value)}`
  ready.value = requireDemoLogin('user', destination)
})
</script>
<template><OrderDetail v-if="ready" :id="id" /></template>
