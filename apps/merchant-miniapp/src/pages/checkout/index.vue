<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import CheckoutPage from '@starisle/user/CheckoutPage.vue'
import { requireDemoLogin } from '@starisle/shared/auth'
const id = ref('')
const ready = ref(false)
onLoad((query) => {
  id.value = query?.id || ''
})
onShow(() => {
  ready.value = requireDemoLogin('user', `/pages/checkout/index?id=${encodeURIComponent(id.value)}`)
})
</script>
<template><CheckoutPage v-if="ready" :id="id" /></template>
