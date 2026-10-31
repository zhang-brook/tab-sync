<script setup lang="ts">
import { computed, inject } from 'vue'
import { ENTITY_NAVIGATION } from '../composables/entity-navigation'
import { dashboardTargetUrl, targetOfTag } from '../utils/dashboard-links'
import { openTabAfterActive } from '../utils/tab-utils'
import { normalizeColor } from '../constants/theme'
import type { TabTagDisplay } from '../types/tab-list'

const props = withDefaults(
  defineProps<{
    /** 要展示的标签或工作组 */
    tag: TabTagDisplay
    size?: 'small' | 'default' | 'large'
  }>(),
  { size: 'small' },
)

const emit = defineEmits<{
  /** 已完成跳转后触发（如对话框借此关闭自身） */
  (e: 'open'): void
}>()

const isWorkspace = computed(() => props.tag.kind === 'workspace')
/** 悬浮提示：帮助区分标签与工作组；关闭 persistent，大列表里未悬停的芯片不挂弹层内容 */
const kindLabel = computed(() => (isWorkspace.value ? '工作组' : '标签'))
const target = computed(() => targetOfTag(props.tag))

/** 工作组用浅色描边，标签用深色胶囊；标签色分别作用于文字/边框与背景 */
const tagStyle = computed(() => {
  const color = props.tag.color
  if (!color) return undefined
  const value = normalizeColor(color)
  return isWorkspace.value
    ? { borderColor: value, color: value }
    : { backgroundColor: value, borderColor: value }
})

const navigate = inject(ENTITY_NAVIGATION, null)

function onClick(event: MouseEvent) {
  const next = target.value
  if (!next) return
  event.stopPropagation()
  if (navigate) navigate(next)
  else void openTabAfterActive(dashboardTargetUrl(next))
  emit('open')
}
</script>

<template>
  <el-tooltip :content="kindLabel" placement="top" :show-after="300" :persistent="false">
    <el-tag
      :size="size"
      :effect="isWorkspace ? 'plain' : 'dark'"
      :round="!isWorkspace"
      :class="['entity-tag', { 'is-clickable': target }]"
      :style="tagStyle"
      @click="onClick"
    >{{ tag.name }}</el-tag>
  </el-tooltip>
</template>

<style scoped>
.entity-tag.is-clickable {
  cursor: pointer;
}
</style>
