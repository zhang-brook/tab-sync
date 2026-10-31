<script setup lang="ts">
withDefaults(
  defineProps<{
    count: number
    /** 文案后缀，默认「个标签页」 */
    unit?: string
  }>(),
  { unit: '个标签页' },
)
</script>

<template>
  <div class="selection-bar">
    <span class="selection-count">已选 {{ count }} {{ unit }}</span>
    <div class="selection-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
}

.selection-count {
  font-size: 12px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.selection-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
