<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import WorkspacePickerDialog from './WorkspacePickerDialog.vue'
import { closeLocalTabs, type LocalTab } from '../services/local-tabs'
import { saveTabsToWorkspace, buildTabPayloads } from '../services/save-tabs'
import { reportServiceError } from '../services/feedback'
import type { WorkspaceTreeNode } from '../utils/workspace-tree'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    tabs: LocalTab[]
    title?: string
    /** 是否显示「保存后关闭标签页」选项 */
    allowCloseAfterSave?: boolean
    /** 打开时「保存后关闭」是否默认勾选 */
    defaultCloseAfterSave?: boolean
  }>(),
  {
    title: '保存到工作组',
    allowCloseAfterSave: true,
    defaultCloseAfterSave: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', payload: { workspaceId: string; workspaceName: string; added: number; skipped: number; closed: boolean }): void
}>()

const saving = ref(false)
const closeAfterSave = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (open) closeAfterSave.value = props.defaultCloseAfterSave
  },
)

const dialogWidth = '420px'

async function onSelect(node: WorkspaceTreeNode) {
  if (saving.value) return
  const payloads = buildTabPayloads(props.tabs)
  if (payloads.length === 0) {
    ElMessage.warning('所选页面类型不支持收藏（如浏览器内置页面）')
    return
  }
  saving.value = true
  try {
    const outcome = await saveTabsToWorkspace(node.id, props.tabs)
    const closed = props.allowCloseAfterSave && closeAfterSave.value
    if (closed) {
      await closeLocalTabs(payloads.map((p) => p.chromeTabId))
    }
    const suffix = outcome.skipped > 0 ? `，跳过 ${outcome.skipped} 个重复` : ''
    ElMessage.success(
      `${closed ? '已保存并关闭' : '已保存'} ${outcome.added + outcome.skipped} 个标签页到「${node.name}」${suffix}`,
    )
    emit('saved', {
      workspaceId: node.id,
      workspaceName: node.name,
      added: outcome.added,
      skipped: outcome.skipped,
      closed,
    })
    emit('update:modelValue', false)
  } catch (err) {
    reportServiceError(err, { fallback: '保存到工作组失败' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <WorkspacePickerDialog
    :model-value="modelValue"
    :title="title"
    :width="dialogWidth"
    confirmable
    :close-tab="allowCloseAfterSave ? closeAfterSave : false"
    :show-close-option="allowCloseAfterSave"
    close-tab-label="保存后关闭标签页"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @update:close-tab="(v: boolean) => (closeAfterSave = v)"
    @select="onSelect"
  />
</template>
