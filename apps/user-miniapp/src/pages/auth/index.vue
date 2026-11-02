<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AuthScreen from '@starisle/ui/AuthScreen.vue'
import type { AuthRole } from '@starisle/shared/auth'
const role = ref<AuthRole>('user')
const next = ref('')
onLoad((query) => {
  role.value = query?.role === 'admin' ? 'admin' : query?.role === 'merchant' ? 'merchant' : 'user'
  next.value = query?.next || ''
})
</script>
<template><AuthScreen :initial-role="role" :destination="next" /></template>
