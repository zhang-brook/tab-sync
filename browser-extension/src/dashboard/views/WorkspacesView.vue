<template>
  <div class="workspaces-view">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索工作组..."
          clearable
          style="width: 220px"
          :prefix-icon="Search"
        />
      </div>
      <div class="toolbar-right">
        <el-button @click="loadWorkspaces">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 双栏：左树 + 右标签页 -->
    <div v-loading="loading" class="split-pane">
      <!-- 左侧：工作组树 -->
      <div class="tree-pane">
        <div class="pane-title-row">
          <span class="pane-title">工作组</span>
          <div class="pane-title-actions">
            <el-tooltip content="新建工作组" placement="top">
              <el-button size="small" text type="primary" @click="showCreateDialog('')">
                <el-icon><Plus /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </div>
        <el-empty
          v-if="treeData.length === 0 && !loading"
          :image-size="60"
          description="暂无工作组"
        />
        <el-tree
          v-else
          ref="treeRef"
          :data="treeData"
          node-key="id"
          :props="treeProps"
          :filter-node-method="filterNode"
          :expand-on-click-node="false"
          highlight-current
          default-expand-all
          @node-click="onSelectNode"
        >
          <template #default="{ data }">
            <span class="tree-node">
              <span class="tree-dot" :style="{ backgroundColor: data.color }" />
              <span class="tree-name" :title="data.name">{{ data.name }}</span>
              <span v-if="data.tabCount" class="tree-count">{{ data.tabCount }}</span>
              <el-dropdown
                trigger="click"
                @command="(cmd: string) => onNodeMenuCommand(cmd, data)"
                @click.stop
              >
                <el-button size="small" text class="node-dots-btn" @click.stop>
                  <el-icon class="dots-vertical"><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item :command="'open'" :icon="FolderOpened" :disabled="data.tabCount === 0">
                      打开所有标签页
                      <el-text type="info" style="margin-left: 6.18px;" v-if="data.tabCount > 0">
                        ({{ data.tabCount }}个标签页)
                      </el-text>
                    </el-dropdown-item>
                    <el-dropdown-item :command="'openNewWindow'" :icon="CopyDocument" :disabled="data.tabCount === 0">
                      打开所有标签页（新窗口）
                    </el-dropdown-item>
                    <el-dropdown-item :command="'openAsGroup'" :icon="Collection" :disabled="data.tabCount === 0">
                      打开所有标签页（打开为标签组）
                    </el-dropdown-item>
                    <el-dropdown-item :command="'createChild'" :icon="FolderAdd" divided>
                      新建子工作组
                    </el-dropdown-item>
                    <el-dropdown-item :command="'edit'" :icon="Edit" :disabled="data.workspace?.isSystem">
                      编辑
                    </el-dropdown-item>
                    <el-dropdown-item :command="'delete'" :icon="Delete" divided class="danger-dropdown-item" :disabled="data.workspace?.isSystem">
                      删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </span>
          </template>
        </el-tree>
      </div>

      <!-- 右侧：选中工作组的标签页 -->
      <div class="detail-pane">
        <el-empty v-if="!selectedWorkspace" description="请选择左侧的工作组" />

        <template v-else>
          <!-- 详情头部 -->
          <div class="detail-header">
            <div class="detail-title-row">
              <span class="ws-color-dot" :style="{ backgroundColor: selectedWorkspace.color }" />
              <span class="ws-name">{{ selectedWorkspace.name }}</span>
              <el-tag v-for="tg in (selectedWorkspace.tags ?? [])" :key="tg.id" size="small" effect="plain" :style="tg.color ? { color: tg.color, borderColor: tg.color } : {}">{{ tg.name }}</el-tag>
              <el-tag size="small" type="info">{{ rightTabs.length }} 个标签页</el-tag>
            </div>
            <div class="detail-actions">
              <el-tooltip content="工作组标签" placement="top">
                <el-button size="small" text @click="openWorkspaceTagEditor(selectedWorkspace)">
                  <el-icon><PriceTag /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="打开所有标签页" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenWorkspace(selectedWorkspace.id, false)">
                  <el-icon><FolderOpened /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="在新窗口中打开" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenWorkspace(selectedWorkspace.id, true)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="打开为标签组" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenAsTabGroup(selectedWorkspace.id)">
                  <el-icon><Collection /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="新建子工作组" placement="top">
                <el-button size="small" text @click="showCreateDialog(selectedWorkspace.id)">
                  <el-icon><FolderAdd /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="编辑" placement="top">
                <el-button size="small" text :disabled="selectedWorkspace?.isSystem" @click="showEditDialog(selectedWorkspace)">
                  <el-icon><Edit /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button size="small" text type="danger" :disabled="selectedWorkspace?.isSystem" @click="handleDelete(selectedWorkspace)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <!-- 层级范围切换 -->
          <div class="scope-bar">
            <el-radio-group v-model="tabScope" size="small">
              <el-radio-button value="current">仅本层级</el-radio-button>
              <el-radio-button value="all">包含子工作组</el-radio-button>
            </el-radio-group>
            <el-select v-model="tagFilter" placeholder="按标签筛选" clearable size="small" style="width: 160px; margin-left: 12px">
              <el-option v-for="t in allTabTags" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </div>

          <!-- 标签页列表 -->
          <div class="detail-body">
            <el-empty v-if="rightTabs.length === 0" :image-size="60" description="工作组内暂无标签页" />

            <!-- 仅本层级：支持拖拽排序 -->
            <draggable
              v-else-if="tabScope === 'current'"
              :list="selectedWorkspace.tabs"
              item-key="tabId"
              handle=".drag-handle"
              ghost-class="tab-ghost"
              :animation="200"
              @update="onDragUpdate"
            >
              <template #item="{ element: tab }">
                <div class="ws-tab-item">
                  <span class="drag-handle" title="拖拽排序">⋮⋮</span>
                  <LazyFavicon
                    :favIconUrl="tab.favIconUrl"
                    :size="16"
                    class="tab-favicon"
                  />
                  <div class="tab-text">
                    <div class="tab-title" :title="tab.displayName ? tab.displayName + '（原：' + tab.title + '）' : tab.title" @click="openSingleTab(tab.url)">{{ displayTitle(tab) }}</div>
                    <div class="tab-url" :title="tab.url">{{ tab.url }}</div>
                    <div class="tab-tags" v-if="tab.tags && tab.tags.length">
                      <el-tag v-for="tg in tab.tags" :key="tg.id" size="small" effect="plain" :style="tg.color ? { color: tg.color, borderColor: tg.color } : {}">{{ tg.name }}</el-tag>
                    </div>
                  </div>
                  <span class="tab-added" :title="'添加于 ' + formatAddedAtFull(tab.addedAt)">{{ formatAddedAt(tab.addedAt) }}</span>
                  <el-tooltip content="修改添加时间" placement="top">
                    <el-button size="small" text @click="openEditTimeDialog(selectedWorkspace!.id, tab)">
                      <el-icon><Clock /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="重命名" placement="top">
                    <el-button size="small" text @click="openRenameDialog(selectedWorkspace!.id, tab)">
                      <el-icon><Edit /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="标签" placement="top">
                    <el-button size="small" text @click="openTabTagEditor(selectedWorkspace!.id, tab)">
                      <el-icon><PriceTag /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="在新标签页中打开" placement="top">
                    <el-button size="small" text type="primary" @click="openSingleTab(tab.url)">
                      <el-icon><View /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="从工作组中移除" placement="top">
                    <el-button size="small" text type="danger" @click="handleRemoveTab(selectedWorkspace!.id, tab.tabId)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </template>
            </draggable>

            <!-- 包含子工作组：只读列表，带来源标记 -->
            <div v-else class="flat-tabs">
              <div v-for="item in rightTabs" :key="item.workspaceId + '-' + item.tab.tabId" class="ws-tab-item">
                <LazyFavicon
                  :favIconUrl="item.tab.favIconUrl"
                  :size="16"
                  class="tab-favicon"
                />
                <div class="tab-text">
                  <div class="tab-title" :title="item.tab.displayName ? item.tab.displayName + '（原：' + item.tab.title + '）' : item.tab.title" @click="openSingleTab(item.tab.url)">{{ displayTitle(item.tab) }}</div>
                  <div class="tab-url" :title="item.tab.url">{{ item.tab.url }}</div>
                  <div class="tab-tags" v-if="item.tab.tags && item.tab.tags.length">
                    <el-tag v-for="tg in item.tab.tags" :key="tg.id" size="small" effect="plain" :style="tg.color ? { color: tg.color, borderColor: tg.color } : {}">{{ tg.name }}</el-tag>
                  </div>
                </div>
                <el-tag
                  v-if="item.workspaceId !== selectedWorkspace.id"
                  size="small"
                  effect="plain"
                  :style="{ borderColor: item.workspaceColor, color: item.workspaceColor }"
                >
                  {{ item.workspaceName }}
                </el-tag>
                <span class="tab-added" :title="'添加于 ' + formatAddedAtFull(item.tab.addedAt)">{{ formatAddedAt(item.tab.addedAt) }}</span>
                <el-tooltip content="修改添加时间" placement="top">
                  <el-button size="small" text @click="openEditTimeDialog(item.workspaceId, item.tab)">
                    <el-icon><Clock /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="重命名" placement="top">
                  <el-button size="small" text @click="openRenameDialog(item.workspaceId, item.tab)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="标签" placement="top">
                  <el-button size="small" text @click="openTabTagEditor(item.workspaceId, item.tab)">
                    <el-icon><PriceTag /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="在新标签页中打开" placement="top">
                  <el-button size="small" text type="primary" @click="openSingleTab(item.tab.url)">
                    <el-icon><View /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="从工作组中移除" placement="top">
                  <el-button size="small" text type="danger" @click="handleRemoveTab(item.workspaceId, item.tab.tabId)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑工作组' : '新建工作组'"
      width="600px"
      destroy-on-close
    >
      <el-form label-width="90px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="formData.name" placeholder="例如: 项目A开发" />
        </el-form-item>
        <el-form-item label="父工作组">
          <el-tree-select
            v-model="formData.parentId"
            :data="parentTreeData"
            node-key="id"
            :props="treeProps"
            check-strictly
            clearable
            default-expand-all
            placeholder="不选则为根级工作组"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="标识色">
          <el-color-picker v-model="formData.color" :predefine="presetColors" />
        </el-form-item>
      </el-form>
      <div v-if="!isEditing" class="dialog-hint">
        创建后可在「标签页」页或侧边栏中选择标签页加入该工作组。
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 修改添加时间对话框 -->
    <el-dialog v-model="timeDialogVisible" title="修改添加时间" width="420px" destroy-on-close>
      <el-form label-width="90px" label-position="left">
        <el-form-item label="添加时间">
          <el-date-picker
            v-model="timeValue"
            type="datetime"
            placeholder="选择日期时间"
            :clearable="false"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="timeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="timeSaving" @click="handleSaveAddedTime">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重命名对话框 -->
    <el-dialog v-model="renameDialogVisible" title="重命名标签页" width="420px" destroy-on-close>
      <el-form label-width="80px" label-position="left">
        <el-form-item label="名称">
          <el-input
            v-model="renameValue"
            placeholder="输入新的显示名称（留空则恢复原始标题）"
            maxlength="500"
            show-word-limit
            clearable
            @keyup.enter="handleSaveRename"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="renameSaving" @click="handleSaveRename">保存</el-button>
      </template>
    </el-dialog>

    <!-- 标签编辑对话框 -->
    <TagEditorDialog
      v-model="tagEditorVisible"
      :scope="tagEditorScope"
      :selected-ids="tagEditorSelectedIds"
      @confirm="onTagEditorConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import LazyFavicon from '@/shared/components/LazyFavicon.vue'
