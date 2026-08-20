<template>
  <div class="picker-panel" :class="{ 'is-fill': fillHeight }">
    <div class="picker-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索工作组..."
        size="default"
        clearable
        :prefix-icon="Search"
      />
      <el-button
        v-if="manageable"
        circle
        :icon="Plus"
        title="新建工作组"
        @click="onCreate"
      />
    </div>

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
          <ContextMenu @command="(cmd) => onNodeMenuCommand(cmd, data)">
            <span
              class="picker-node"
              :class="{ 'is-disabled': disabledSet.has(data.id) }"
              :title="disabledSet.has(data.id) ? '当前不可选择' : ''"
            >
              <span class="picker-dot" :style="{ backgroundColor: data.color }" />
              <span class="picker-name">{{ data.name }}</span>
              <span v-if="data.id === defaultWorkspaceId" class="picker-default">(默认)</span>
              <span v-if="data.tabCount" class="picker-count">{{ data.tabCount }}</span>
              <span v-if="manageable" class="picker-node-actions" @click.stop>
                <el-icon title="重命名" @click="onRenameNode(data)"><Edit /></el-icon>
                <el-icon title="删除" @click="onDeleteNode(data)"><Delete /></el-icon>
              </span>
            </span>
            <template #menu v-if="manageable">
              <el-dropdown-menu>
                <el-dropdown-item :command="'edit'" :icon="Edit" :disabled="data.workspace.isSystem">
                  编辑名称
                </el-dropdown-item>
                <el-dropdown-item :command="'goToSettings'" :icon="Open">
                  前往设置页编辑备注
                </el-dropdown-item>
                <el-dropdown-item :command="'createChild'" :icon="FolderAdd">
                  新建子工作组
                </el-dropdown-item>
                <el-dropdown-item
                  :command="'delete'"
                  :icon="Delete"
                  divided
                  class="danger-dropdown-item"
                  :disabled="data.workspace.isSystem"
                >
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </ContextMenu>
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
import { ref, watch, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Edit, Delete, FolderAdd, Open } from '@element-plus/icons-vue'
import { sendMessage } from '../composables/useMessage'
import { storage, STORAGE_KEYS } from '../storage'
import { buildWorkspaceTree, collectDescendantIds, findWorkspaceTreeNode, type WorkspaceTreeNode } from '../utils/workspace-tree'
import ContextMenu from './ContextMenu.vue'
import type { Workspace, WorkspacesData } from '../types'
import { DASHBOARD_URL } from '../utils/pages'

const props = withDefaults(defineProps<{
  /** 确认模式：点击节点仅选中，需点击「确认」后才触发 select；默认 false（选中即触发） */
  confirmable?: boolean
  /** 确认模式下底部复选框是否勾选（如「加入后关闭该页面」），默认 true */
  closeTab?: boolean
  /** 确认模式下底部复选框文案，默认「加入后关闭该页面」 */
  closeTabLabel?: string
  /** 需要禁用（可见但不可选）的工作组 id，例如标签页当前所在工作组 */
  disabledIds?: string[]
  /** 撑满父容器高度：树区自动拉伸，底部按钮区吸到容器底部（弹窗版不传） */
  fillHeight?: boolean
  /** 启用分组管理：顶部「新建工作组」按钮 + 节点悬停重命名/删除（系统分组仍受保护），默认 true */
  manageable?: boolean
  /** 打开/刷新时默认选中「默认分组」并标注 (默认)；传入 false 则不做默认选中，默认 true */
  highlightDefaultWorkspace?: boolean
}>(), {
  manageable: true,
  highlightDefaultWorkspace: true,
})

const emit = defineEmits<{
  (e: 'select', node: WorkspaceTreeNode): void
  (e: 'update:closeTab', v: boolean): void
  /** 非确认模式点节点 / 点「取消」：通知外层关闭（弹窗或窗口） */
  (e: 'cancel'): void
}>()

const closeTabLabel = props.closeTabLabel ?? '加入后关闭该页面'

const closeTabModel = computed(() => props.closeTab ?? true)

