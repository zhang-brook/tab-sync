<template>
  <svg class="tree-expand-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <!-- 已全部展开：上下折线相对，下次点击收起 -->
    <path v-if="expanded" d="M6.5 2 12 7l5.5-5M6.5 22 12 17l5.5 5" />
    <!-- 未全部展开：上下折线背向，下次点击展开 -->
    <path v-else d="M6.5 7 12 2l5.5 5M6.5 17 12 22l5.5-5" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ expanded: boolean }>()
</script>

<style scoped>
.tree-expand-toggle-icon {
  width: 1em;
  height: 1em;
  display: block;
}
</style>