import { Search, Plus, Refresh, FolderOpened, CopyDocument, Collection, Edit, Delete, View, FolderAdd, MoreFilled, PriceTag, Clock } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { sendMessage } from '../../shared/composables/useMessage'
import { buildWorkspaceTree, collectDescendantIds, type WorkspaceTreeNode } from '../../shared/utils/workspace-tree'
import { openTabAfterActive } from '../../shared/utils/tab-utils'
import type { Workspace, WorkspacesData, TabReference, TagInfo, TagsData } from '../../shared/types'
import TagEditorDialog from '../components/TagEditorDialog.vue'

const workspaces = ref<Workspace[]>([])
const loading = ref(true)
const searchKeyword = ref('')
const selectedId = ref('')
const tabScope = ref<'current' | 'all'>('current')

// 标签相关状态
const tagFilter = ref<number | null>(null)
const allTabTags = ref<TagInfo[]>([])
const tagEditorVisible = ref(false)
const tagEditorScope = ref<'tab' | 'workspace'>('tab')
const tagEditorSelectedIds = ref<number[]>([])
const tagEditorTarget = ref<{ workspaceId: string; tabId?: string } | null>(null)

const treeRef = ref()
const treeProps = { label: 'name', children: 'children' }

// 对话框
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const editingId = ref('')

