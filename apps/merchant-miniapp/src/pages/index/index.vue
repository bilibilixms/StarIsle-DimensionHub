<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import UserWorkspace from '@starisle/user/UserWorkspace.vue'
import { canBrowse, requireDemoLogin } from '@starisle/shared/auth'
const tab = ref('home')
const ready = ref(false)
const initialTag = ref('')
onLoad((query) => {
  initialTag.value = typeof query?.tag === 'string' ? query.tag : ''
  if (query?.tab && ['home', 'discover', 'cart', 'profile'].includes(query.tab))
    tab.value = query.tab
})
onShow(() => {
  const destination = `/pages/index/index?tab=${tab.value}${initialTag.value ? '&tag=' + encodeURIComponent(initialTag.value) : ''}`
  ready.value =
    canBrowse(destination) && (tab.value !== 'cart' || requireDemoLogin('user', destination))
})
</script>
<template><UserWorkspace v-if="ready" :initial-tab="tab" :initial-tag="initialTag" /></template>