const loading = ref(false)
const keyword = ref('')
const treeData = ref<WorkspaceTreeNode[]>([])
const treeRef = ref()
/** 确认模式下的当前选中节点（未选中时「确认」按钮禁用） */
const selectedNode = ref<WorkspaceTreeNode | null>(null)
/** 当前默认分组 ID（用于「(默认)」标记与初始选中）；空值回退「未分组」 */
const defaultWorkspaceId = ref('')
// 「未分组」系统工作组的固定标识（见 background/index.ts UNGROUPED_WORKSPACE_ID）
const UNGROUPED_WORKSPACE_ID = 'ungrouped'

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
  if (props.highlightDefaultWorkspace) {
    defaultWorkspaceId.value = (await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)) || UNGROUPED_WORKSPACE_ID
  }
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES', payload: { includeSystem: true } })
  if (!res.success || !res.data) {
    treeData.value = []
    loading.value = false
    return
  }
  treeData.value = buildWorkspaceTree(res.data.workspaces)
  // 先结束 loading 让 el-tree 完成渲染，否则下一帧 treeRef 尚未挂载，高亮会被静默跳过
  loading.value = false
  // 默认选中「默认分组」：高亮该项并初始化确认模式的选中项（被禁用的分组不选中）
  const defaultNode = defaultWorkspaceId.value
    ? findWorkspaceTreeNode(treeData.value, defaultWorkspaceId.value)
    : null
  if (defaultNode && !disabledSet.value.has(defaultNode.id)) {
    await nextTick()
    treeRef.value?.setCurrentKey(defaultNode.id)
    selectedNode.value = defaultNode
  }
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

// ============ 分组管理（新建 / 重命名 / 删除） ============

/** 将树节点拍平为原始工作组列表（用于统计删除影响范围） */
function flattenWorkspaces(nodes: WorkspaceTreeNode[]): Workspace[] {
  const out: Workspace[] = []
  for (const node of nodes) {
    out.push(node.workspace)
    out.push(...flattenWorkspaces(node.children))
  }
  return out
}

/** 顶部「新建工作组」：默认创建在顶层（parentId 为空） */
async function onCreate() {
  const result = await ElMessageBox.prompt('请输入工作组名称', '新建工作组', {
    confirmButtonText: '创建',
    inputPlaceholder: '工作组名称',
    inputValidator: (v) => (v?.trim() ? true : '请输入工作组名称'),
  }).catch(() => null)
  if (!result) return
  const name = String(result.value).trim()
  const res = await sendMessage({ action: 'CREATE_WORKSPACE', payload: { name, color: '#409EFF' } })
  if (res.success) {
    ElMessage.success('工作组已创建')
    await reload()
  } else {
    ElMessage.error(res.error || '创建工作组失败')
  }
}

/** 右键「新建子工作组」：创建到指定分组之下 */
async function onCreateChild(node: WorkspaceTreeNode) {
  const result = await ElMessageBox.prompt('请输入子工作组名称', '新建子工作组', {
    confirmButtonText: '创建',
    inputPlaceholder: '工作组名称',
    inputValidator: (v) => (v?.trim() ? true : '请输入工作组名称'),
  }).catch(() => null)
  if (!result) return
  const name = String(result.value).trim()
  const res = await sendMessage({
    action: 'CREATE_WORKSPACE',
    payload: { name, color: '#409EFF', parentId: node.id },
  })
  if (res.success) {
    ElMessage.success('子工作组已创建')
    await reload()
  } else {
    ElMessage.error(res.error || '创建子工作组失败')
  }
}

/** 树节点右键菜单命令分发 */
function onNodeMenuCommand(command: string, node: WorkspaceTreeNode) {
  switch (command) {
    case 'edit':
      onRenameNode(node)
      break
    case 'goToSettings':
      goToDashboardSettings(node)
      break
    case 'createChild':
      onCreateChild(node)
      break
    case 'delete':
      onDeleteNode(node)
      break
  }
}