const formData = ref({
  name: '',
  color: '#409EFF',
  parentId: '' as string,
})

const presetColors = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C',
  '#909399', '#00BCD4', '#9C27B0', '#FF5722',
]

/** 左侧树数据 */
const treeData = computed<WorkspaceTreeNode[]>(() => {
  const nodes = buildWorkspaceTree(workspaces.value)
  // 「未分组」等系统工作组固定置顶，避免混入普通分组排序
  const system = nodes.filter((n) => n.workspace.isSystem)
  const rest = nodes.filter((n) => !n.workspace.isSystem)
  return [...system, ...rest]
})

/** 父工作组下拉树（编辑时排除自身及后代，避免形成环） */
const parentTreeData = computed<WorkspaceTreeNode[]>(() => {
  if (!isEditing.value || !editingId.value) return treeData.value
  const excluded = new Set([editingId.value, ...collectDescendantIds(workspaces.value, editingId.value)])
  const prune = (nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] =>
    nodes
      .filter((n) => !excluded.has(n.id))
      .map((n) => ({ ...n, children: prune(n.children) }))
  return prune(treeData.value)
})

const selectedWorkspace = computed<Workspace | null>(
  () => workspaces.value.find((w) => w.id === selectedId.value) ?? null,
)

interface RightTabItem {
  tab: TabReference
  workspaceId: string
  workspaceName: string
  workspaceColor: string
}

