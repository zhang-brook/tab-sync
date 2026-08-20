<template>
  <div class="workspaces-view">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input v-model="searchKeyword" placeholder="搜索工作组..." clearable style="width: 220px" :prefix-icon="Search" />
      </div>
      <div class="toolbar-right">
        <el-button @click="loadWorkspaces" :icon="Refresh">
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
                <el-icon>
                  <Plus />
                </el-icon>
                <span>新建</span>
              </el-button>
            </el-tooltip>
          </div>
        </div>
        <el-empty v-if="treeData.length === 0 && !loading" :image-size="60" description="暂无工作组" />
        <el-tree v-else ref="treeRef" :data="treeData" node-key="id" :props="treeProps" :filter-node-method="filterNode"
          :expand-on-click-node="false" highlight-current default-expand-all @node-click="onSelectNode">
          <template #default="{ data }">
            <ContextMenu @command="(cmd: string) => onNodeMenuCommand(cmd, data)" @open="() => onNodeContextMenu(data)">
              <span class="tree-node">
                <span class="tree-dot" :style="{ backgroundColor: data.color }" />
                <span class="tree-name" :title="data.name">{{ data.name }}</span>
                <span v-if="data.id === defaultWorkspaceId" class="tree-default">(默认)</span>
                <span v-if="data.tabCount" class="tree-count">{{ data.tabCount }}</span>
                <el-dropdown trigger="click" @command="(cmd: string) => onNodeMenuCommand(cmd, data)" @click.stop>
                  <el-button size="small" text class="node-dots-btn" @click.stop>
                    <el-icon class="dots-vertical">
                      <MoreFilled />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <NodeDropdownMenu :data="data" :default-workspace-id="defaultWorkspaceId" />
                  </template>
                </el-dropdown>
              </span>
              <template #menu>
                <NodeDropdownMenu :data="data" :default-workspace-id="defaultWorkspaceId" />
              </template>
            </ContextMenu>
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
              <el-tag v-for="tg in (selectedWorkspace.tags ?? [])" :key="tg.id" size="small" effect="plain"
                :style="tg.color ? { color: tg.color, borderColor: tg.color } : {}">{{ tg.name }}</el-tag>
              <el-tag size="small" type="info">{{ rightTabs.length }} 个标签页</el-tag>
            </div>
            <div class="detail-actions">
              <el-tooltip content="工作组标签" placement="top">
                <el-button size="small" text @click="openWorkspaceTagEditor(selectedWorkspace)">
                  <el-icon>
                    <PriceTag />
                  </el-icon>
                  <span>标签</span>
                </el-button>
              </el-tooltip>
              <el-tooltip content="打开所有标签页" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenWorkspace(selectedWorkspace.id, false)">
                  <el-icon>
                    <FolderOpened />
                  </el-icon>
                  <span>打开</span>
                </el-button>
              </el-tooltip>
              <el-tooltip content="在新窗口中打开" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenWorkspace(selectedWorkspace.id, true)">
                  <el-icon>
                    <CopyDocument />
                  </el-icon>
                  <span>打开(新窗口)</span>
                </el-button>
              </el-tooltip>
              <el-tooltip content="打开为标签组" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenAsTabGroup(selectedWorkspace.id)">
                  <el-icon>
                    <Collection />
                  </el-icon>
                  <span>打开(标签组)</span>
                </el-button>
              </el-tooltip>
              <el-tooltip content="新建子工作组" placement="top">
                <el-button size="small" text @click="showCreateDialog(selectedWorkspace.id)">
                  <el-icon>
                    <FolderAdd />
                  </el-icon>
                  <span>建子组</span>
                </el-button>
              </el-tooltip>
              <el-tooltip content="编辑" placement="top">
                <el-button size="small" text :disabled="selectedWorkspace?.isSystem"
                  @click="showEditDialog(selectedWorkspace)">
                  <el-icon>
                    <Edit />
                  </el-icon>
                  <span>编辑组</span>
                </el-button>
              </el-tooltip>
              <el-tooltip :content="selectedWorkspace?.isSystem ? '系统分组不可删除' : (selectedWorkspace?.id === defaultWorkspaceId ? '默认分组不可删除' : '删除')" placement="top">
                <el-button size="small" text type="danger" :disabled="selectedWorkspace?.isSystem || selectedWorkspace?.id === defaultWorkspaceId"
                  @click="handleDelete(selectedWorkspace)">
                  <el-icon>
                    <Delete />
                  </el-icon>
                  <span>删除组</span>
                </el-button>
              </el-tooltip>
              <el-tooltip content="通过 URL 添加标签页" placement="top">
                <el-button size="small" text type="primary" @click="addUrlDialogVisible = true">
                  <el-icon>
                    <Plus />
                  </el-icon>
                  <span>加网址</span>
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <!-- 工作组描述（仅在填写后展示） -->
          <div v-if="selectedWorkspace.description" class="ws-description">
            <el-icon class="ws-description-icon">
              <Memo />
            </el-icon>
            <p class="ws-description-text">{{ selectedWorkspace.description }}</p>
          </div>

          <!-- 层级范围切换 -->
          <div class="scope-bar">
            <el-radio-group v-model="tabScope" size="small">
              <el-radio-button value="current">仅本层级</el-radio-button>
              <el-radio-button value="all">包含子工作组</el-radio-button>
            </el-radio-group>
            <el-select v-model="tagFilter" placeholder="按标签筛选" clearable size="small"
              style="width: 160px; margin-left: 12px">
              <el-option v-for="t in allTabTags" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </div>

          <!-- 标签页列表（仅本层级支持拖拽排序；包含子工作组时只读并带来源徽标） -->
          <div class="detail-body">
            <el-empty v-if="rightTabs.length === 0" :image-size="60"
              :description="tagFilter != null ? '没有匹配筛选条件的标签页' : '工作组内暂无标签页'" />

            <TabList v-else :items="tabListItems" :sortable="tabScope === 'current' && tagFilter == null"
              @sort="onTabSort" @click="(item: any) => openSingleTab(item.tab.url)"
              @command="(cmd: string, item: any) => onTabMenuCommand(cmd, item.workspaceId, item.tab)">
              <template #extra="{ item }">
                <div v-if="(item as any).tab.tags && (item as any).tab.tags.length" class="tab-tags">
                  <el-tag v-for="tg in (item as any).tab.tags" :key="tg.id" size="small" effect="plain"
                    :style="tg.color ? { color: tg.color, borderColor: tg.color } : {}">{{ tg.name }}</el-tag>
                </div>
                <span class="tab-added" :title="'添加于 ' + formatAddedAtFull((item as any).tab.addedAt)">{{
                  formatAddedAt((item as any).tab.addedAt) }}</span>
              </template>
              <template #context-menu>
                <TabDropdownMenu />
              </template>
              <template #actions="{ item }">
                <el-dropdown trigger="click"
                  @command="(cmd: string) => onTabMenuCommand(cmd, (item as any).workspaceId, (item as any).tab)"
                  @click.stop>
                  <el-button size="small" text class="tab-more-btn" @click.stop>
                    <el-icon class="dots-vertical">
                      <MoreFilled />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <TabDropdownMenu />
                  </template>
                </el-dropdown>
              </template>
            </TabList>
          </div>
        </template>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEditing ? '编辑工作组' : '新建工作组'" width="600px" destroy-on-close>
      <el-form label-width="90px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="formData.name" placeholder="例如: 项目A开发" />
        </el-form-item>
        <el-form-item label="父工作组">
          <div class="parent-picker">
            <el-button @click="parentPickerVisible = true">
              {{ parentWorkspaceName || '选择父工作组（不选则为根级）' }}
            </el-button>
            <el-button v-if="formData.parentId" text type="danger" @click="clearParent">
              清除
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="标识色">
          <el-color-picker v-model="formData.color" color-format="hex" :predefine="presetColors"
            @active-change="onColorActiveChange" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="formData.description" type="textarea" :rows="3" maxlength="500" show-word-limit
            placeholder="为该工作组填写一段描述（选填）" />
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
    <el-dialog v-model="timeDialogVisible" title="修改添加时间" width="450px" destroy-on-close>
      <el-form label-width="90px" label-position="left">
        <el-form-item label="添加时间">
          <div style="display: flex; align-items: center; gap: 8px; width: 100%">
            <el-date-picker v-model="timeValue" type="datetime" placeholder="选择日期时间" :clearable="false"
              style="flex: 1;" />
            <el-link type="primary" :underline="false" @click="setTimeToNow" style="margin-left: 15px; margin-right: 10px;">
              设为当前时间
            </el-link>
          </div>
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
          <el-input v-model="renameValue" placeholder="输入新的显示名称（留空则恢复原始标题）" maxlength="500" show-word-limit clearable
            @keyup.enter="handleSaveRename" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="renameSaving" @click="handleSaveRename">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑链接对话框 -->
    <el-dialog v-model="editUrlDialogVisible" title="编辑标题/链接" width="520px" destroy-on-close>
      <el-form label-width="70px" label-position="left">
        <el-form-item label="标题" required>
          <el-input v-model="editUrlTitleValue" placeholder="留空则使用链接作为标题" maxlength="500" show-word-limit clearable
            @keyup.enter="handleSaveEditUrl" />
        </el-form-item>
        <el-form-item label="链接" required>
          <el-input v-model="editUrlValue" placeholder="https://example.com" clearable @keyup.enter="handleSaveEditUrl">
            <template #prepend>
              <el-icon>
                <Link />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editUrlDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editUrlSaving" :disabled="!editUrlValue.trim()" @click="handleSaveEditUrl">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑描述对话框 -->
    <el-dialog v-model="editDescDialogVisible" title="编辑描述" width="520px" destroy-on-close>
      <el-form label-width="70px" label-position="left">
        <el-form-item label="描述">
          <el-input v-model="editDescValue" type="textarea" :rows="4" maxlength="500" show-word-limit
            placeholder="可选，仅当你填写时才会保存；清空则移除描述" clearable @keyup.ctrl.enter="handleSaveEditDesc" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDescDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editDescSaving" @click="handleSaveEditDesc">保存</el-button>
      </template>
    </el-dialog>

    <!-- 标签编辑对话框 -->
    <TagEditorDialog v-model="tagEditorVisible" :scope="tagEditorScope" :selected-ids="tagEditorSelectedIds"
      @confirm="onTagEditorConfirm" />

    <!-- 移动到其他工作组 -->
    <WorkspacePickerDialog v-model="movePickerVisible" title="移动到工作组" :disabled-ids="moveDisabledIds"
      @select="handleMoveToWorkspace" />

    <!-- 选择父工作组 -->
    <WorkspacePickerDialog v-model="parentPickerVisible" title="选择父工作组" :disabled-ids="parentDisabledIds"
      @select="onSelectParent" />

    <!-- 通过 URL 添加标签页 -->
    <el-dialog v-model="addUrlDialogVisible" title="通过 URL 添加标签页" width="500px" destroy-on-close>
      <el-form label-width="70px" label-position="left">
        <el-form-item label="URL" required>
          <el-input v-model="newTabUrl" placeholder="https://example.com" clearable @keyup.enter="handleAddTabByUrl">
            <template #prepend>
              <el-icon>
                <Link />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>
      </el-form>
      <div class="add-url-dialog-hint">
        标签页将添加到当前选中的工作组「{{ selectedWorkspace?.name }}」
      </div>
      <template #footer>
        <el-button @click="addUrlDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="addingByUrl" :disabled="!newTabUrl.trim()" @click="handleAddTabByUrl">
          添加
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import ContextMenu from '@/shared/components/ContextMenu.vue'
import TabList, { type TabListItem, type TabListSortEvent } from '@/shared/components/TabList.vue'
import NodeDropdownMenu from '../components/NodeDropdownMenu.vue'
import TabDropdownMenu from '../components/TabDropdownMenu.vue'
import { Search, Plus, Refresh, FolderOpened, CopyDocument, Collection, Edit, Delete, FolderAdd, MoreFilled, PriceTag, Link, Memo } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { sendMessage } from '@/shared/composables/useMessage'
import { useWorkspaceActions } from '@/shared/composables/useWorkspaceActions'
import { storage, STORAGE_KEYS } from '@/shared/storage'
import { buildWorkspaceTree, collectDescendantIds, type WorkspaceTreeNode } from '@/shared/utils/workspace-tree'
import { openTabAfterActive } from '@/shared/utils/tab-utils'
import type { Workspace, WorkspacesData, TabReference, TagInfo, TagsData } from '@/shared/types'
import TagEditorDialog from '../components/TagEditorDialog.vue'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'

