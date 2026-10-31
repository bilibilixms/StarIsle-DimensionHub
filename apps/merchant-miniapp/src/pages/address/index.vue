<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AddressBook from '@starisle/user/AddressBook.vue'
import { requireDemoLogin } from '@starisle/shared/auth'
const draftId = ref('')
const add = ref(false)
const ready = ref(false)
onLoad((query) => {
  draftId.value = query?.draftId || ''
  add.value = query?.add === '1'
})
onShow(() => {
  ready.value = requireDemoLogin(
    'user',
    `/pages/address/index${draftId.value ? '?draftId=' + encodeURIComponent(draftId.value) + (add.value ? '&add=1' : '') : ''}`,
  )
})
</script>
<template><AddressBook v-if="ready" :draft-id="draftId" :add="add" /></template>
