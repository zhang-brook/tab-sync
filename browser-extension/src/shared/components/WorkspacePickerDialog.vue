<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="dialogWidth"
    append-to-body
    @update:model-value="onUpdateModelValue"
    @open="onOpen"
  >
    <WorkspacePickerPanel
      ref="panelRef"
      :confirmable="confirmable"
      :close-tab="closeTab"
      :close-tab-label="closeTabLabel"
      :disabled-ids="disabledIds"
      :manageable="manageable"
      :highlight-default-workspace="highlightDefaultWorkspace"
      @select="onSelect"
      @update:close-tab="onUpdateCloseTab"
      @cancel="onCancel"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import WorkspacePickerPanel from './WorkspacePickerPanel.vue'
import type { WorkspaceTreeNode } from '../utils/workspace-tree'

const props = defineProps<{
  modelValue: boolean
  title?: string
  /** 弹窗宽度（CSS 宽度值，如 '420px'、'90%'），默认 '420px' */
  width?: string
  /** 确认模式：点击节点仅选中，需点击「确认」后才触发 select；默认 false（选中即触发） */
  confirmable?: boolean
  /** 确认模式下底部复选框是否勾选（如「加入后关闭当前页」），默认 true */
  closeTab?: boolean
  /** 确认模式下底部复选框文案，默认「加入后关闭当前页」 */
  closeTabLabel?: string
  /** 需要禁用（可见但不可选）的工作组 id，例如标签页当前所在工作组 */
  disabledIds?: string[]
  /** 启用分组管理：新建 / 重命名 / 删除（不传时透传 undefined，Panel 默认开启） */
  manageable?: boolean
  /** 打开时默认选中「默认分组」并标注 (默认)；传入 false 则不做默认选中，默认 true */
  highlightDefaultWorkspace?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'select', node: WorkspaceTreeNode): void
  (e: 'update:closeTab', v: boolean): void
}>()

const title = props.title ?? '选择工作组'
const dialogWidth = props.width ?? '420px'

const panelRef = ref<InstanceType<typeof WorkspacePickerPanel>>()

// el-dialog 内容在打开时才渲染，首次打开时 Panel 挂载与 @open 事件先后触发，reload 幂等
function onOpen() {
  panelRef.value?.reload()
}

function onUpdateModelValue(v: boolean) {
  emit('update:modelValue', v)
}

function onSelect(node: WorkspaceTreeNode) {
  emit('select', node)
}

/** el-checkbox 的 update:modelValue 参数可能是 boolean/string/number，统一转 boolean */
function onUpdateCloseTab(v: boolean | string | number) {
  emit('update:closeTab', !!v)
}

/** 非确认模式点节点 / 点「取消」：关闭弹窗 */
function onCancel() {
  emit('update:modelValue', false)
}
</script>