const workspaces = ref<Workspace[]>([])
const loading = ref(true)
const searchKeyword = ref('')
const selectedId = ref('')
const tabScope = ref<'current' | 'all'>('current')

// URL 输入添加标签页
const addUrlDialogVisible = ref(false)
const newTabUrl = ref('')
const addingByUrl = ref(false)

// 标签相关状态
const tagFilter = ref<number | null>(null)
const allTabTags = ref<TagInfo[]>([])
const tagEditorVisible = ref(false)
const tagEditorScope = ref<'tab' | 'workspace'>('tab')
const tagEditorSelectedIds = ref<number[]>([])
const tagEditorTarget = ref<{ workspaceId: string; tabId?: string } | null>(null)

const treeRef = ref()
const treeProps = { label: 'name', children: 'children' }

// 快捷键「加入并关闭」的默认收藏分组 ID（本地存储）；空值回退到「未分组」
// 「未分组」系统工作组的固定标识（见 background/index.ts UNGROUPED_WORKSPACE_ID）
const UNGROUPED_WORKSPACE_ID = 'ungrouped'
const defaultWorkspaceId = ref('')

const { confirmDeleteWorkspace } = useWorkspaceActions()

// 对话框
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const editingId = ref('')

const formData = ref({
  name: '',
  color: '#409EFF',
  description: '',
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

/** 父工作组选择器：编辑时禁用自身及后代，避免形成环 */
const parentPickerVisible = ref(false)
const parentDisabledIds = computed<string[]>(() => {
  if (!isEditing.value || !editingId.value) return []
  return [editingId.value, ...collectDescendantIds(workspaces.value, editingId.value)]
})
const parentWorkspaceName = computed(() => {
  if (!formData.value.parentId) return ''
  return workspaces.value.find((w) => w.id === formData.value.parentId)?.name ?? ''
})
function onSelectParent(node: WorkspaceTreeNode) {
  formData.value.parentId = node.id
  parentPickerVisible.value = false
}
function clearParent() {
  formData.value.parentId = ''
}

const selectedWorkspace = computed<Workspace | null>(
  () => workspaces.value.find((w) => w.id === selectedId.value) ?? null,
)

interface RightTabItem {
  tab: TabReference
  workspaceId: string
  workspaceName: string
  workspaceColor: string
}

/** 右侧标签页列表：根据层级范围聚合，两种范围均支持按标签筛选 */
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

  let result: RightTabItem[]
  if (tabScope.value === 'current') {
    result = collect(ws)
  } else {
    const ids = [ws.id, ...collectDescendantIds(workspaces.value, ws.id)]
    result = []
    for (const id of ids) {
      const w = workspaces.value.find((x) => x.id === id)
      if (w) result.push(...collect(w))
    }
  }
  if (tagFilter.value != null) {
    return result.filter((item) => item.tab.tags?.some((t) => t.id === tagFilter.value))
  }
  return result
})

