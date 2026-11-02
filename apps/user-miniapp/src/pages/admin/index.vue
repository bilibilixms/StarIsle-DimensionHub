<script setup lang="ts">
import { ref } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import AdminWorkspace from '@starisle/ui/AdminWorkspace.vue'
import { requireDemoLogin } from '@starisle/shared/auth'
const ready = ref(false)
const workspace = ref<InstanceType<typeof AdminWorkspace>>()
onShow(() => {
  ready.value = requireDemoLogin('admin')
  if (ready.value) void workspace.value?.verify()
})
onHide(() => workspace.value?.pause())
</script>
<template><AdminWorkspace v-if="ready" ref="workspace" /></template>
