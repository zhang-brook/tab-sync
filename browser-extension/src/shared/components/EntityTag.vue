<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from 'vue'
import { ENTITY_NAVIGATION } from '../composables/entity-navigation'
import { hideEntityTooltip, showEntityTooltip } from '../composables/entity-tooltip'
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
/** 悬浮提示：帮助区分标签与工作组；弹层由页面级单例统一渲染 */
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

function onMouseenter(event: MouseEvent) {
  showEntityTooltip(event.currentTarget as HTMLElement, kindLabel.value)
}

function onClick(event: MouseEvent) {
  const next = target.value
  if (!next) return
  hideEntityTooltip()
  event.stopPropagation()
  if (navigate) navigate(next)
  else void openTabAfterActive(dashboardTargetUrl(next))
  emit('open')
}

onBeforeUnmount(hideEntityTooltip)
</script>

<template>
  <el-tag
    :size="size"
    :effect="isWorkspace ? 'plain' : 'dark'"
    :round="!isWorkspace"
    :class="['entity-tag', { 'is-clickable': target }]"
    :style="tagStyle"
    @mouseenter="onMouseenter"
    @mouseleave="hideEntityTooltip"
    @click="onClick"
  >{{ tag.name }}</el-tag>
</template>

<style scoped>
.entity-tag.is-clickable {
  cursor: pointer;
}
</style>
