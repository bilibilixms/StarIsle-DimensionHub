<script setup lang="ts">
withDefaults(defineProps<{ name: string; tone?: string; size?: number }>(), {
  tone: 'muted',
  size: 22,
})
</script>

<template>
  <image
    :src="`/static/icons/${name}-${tone}.svg`"
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="app-icon"
    mode="aspectFit"
    aria-hidden="true"
  />
</template>

<style scoped>
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