/** 右侧标签页列表：根据层级范围聚合 */
const rightTabs = computed<RightTabItem[]>(() => {
  const ws = selectedWorkspace.value
  if (!ws) return []

  const collect = (w: Workspace): RightTabItem[] =>
    w.tabs.map((tab) => ({
      tab,
      workspaceId: w.id,
      workspaceName: w.name,
      workspaceColor: w.color,
    }))

  if (tabScope.value === 'current') return collect(ws)

  const ids = [ws.id, ...collectDescendantIds(workspaces.value, ws.id)]
  const result: RightTabItem[] = []
  for (const id of ids) {
    const w = workspaces.value.find((x) => x.id === id)
    if (w) result.push(...collect(w))
  }
  if (tagFilter.value != null) {
    return result.filter((item) => item.tab.tags?.some((t) => t.id === tagFilter.value))
  }
  return result
})

watch(searchKeyword, (val) => {
  treeRef.value?.filter(val)
})

function filterNode(value: string, data: Record<string, unknown>) {
  if (!value) return true
  return String((data as unknown as WorkspaceTreeNode).name).toLowerCase().includes(value.toLowerCase())
}

onMounted(() => {
  loadWorkspaces()
  void loadTabTags()
})

async function loadWorkspaces() {
  loading.value = true
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES', payload: { includeSystem: true } })
  if (res.success && res.data) {
    workspaces.value = res.data.workspaces
    // 保持/初始化选中项
    if (!selectedId.value || !workspaces.value.some((w) => w.id === selectedId.value)) {
      selectedId.value = workspaces.value[0]?.id ?? ''
    }
    await nextTick()
    if (selectedId.value) treeRef.value?.setCurrentKey(selectedId.value)
  }
  loading.value = false
}

// ============ 标签相关 ============

async function loadTabTags() {
  const res = await sendMessage<TagsData>({ action: 'GET_TAGS', payload: { scope: 'tab' } })
  if (res.success && res.data) {
    allTabTags.value = res.data.tags
  }
}

function openWorkspaceTagEditor(ws: Workspace) {
  tagEditorTarget.value = { workspaceId: ws.id }
  tagEditorScope.value = 'workspace'
  tagEditorSelectedIds.value = (ws.tags ?? []).map((t) => t.id)
  tagEditorVisible.value = true
}

