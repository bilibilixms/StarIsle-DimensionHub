<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import ShopDetail from '@starisle/user/ShopDetail.vue'
import { canBrowse } from '@starisle/shared/auth'
const id = ref('')
const ready = ref(false)
onLoad((query) => {
  id.value = query?.id || ''
})
onShow(() => {
  const destination = `/pages/shop/detail?id=${encodeURIComponent(id.value)}`
  ready.value = canBrowse(destination)
})
</script>
<template><ShopDetail v-if="ready" :id="id" /></template>
