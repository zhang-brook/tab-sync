<template>
  <div class="picker-panel" :class="{ 'is-fill': fillHeight }">
    <el-input
      v-model="keyword"
      placeholder="搜索工作组..."
      size="default"
      clearable
      :prefix-icon="Search"
    />

    <div class="picker-tree">
      <div v-if="loading" class="picker-hint">加载中...</div>
      <div v-else-if="treeData.length === 0" class="picker-hint">暂无工作组</div>
      <el-tree
        v-else
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :props="treeProps"
        :filter-node-method="filterNode"
        :expand-on-click-node="false"
        default-expand-all
        highlight-current
        @node-click="onNodeClick"
      >
        <template #default="{ data }">
          <span
            class="picker-node"
            :class="{ 'is-disabled': disabledSet.has(data.id) }"
            :title="disabledSet.has(data.id) ? '当前不可选择' : ''"
          >
            <span class="picker-dot" :style="{ backgroundColor: data.color }" />
            <span class="picker-name">{{ data.name }}</span>
            <span v-if="data.tabCount" class="picker-count">{{ data.tabCount }}</span>
          </span>
        </template>
      </el-tree>
    </div>

    <div class="picker-footer">
      <el-checkbox
        v-if="confirmable"
        :model-value="closeTabModel"
        @update:model-value="onCloseTabChange"
      >
        {{ closeTabLabel }}
      </el-checkbox>
      <div class="picker-footer-actions">
        <el-button @click="emit('cancel')">取消</el-button>
        <el-button
          v-if="confirmable"
          type="primary"
          :disabled="!selectedNode"
          @click="onConfirm"
        >
          确认
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { sendMessage } from '../composables/useMessage'
import { buildWorkspaceTree, type WorkspaceTreeNode } from '../utils/workspace-tree'
import type { WorkspacesData } from '../types'

const props = defineProps<{
  /** 确认模式：点击节点仅选中，需点击「确认」后才触发 select；默认 false（选中即触发） */
  confirmable?: boolean
  /** 确认模式下底部复选框是否勾选（如「加入后关闭当前页」），默认 true */
  closeTab?: boolean
  /** 确认模式下底部复选框文案，默认「加入后关闭当前页」 */
  closeTabLabel?: string
  /** 需要禁用（可见但不可选）的工作组 id，例如标签页当前所在工作组 */
  disabledIds?: string[]
  /** 撑满父容器高度：树区自动拉伸，底部按钮区吸到容器底部（弹窗版不传） */
  fillHeight?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', node: WorkspaceTreeNode): void
  (e: 'update:closeTab', v: boolean): void
  /** 非确认模式点节点 / 点「取消」：通知外层关闭（弹窗或窗口） */
  (e: 'cancel'): void
}>()

const closeTabLabel = props.closeTabLabel ?? '加入后关闭当前页'

const closeTabModel = computed(() => props.closeTab ?? true)

const loading = ref(false)
const keyword = ref('')
const treeData = ref<WorkspaceTreeNode[]>([])
const treeRef = ref()
/** 确认模式下的当前选中节点（未选中时「确认」按钮禁用） */
const selectedNode = ref<WorkspaceTreeNode | null>(null)

const treeProps = { label: 'name', children: 'children' }

watch(keyword, (val) => {
  treeRef.value?.filter(val)
})

function filterNode(value: string, data: Record<string, unknown>) {
  if (!value) return true
  return String((data as unknown as WorkspaceTreeNode).name).toLowerCase().includes(value.toLowerCase())
}

const disabledSet = computed(() => new Set(props.disabledIds || []))

/** 重新加载工作组列表（由外层在弹窗打开 / 页面挂载时调用） */
async function reload() {
  keyword.value = ''
  selectedNode.value = null
  loading.value = true
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES', payload: { includeSystem: true } })
  if (res.success && res.data) {
    treeData.value = buildWorkspaceTree(res.data.workspaces)
  } else {
    treeData.value = []
  }
  loading.value = false
}

defineExpose({ reload })

function onNodeClick(node: WorkspaceTreeNode) {
  if (disabledSet.value.has(node.id)) return
  if (props.confirmable) {
    // 确认模式：仅记录选中项，「确认」按钮点击后才触发 select
    selectedNode.value = node
    return
  }
  emit('select', node)
  // 非确认模式选中即关闭（与弹窗版行为一致）
  emit('cancel')
}

/** 底部复选框切换（el-checkbox 的 update:modelValue 参数可能是 boolean/string/number，统一转 boolean） */
function onCloseTabChange(v: boolean | string | number) {
  emit('update:closeTab', !!v)
}

/** 确认模式下点击「确认」：提交当前选中项（是否关闭由父组件决定） */
function onConfirm() {
  if (!selectedNode.value) return
  emit('select', selectedNode.value)
}
</script>

<style scoped>
/* 撑满模式：树区 flex 拉伸占满剩余空间，按钮区自然吸到容器底部 */
.picker-panel.is-fill {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.picker-panel.is-fill .picker-tree {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.picker-footer {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.picker-footer-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.picker-tree {
  margin-top: 12px;
  max-height: 320px;
  overflow-y: auto;
}

.picker-hint {
  padding: 24px;
  text-align: center;
  color: #909399;
  font-size: 13px;
}

.picker-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.picker-node.is-disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.picker-node.is-disabled .picker-dot {
  opacity: 0.4;
}

.picker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.picker-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-count {
  font-size: 11px;
  color: #909399;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 0 6px;
}
</style>