function openTabTagEditor(workspaceId: string, tab: TabReference) {
  tagEditorTarget.value = { workspaceId, tabId: tab.tabId }
  tagEditorScope.value = 'tab'
  tagEditorSelectedIds.value = (tab.tags ?? []).map((t) => t.id)
  tagEditorVisible.value = true
}

async function onTagEditorConfirm(ids: number[]) {
  const target = tagEditorTarget.value
  if (!target) return
  const isTab = !!target.tabId
  const ws = workspaces.value.find((w) => w.id === target.workspaceId)
  const existingIds = isTab
    ? (ws?.tabs.find((t) => t.tabId === target.tabId)?.tags ?? []).map((t) => t.id)
    : (ws?.tags ?? []).map((t) => t.id)
  const toAdd = ids.filter((id) => !existingIds.includes(id))
  const toRemove = existingIds.filter((id) => !ids.includes(id))
  for (const id of toAdd) {
    if (isTab) {
      await sendMessage({ action: 'ADD_TAB_TAG', payload: { workspaceId: target.workspaceId, tabId: target.tabId!, tagId: id } })
    } else {
      await sendMessage({ action: 'ADD_WORKSPACE_TAG', payload: { workspaceId: target.workspaceId, tagId: id } })
    }
  }
  for (const id of toRemove) {
    if (isTab) {
      await sendMessage({ action: 'REMOVE_TAB_TAG', payload: { workspaceId: target.workspaceId, tabId: target.tabId!, tagId: id } })
    } else {
      await sendMessage({ action: 'REMOVE_WORKSPACE_TAG', payload: { workspaceId: target.workspaceId, tagId: id } })
    }
  }
  await loadWorkspaces()
  await loadTabTags()
}

function onSelectNode(node: WorkspaceTreeNode) {
  selectedId.value = node.id
}

function showCreateDialog(parentId: string) {
  isEditing.value = false
  editingId.value = ''
  formData.value = { name: '', color: '#409EFF', parentId }
  dialogVisible.value = true
}

function showEditDialog(ws: Workspace) {
  isEditing.value = true
  editingId.value = ws.id
  formData.value = {
    name: ws.name,
    color: ws.color,
    parentId: ws.parentId || '',
  }
  dialogVisible.value = true
}

/** 树中每个工作组项的「⋮」菜单：对对应工作组执行操作 */
function onNodeMenuCommand(command: string, node: WorkspaceTreeNode) {
  const ws = node.workspace
  // 系统工作组（如「未分组」）不允许删除或改名，但允许新建子分组
  if (ws.isSystem && (command === 'edit' || command === 'delete')) {
    ElMessage.warning('系统分组不可删除或改名')
    return
  }
  switch (command) {
    case 'open':
      handleOpenWorkspace(ws.id, false)
      break
    case 'openNewWindow':
      handleOpenWorkspace(ws.id, true)
      break
    case 'openAsGroup':
      handleOpenAsTabGroup(ws.id)
      break
    case 'createChild':
      showCreateDialog(ws.id)
      break
    case 'edit':
      showEditDialog(ws)
      break
    case 'delete':
      handleDelete(ws)
      break
  }
}

async function handleSave() {
  if (!formData.value.name.trim()) {
    ElMessage.warning('请输入工作组名称')
    return
  }

  saving.value = true

  if (isEditing.value) {
    const res = await sendMessage({
      action: 'UPDATE_WORKSPACE',
      payload: {
        id: editingId.value,
        name: formData.value.name.trim(),
        color: formData.value.color,
        parentId: formData.value.parentId || '',
      },
    })
    if (res.success) ElMessage.success('工作组已更新')
    else ElMessage.error(res.error || '更新失败')
  } else {
    // 创建不携带标签页；后续通过「标签页」页或侧边栏加入
    const res = await sendMessage<{ workspace: Workspace }>({
      action: 'CREATE_WORKSPACE',
      payload: {
        name: formData.value.name.trim(),
        color: formData.value.color,
        parentId: formData.value.parentId || '',
      },
    })
    if (res.success) {
      ElMessage.success('工作组已创建')
      if (res.data?.workspace?.id) selectedId.value = res.data.workspace.id
    } else {
      ElMessage.error(res.error || '创建失败')
    }
  }

  saving.value = false
  dialogVisible.value = false
  await loadWorkspaces()
}

