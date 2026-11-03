<script setup lang="ts">
import { ref } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import AdminWorkspace from '@starisle/ui/AdminWorkspace.vue'
import { ADMIN_UI_ENABLED, openLogin, requireDemoLogin } from '@starisle/shared/auth'
const ready = ref(false)
const workspace = ref<InstanceType<typeof AdminWorkspace>>()
onShow(() => {
  if (!ADMIN_UI_ENABLED) {
    openLogin()
    return
  }
  ready.value = requireDemoLogin('admin')
  if (ready.value) void workspace.value?.verify()
})
onHide(() => workspace.value?.pause())
</script>
<template><AdminWorkspace v-if="ADMIN_UI_ENABLED && ready" ref="workspace" /></template>
