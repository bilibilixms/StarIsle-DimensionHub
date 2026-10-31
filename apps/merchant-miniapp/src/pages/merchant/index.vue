<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import MerchantWorkspace from '@starisle/ui/MerchantWorkspace.vue'
import { requireDemoLogin } from '@starisle/shared/auth'
const ready = ref(false)
onShow(() => {
  ready.value = requireDemoLogin('merchant')
})
</script>
<template><MerchantWorkspace v-if="ready" /></template>