async function handleDelete(ws: Workspace) {
  const descendantIds = collectDescendantIds(workspaces.value, ws.id)
  const childCount = descendantIds.length
  const tabCount = workspaces.value
    .filter((w) => w.id === ws.id || descendantIds.includes(w.id))
    .reduce((sum, w) => sum + (w.tabs?.length ?? 0), 0)
  try {
    await ElMessageBox.confirm(
      `确定要删除工作组「${ws.name}」吗？其 ${childCount} 个子工作组及全部 ${tabCount} 个标签页将一并删除，且不可恢复。`,
      '删除工作组',
      { type: 'warning' },
    )
  } catch {
    return
  }

  const res = await sendMessage({ action: 'DELETE_WORKSPACE', payload: { id: ws.id } })
  if (res.success) {
    ElMessage.success('工作组已删除')
    if (selectedId.value === ws.id) selectedId.value = ''
    await loadWorkspaces()
  } else {
    ElMessage.error(res.error || '删除失败')
  }
}

async function handleOpenWorkspace(id: string, newWindow: boolean) {
  const res = await sendMessage<{ opened: number }>({
    action: 'OPEN_WORKSPACE',
    payload: { id, newWindow },
  })
  if (res.success) ElMessage.success(`已打开 ${res.data?.opened ?? 0} 个标签页`)
  else ElMessage.error(res.error || '打开失败')
}

async function handleOpenAsTabGroup(id: string) {
  const res = await sendMessage<{ opened: number }>({
    action: 'OPEN_WORKSPACE',
    payload: { id, asTabGroup: true },
  })
  if (res.success) ElMessage.success(`已打开 ${res.data?.opened ?? 0} 个标签页并归入标签组`)
  else ElMessage.error(res.error || '打开失败')
}

async function openSingleTab(url: string) {
  await openTabAfterActive(url)
}

async function handleRemoveTab(workspaceId: string, tabId: string) {
  const res = await sendMessage({
    action: 'REMOVE_WORKSPACE_TAB',
    payload: { workspaceId, tabId },
  })
  if (res.success) {
    ElMessage.success('标签页已从工作组移除')
    await loadWorkspaces()
  } else {
    ElMessage.error(res.error || '移除失败')
  }
}

// ============ 修改添加时间 ============

const timeDialogVisible = ref(false)
const timeSaving = ref(false)
const timeValue = ref<Date | null>(null)
const timeTarget = ref<{ workspaceId: string; tabId: string } | null>(null)

// 重命名标签页
const renameDialogVisible = ref(false)
const renameSaving = ref(false)
const renameValue = ref('')
const renameTarget = ref<{ workspaceId: string; tabId: string } | null>(null)

/** 列表中优先展示重命名后的显示名，否则回退到原始标题 */
function displayTitle(tab: TabReference): string {
  return tab.displayName || tab.title || '(无标题)'
}