interface WsTabListItem extends TabListItem {
  tab: TabReference
  workspaceId: string
}

/** 右侧标签页列表 → 公共列表组件数据（「包含子工作组」模式下非本组标签页带来源徽标） */
const tabListItems = computed<WsTabListItem[]>(() =>
  rightTabs.value.map((it) => ({
    id: `${it.workspaceId}-${it.tab.tabId}`,
    title: displayTitle(it.tab),
    originalTitle: it.tab.displayName ? it.tab.title : undefined,
    url: it.tab.url,
    favIconUrl: it.tab.favIconUrl,
    badgeText:
      tabScope.value === 'all' && it.workspaceId !== selectedWorkspace.value?.id
        ? it.workspaceName
        : undefined,
    badgeColor:
      tabScope.value === 'all' && it.workspaceId !== selectedWorkspace.value?.id
        ? it.workspaceColor
        : undefined,
    tab: it.tab,
    workspaceId: it.workspaceId,
  })),
)

watch(searchKeyword, (val) => {
  treeRef.value?.filter(val)
})

function filterNode(value: string, data: Record<string, unknown>) {
  if (!value) return true
  return String((data as unknown as WorkspaceTreeNode).name).toLowerCase().includes(value.toLowerCase())
}

onMounted(async () => {
  void loadTabTags()
  // 先读取默认分组，保证首次加载即可选中默认分组
  await loadDefaultWorkspaceId()
  await loadWorkspaces()
})

