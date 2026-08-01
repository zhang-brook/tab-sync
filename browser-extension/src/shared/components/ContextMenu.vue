<template>
  <div class="context-menu-wrapper" @contextmenu.prevent="handleContextMenu">
    <slot />
    <el-dropdown
      ref="dropdownRef"
      :trigger="['contextmenu']"
      :virtual-ref="virtualRef"
      virtual-triggering
      @command="$emit('command', $event)"
    >
      <span style="display: none"></span>
      <template #dropdown>
        <slot name="menu" />
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.context-menu-wrapper {
  display: contents;
}
</style>

<script lang="ts">
/** 模块级共享：所有 ContextMenu 实例，打开新菜单前先关闭其他菜单 */
const menuInstances = new Set<{ handleOpen: () => void; handleClose: () => void }>()
</script>

<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount } from 'vue'

const emit = defineEmits<{
  (e: 'command', command: string): void
  (e: 'open', event: MouseEvent): void
}>()

const dropdownRef = ref<{ handleOpen: () => void; handleClose: () => void } | null>(null)
const virtualRef = ref<{ getBoundingClientRect: () => DOMRect } | undefined>(undefined)

function createVirtualEl(x: number, y: number) {
  return {
    getBoundingClientRect: () => ({
      x,
      y,
      top: y,
      left: x,
      right: x,
      bottom: y,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect),
  }
}

function handleContextMenu(event: MouseEvent) {
  if (dropdownRef.value) menuInstances.add(dropdownRef.value)

  // 关闭其它已打开的右键菜单
  for (const inst of menuInstances) {
    if (inst !== dropdownRef.value) inst.handleClose()
  }

  // 用鼠标坐标创建虚拟触发点，并重新打开菜单以更新位置
  virtualRef.value = createVirtualEl(event.clientX, event.clientY)
  dropdownRef.value?.handleClose()
  nextTick(() => {
    dropdownRef.value?.handleOpen()
  })

  emit('open', event)
}

onBeforeUnmount(() => {
  if (dropdownRef.value) menuInstances.delete(dropdownRef.value)
})

defineExpose({ handleContextMenu })
</script>