/** 列表内展示：如 07-28 或 2025-12-31 */
function formatAddedAt(addedAt: string): string {
  if (!addedAt) return ''
  const d = new Date(addedAt)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}-${md}`
}

/** 悬浮提示：完整日期时间 */
function formatAddedAtFull(addedAt: string): string {
  if (!addedAt) return '未知'
  const d = new Date(addedAt)
  if (isNaN(d.getTime())) return '未知'
  return d.toLocaleString()
}

function openEditTimeDialog(workspaceId: string, tab: TabReference) {
  timeTarget.value = { workspaceId, tabId: tab.tabId }
  const d = new Date(tab.addedAt)
  timeValue.value = isNaN(d.getTime()) ? new Date() : d
  timeDialogVisible.value = true
}

async function handleSaveAddedTime() {
  const target = timeTarget.value
  if (!target || !timeValue.value) return
  timeSaving.value = true
  const res = await sendMessage({
    action: 'UPDATE_WORKSPACE_TAB',
    payload: {
      workspaceId: target.workspaceId,
      tabId: target.tabId,
      addedAt: timeValue.value.toISOString(),
    },
  })
  timeSaving.value = false
  if (res.success) {
    ElMessage.success('添加时间已更新')
    timeDialogVisible.value = false
    await loadWorkspaces()
  } else {
    ElMessage.error(res.error || '更新失败')
  }
}

function openRenameDialog(workspaceId: string, tab: TabReference) {
  renameTarget.value = { workspaceId, tabId: tab.tabId }
  renameValue.value = tab.displayName || tab.title || ''
  renameDialogVisible.value = true
}

async function handleSaveRename() {
  const target = renameTarget.value
  if (!target) return
  // 允许留空以清除重命名，恢复使用原始标题
  const name = renameValue.value.trim()
  renameSaving.value = true
  const res = await sendMessage({
    action: 'UPDATE_WORKSPACE_TAB',
    payload: {
      workspaceId: target.workspaceId,
      tabId: target.tabId,
      displayName: name,
    },
  })
  renameSaving.value = false
  if (res.success) {
    ElMessage.success(name ? '已重命名' : '已恢复原始标题')
    renameDialogVisible.value = false
    await loadWorkspaces()
  } else {
    ElMessage.error(res.error || '更新失败')
  }
}

/** 同组内拖拽排序 */
function onDragUpdate(evt: { newIndex: number }) {
  const ws = selectedWorkspace.value
  if (!ws) return
  const tab = ws.tabs[evt.newIndex]
  if (tab) {
    const actualIndex = ws.tabs.findIndex((t) => t.tabId === tab.tabId)
    handleMoveTab(ws.id, tab.tabId, actualIndex >= 0 ? actualIndex : evt.newIndex)
  }
}

async function handleMoveTab(targetWsId: string, tabId: string, newIndex: number) {
  try {
    const res = await sendMessage({
      action: 'MOVE_WORKSPACE_TAB',
      payload: { workspaceId: targetWsId, tabId, newIndex },
    })
    if (!res.success) await loadWorkspaces()
  } catch {
    await loadWorkspaces()
  }
}
</script>

<style scoped>
.workspaces-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.split-pane {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 480px;
}

.tree-pane {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  overflow-y: auto;
  background: #fff;
}

.detail-pane {
  flex: 1;
  min-width: 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.pane-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.pane-title {
  font-size: 13px;
  font-weight: 600;
  color: #909399;
}

.pane-title-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 将水平三个点旋转为竖排 */
.dots-vertical {
  transform: rotate(90deg);
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.tree-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-count {
  font-size: 11px;
  color: #909399;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 0 6px;
}

/* 每个工作组项旁的竖三点按钮 */
.node-dots-btn {
  margin-left: auto;
  padding: 2px 4px;
  color: #909399;
}

.node-dots-btn:hover {
  color: #606266;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ws-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.detail-actions {
  display: flex;
  gap: 4px;
}

.scope-bar {
  padding: 12px 0;
}

.detail-body {
  flex: 1;
}

.flat-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ws-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.ws-tab-item:hover {
  background-color: #f5f7fa;
}

.tab-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 2px;
}

.tab-favicon-placeholder {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  background-color: #dcdfe6;
  border-radius: 2px;
}

.tab-text {
  min-width: 0;
  flex: 1;
}

.tab-title {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.tab-title:hover {
  color: #409eff;
  text-decoration: underline;
}

.tab-url {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.tab-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tab-added {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  flex-shrink: 0;
}

.dialog-hint {
  font-size: 12px;
  color: #909399;
  padding-left: 90px;
}

.drag-handle {
  cursor: grab;
  color: #c0c4cc;
  font-size: 14px;
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
  padding: 0 2px;
  transition: color 0.15s;
}

.drag-handle:hover {
  color: #909399;
}

.drag-handle:active {
  cursor: grabbing;
}

.tab-ghost {
  opacity: 0.4;
  background: #e6f7ff;
  border: 1px dashed #409eff;
}
</style>

<!-- 下拉菜单被 teleport 到 body，需非 scoped 样式 -->
<style>
/* 下拉菜单的「删除」项：红字 */
.danger-dropdown-item {
  color: var(--el-color-danger) !important;
}

.danger-dropdown-item:hover {
  background-color: var(--el-color-danger-light-9);
}
</style>