async function loadDefaultWorkspaceId() {
  defaultWorkspaceId.value = (await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)) || UNGROUPED_WORKSPACE_ID
}

/** 是否已完成首次加载：首次加载选中默认分组，刷新/后续加载保持当前选中 */
let initialized = false

async function loadWorkspaces() {
  loading.value = true
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES', payload: { includeSystem: true } })
  if (res.success && res.data) {
    workspaces.value = res.data.workspaces
    // 首次进入页面：若设置了默认分组则选中它（刷新等后续加载保持当前选中）
    if (!initialized) {
      initialized = true
      if (defaultWorkspaceId.value && workspaces.value.some((w) => w.id === defaultWorkspaceId.value)) {
        selectedId.value = defaultWorkspaceId.value
      }
    }
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

/** 右键节点：选中该节点，由 ContextMenu 负责打开操作菜单 */
function onNodeContextMenu(data: WorkspaceTreeNode) {
  selectedId.value = data.id
  treeRef.value?.setCurrentKey(data.id)
}

/** 标签页操作菜单命令分发 */
function onTabMenuCommand(command: string, workspaceId: string, tab: TabReference) {
  switch (command) {
    case 'open':
      openSingleTab(tab.url)
      break
    case 'copyTitle':
      copyToClipboard(displayTitle(tab), '标题已复制')
      break
    case 'copyLink':
      copyToClipboard(tab.url, '链接已复制')
      break
    case 'editTime':
      openEditTimeDialog(workspaceId, tab)
      break
    case 'rename':
      openRenameDialog(workspaceId, tab)
      break
    case 'editUrl':
      openEditUrlDialog(workspaceId, tab)
      break
    case 'editDesc':
      openEditDescDialog(workspaceId, tab)
      break
    case 'tag':
      openTabTagEditor(workspaceId, tab)
      break
    case 'move':
      openMoveDialog(workspaceId, tab.tabId)
      break
    case 'remove':
      handleRemoveTab(workspaceId, tab.tabId)
      break
  }
}

/** 复制文本到剪贴板 */
async function copyToClipboard(text: string, successMsg: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successMsg)
  } catch {
    ElMessage.error('复制失败')
  }
}