/** 跳转到后台管理页面的设置页（编辑备注） */
async function goToDashboardSettings(node: WorkspaceTreeNode) {
  // 打开带 hash 路由的设置页：#/settings?workspaceId=xxx
  const url = `${DASHBOARD_URL}#/settings?workspaceId=${encodeURIComponent(node.id)}`
  const tabs = await chrome.tabs.query({ url: DASHBOARD_URL + '*' })
  if (tabs.length > 0 && tabs[0].id != null) {
    // 已有 Dashboard 标签页，切换到它并跳转
    await chrome.tabs.update(tabs[0].id, { active: true, url })
    if (tabs[0].windowId != null) {
      await chrome.windows.update(tabs[0].windowId, { focused: true })
    }
  } else {
    // 没有打开的 Dashboard，打开新标签页
    await chrome.tabs.create({ url, active: true })
  }
}

/** 节点悬停「重命名」：仅修改名称，其余字段保持不变 */
async function onRenameNode(node: WorkspaceTreeNode) {
  if (node.workspace.isSystem) {
    ElMessage.warning('系统分组不可改名')
    return
  }
  const result = await ElMessageBox.prompt('请输入新的工作组名称', '重命名工作组', {
    confirmButtonText: '保存',
    inputValue: node.name,
    inputValidator: (v) => (v?.trim() ? true : '请输入工作组名称'),
  }).catch(() => null)
  if (!result) return
  const name = String(result.value).trim()
  if (!name || name === node.name) return
  const res = await sendMessage({ action: 'UPDATE_WORKSPACE', payload: { id: node.id, name } })
  if (res.success) {
    ElMessage.success('工作组已重命名')
    await reload()
  } else {
    ElMessage.error(res.error || '重命名失败')
  }
}

/** 节点悬停「删除」：确认时提示子分组与标签页将一并删除（与服务端递归删除行为一致） */
async function onDeleteNode(node: WorkspaceTreeNode) {
  if (node.workspace.isSystem) {
    ElMessage.warning('系统分组不可删除')
    return
  }
  if (node.id === defaultWorkspaceId.value) {
    ElMessage.warning('默认分组不可删除，请先更改默认分组')
    return
  }
  const flat = flattenWorkspaces(treeData.value)
  const descendantIds = collectDescendantIds(flat, node.id)
  const childCount = descendantIds.length
  const tabCount = flat
    .filter((w) => w.id === node.id || descendantIds.includes(w.id))
    .reduce((sum, w) => sum + (w.tabs?.length ?? 0), 0)
  try {
    await ElMessageBox.confirm(
      `确定要删除工作组「${node.name}」吗？其 ${childCount} 个子工作组及全部 ${tabCount} 个标签页将一并删除，且不可恢复。`,
      '删除工作组',
      { type: 'warning' },
    )
  } catch {
    return
  }
  const res = await sendMessage({ action: 'DELETE_WORKSPACE', payload: { id: node.id, defaultWorkspaceId: defaultWorkspaceId.value } })
  if (res.success) {
    ElMessage.success('工作组已删除')
    await reload()
  } else {
    ElMessage.error(res.error || '删除工作组失败')
  }
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

.picker-toolbar {
  display: flex;
  gap: 8px;
}

.picker-toolbar .el-input {
  flex: 1;
}

.picker-node-actions {
  display: none;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  flex-shrink: 0;
}

.picker-node:hover .picker-node-actions {
  display: flex;
}

.picker-node-actions .el-icon {
  cursor: pointer;
  color: #909399;
  font-size: 14px;
  padding: 2px;
  border-radius: 4px;
}

.picker-node-actions .el-icon:hover {
  color: #409eff;
  background: #ecf5ff;
}

.picker-node-actions .el-icon:last-child:hover {
  color: #f56c6c;
  background: #fef0f0;
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

.picker-default {
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
}
</style>

<style>
/* 下拉菜单的「删除」项：红字（与 dashboard 一致；菜单渲染在 body 下，需全局样式） */
.danger-dropdown-item {
  color: var(--el-color-danger) !important;
}

.danger-dropdown-item:hover {
  background-color: var(--el-color-danger-light-9);
}
</style>