/**
 * 颜色悬浮面板实时同步：面板内选色后若不点「确定」直接点旁边关闭，
 * 组件内部会 resetColor 回退到关闭前的值（等效取消），导致选色丢失。
 * 这里把面板实时预览色同步进表单，使失焦关闭等同于点「确定」；
 * 弹窗本身的「取消」不受影响，仍不会提交任何修改。
 */
function onColorActiveChange(color: string | null) {
  if (color && color !== formData.value.color) formData.value.color = color
}

function showCreateDialog(parentId: string) {
  isEditing.value = false
  editingId.value = ''
  formData.value = { name: '', color: '#409EFF', description: '', parentId }
  dialogVisible.value = true
}

function showEditDialog(ws: Workspace) {
  isEditing.value = true
  editingId.value = ws.id
  formData.value = {
    name: ws.name,
    color: ws.color,
    description: ws.description || '',
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
    case 'setDefault':
      handleSetDefaultWorkspace(ws)
      break
    case 'edit':
      showEditDialog(ws)
      break
    case 'delete':
      handleDelete(ws)
      break
  }
}

/** 设置为默认分组：写入本地存储，供「加入并关闭」等快捷操作使用 */
async function handleSetDefaultWorkspace(ws: Workspace) {
  defaultWorkspaceId.value = ws.id
  await storage.set(STORAGE_KEYS.DEFAULT_WORKSPACE_ID, ws.id)
  ElMessage.success(`已将「${ws.name}」设为默认分组`)
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
        // 清空颜色时 picker 值为 undefined，归一化为空字符串以告知后端清除颜色
        color: formData.value.color || '',
        description: formData.value.description.trim(),
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
        color: formData.value.color || '',
        description: formData.value.description.trim(),
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
  const ok = await confirmDeleteWorkspace(workspaces.value, ws, defaultWorkspaceId.value)
  if (ok) {
    if (selectedId.value === ws.id) selectedId.value = ''
    await loadWorkspaces()
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

// 编辑链接
const editUrlDialogVisible = ref(false)
const editUrlSaving = ref(false)
const editUrlValue = ref('')
const editUrlTitleValue = ref('')
const editUrlTarget = ref<{ workspaceId: string; tabId: string } | null>(null)

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

function setTimeToNow() {
  timeValue.value = new Date()
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

function openEditUrlDialog(workspaceId: string, tab: TabReference) {
  editUrlTarget.value = { workspaceId, tabId: tab.tabId }
  editUrlValue.value = tab.url
  editUrlTitleValue.value = tab.displayName || tab.title || ''
  editUrlDialogVisible.value = true
}

async function handleSaveEditUrl() {
  const target = editUrlTarget.value
  const url = editUrlValue.value.trim()
  if (!target || !url) {
    ElMessage.warning('请输入链接地址')
    return
  }
  editUrlSaving.value = true
  // 仅当用户修改了标题框（与当前显示名/标题不同）时才回写标题，
  // 否则保持服务端既有标题，避免误覆盖。
  const cur = workspaces.value
    .find((w) => w.id === target.workspaceId)
    ?.tabs.find((t) => t.tabId === target.tabId)
  const originalTitle = cur?.displayName || cur?.title || ''
  const title = editUrlTitleValue.value.trim()
  const res = await sendMessage({
    action: 'UPDATE_WORKSPACE_TAB',
    payload: {
      workspaceId: target.workspaceId,
      tabId: target.tabId,
      url,
      title: title !== originalTitle ? title : undefined,
    },
  })
  editUrlSaving.value = false
  if (res.success) {
    ElMessage.success('链接已更新')
    editUrlDialogVisible.value = false
    await loadWorkspaces()
  } else if (res.authError) {
    ElMessage.warning('未连接后端，无法更新')
  } else {
    ElMessage.error(res.error || '更新失败')
  }
}

// 编辑标签页描述
const editDescDialogVisible = ref(false)
const editDescSaving = ref(false)
const editDescValue = ref('')
const editDescTarget = ref<{ workspaceId: string; tabId: string } | null>(null)

function openEditDescDialog(workspaceId: string, tab: TabReference) {
  editDescTarget.value = { workspaceId, tabId: tab.tabId }
  editDescValue.value = tab.description || ''
  editDescDialogVisible.value = true
}

async function handleSaveEditDesc() {
  const target = editDescTarget.value
  if (!target) return
  editDescSaving.value = true
  const res = await sendMessage({
    action: 'UPDATE_WORKSPACE_TAB',
    payload: {
      workspaceId: target.workspaceId,
      tabId: target.tabId,
      description: editDescValue.value,
    },
  })
  editDescSaving.value = false
  if (res.success) {
    ElMessage.success('描述已更新')
    editDescDialogVisible.value = false
    await loadWorkspaces()
  } else if (res.authError) {
    ElMessage.warning('未连接后端，无法更新')
  } else {
    ElMessage.error(res.error || '更新失败')
  }
}

/** 同组内拖拽排序（以当前展示列表为准，映射回原数组索引） */
function onTabSort(items: TabListItem[], evt: TabListSortEvent) {
  const ws = selectedWorkspace.value
  const moved = evt.moved?.element as WsTabListItem | undefined
  if (!ws || !moved) return
  const newRelIndex = items.findIndex((i) => i.id === moved.id)
  if (newRelIndex < 0) return
  // 未筛选时本地同步展示顺序，避免依赖父数据重渲染导致拖拽后顺序回退
  if (tagFilter.value == null) {
    ws.tabs = items.map((i) => (i as WsTabListItem).tab)
  }
  // newRelIndex 为被拖拽项在新列表中的位置；服务端 MoveTab 会先移除该项再插入到
  // 剩余列表的 newIndex 处，二者语义一致，故直接以新位置作为目标索引。
  handleMoveTab(ws.id, moved.tab.tabId, newRelIndex)
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

/** 通过 URL 向当前选中工作组添加标签页 */
async function handleAddTabByUrl() {
  const url = newTabUrl.value.trim()
  if (!url || !selectedWorkspace.value) return

  addingByUrl.value = true
  const res = await sendMessage({
    action: 'ADD_WORKSPACE_TAB_BY_URL',
    payload: { workspaceId: selectedWorkspace.value.id, url },
  })
  addingByUrl.value = false

  if (res.success) {
    ElMessage.success('标签页已添加')
    newTabUrl.value = ''
    addUrlDialogVisible.value = false
    await loadWorkspaces()
  } else if (res.authError) {
    ElMessage.warning('未连接后端，无法添加')
  } else {
    ElMessage.error(res.error || '添加失败')
  }
}

// ============ 移动到其他工作组 ============

const movePickerVisible = ref(false)
const moveSource = ref<{ workspaceId: string; tabId: string } | null>(null)

/** 选择目标时仅禁用标签页当前所在工作组（未分组等仍可移动到） */
const moveDisabledIds = computed<string[]>(() => {
  return moveSource.value ? [moveSource.value.workspaceId] : []
})

function openMoveDialog(workspaceId: string, tabId: string) {
  moveSource.value = { workspaceId, tabId }
  movePickerVisible.value = true
}

async function handleMoveToWorkspace(node: WorkspaceTreeNode) {
  const src = moveSource.value
  if (!src) return
  // 追加到目标分组的最后一项（源分组已在选择器中 disabled，不会选到同组）
  const newIndex = node.workspace.tabs?.length ?? 0
  const res = await sendMessage({
    action: 'MOVE_WORKSPACE_TAB',
    payload: { workspaceId: node.id, tabId: src.tabId, newIndex },
  })
  if (res.success) {
    ElMessage.success(`已移动到「${node.name}」`)
    await loadWorkspaces()
  } else if (res.authError) {
    ElMessage.warning('未连接后端，无法移动')
  } else {
    ElMessage.error(res.error || '移动失败')
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

.tree-default {
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
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

.ws-description {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 4px;
  padding: 12px 14px;
  background: #f7f8fa;
  border: 1px solid #eceef2;
  border-radius: 10px;
}

.ws-description-icon {
  color: #909399;
  margin-top: 3px;
  font-size: 16px;
  flex-shrink: 0;
}

.ws-description-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
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

.add-url-dialog-hint {
  font-size: 12px;
  color: #909399;
  padding-left: 70px;
}

.scope-bar {
  padding: 12px 0;
}

.detail-body {
  flex: 1;
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

.parent-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 标签页项的竖三点按钮 */
.tab-more-btn {
  margin-left: auto;
  padding: 2px 4px;
  color: #909399;
  flex-shrink: 0;
}

.tab-more-btn:hover {
  color: #606266;
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
