<template>
  <div class="tabs-view">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-select
        v-model="windowFilter"
        placeholder="全部窗口"
        clearable
        class="window-filter"
        @change="applyFilters"
      >
        <el-option label="全部窗口" value="" />
        <el-option
          v-for="w in windows"
          :key="w.id"
          :label="w.title || `窗口 ${w.id}`"
          :value="w.id"
        />
      </el-select>

      <el-input
        v-model="searchKeyword"
        placeholder="搜索标题或网址"
        clearable
        class="search-input"
        @input="applyFilters"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <div class="toolbar-spacer" />

      <el-button
        type="success"
        :icon="FolderAdd"
        :disabled="selectedTabIds.size === 0"
        @click="showCreateWorkspace"
      >创建工作组</el-button>
      <el-button :icon="Refresh" @click="refresh()">刷新</el-button>
    </div>

    <!-- 批量操作栏 -->
    <div v-if="selectedTabIds.size > 0" class="batch-bar">
      <span class="batch-count">已选 {{ selectedTabIds.size }} 个标签页</span>
      <el-button type="primary" :icon="Plus" @click="handleAddToWorkspace">加入工作组</el-button>
      <el-button type="success" :icon="FolderChecked" @click="handleFoldToDefault">收折到默认分组</el-button>
      <el-button type="success" plain :icon="FolderOpened" @click="showFoldPicker">收折到分组…</el-button>
      <el-button type="danger" :icon="Close" @click="handleCloseSelected">关闭选中</el-button>
      <el-button text @click="clearSelection">取消选择</el-button>
    </div>

    <div v-if="loading" class="empty-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>

    <div v-else-if="filteredWindows.length === 0" class="empty-state">
      <el-empty :description="searchKeyword ? '没有匹配的标签页' : '当前没有打开的标签页'" />
    </div>

    <!-- 树形：窗口 → 分组 → 标签页 -->
    <div v-else class="tree-scroll">
      <div v-for="win in filteredWindows" :key="win.id" class="tree-window">
        <div class="tree-row window-header" @click="toggleWindow(win.id)">
          <el-icon class="caret" :class="{ collapsed: !winExpanded[win.id] }"><CaretRight /></el-icon>
          <el-icon><Monitor /></el-icon>
          <span class="window-title">{{ `窗口 ${win.id}` }}</span>
          <span class="count-badge">{{ winCount(win) }}</span>
        </div>

        <div v-show="winExpanded[win.id]" class="tree-body">
          <template v-for="item in win.items" :key="itemKey(item)">
            <!-- 未分组标签页 -->
            <div v-if="item.kind === 'tab'" class="tree-row tab-row">
              <el-checkbox
                :model-value="selectedTabIds.has(item.tab.id)"
                @change="(val: any) => toggleTab(item.tab.id, val)"
                @click.stop
              />
              <LazyFavicon :favIconUrl="item.tab.favIconUrl" :size="16" class="favicon" />
              <span class="tab-title" :title="item.tab.title" @click="activateTab(item.tab)">{{ item.tab.title || item.tab.url }}</span>
              <span class="tab-url" :title="item.tab.url">{{ item.tab.url }}</span>
              <span class="tab-ws-tags">
                <el-tag
                  v-for="ws in workspacesForTab(item.tab)"
                  :key="ws.workspaceId"
                  size="small"
                  :style="{ backgroundColor: ws.workspaceColor ? mapColor(ws.workspaceColor) : '#909399', color: '#fff', cursor: 'pointer' }"
                  @click="openWorkspace(ws.workspaceId)"
                >{{ ws.workspaceName }}</el-tag>
              </span>
              <el-button class="row-action" text :icon="Close" @click="closeTab(item.tab)" />
            </div>

            <!-- 标签分组（按真实顺序出现在首个标签页位置） -->
            <div v-else class="tree-group">
              <div class="tree-row group-header" @click="toggleGroup(item.group.id)">
                <el-icon class="caret" :class="{ collapsed: !groupExpanded[item.group.id] }"><CaretRight /></el-icon>
                <span class="group-dot" :style="{ backgroundColor: item.group.color ? mapColor(item.group.color) : '#909399' }" />
                <span class="group-title">{{ item.group.title || '未命名分组' }}</span>
                <span class="count-badge">{{ item.group.tabs.length }}</span>
              </div>

              <div v-show="groupExpanded[item.group.id]" class="tree-body">
                <div v-for="tab in item.group.tabs" :key="'t' + tab.id" class="tree-row tab-row">
                  <el-checkbox
                    :model-value="selectedTabIds.has(tab.id)"
                    @change="(val: any) => toggleTab(tab.id, val)"
                    @click.stop
                  />
                  <LazyFavicon :favIconUrl="tab.favIconUrl" :size="16" class="favicon" />
                  <span class="tab-title" :title="tab.title" @click="activateTab(tab)">{{ tab.title || tab.url }}</span>
                  <span class="tab-url" :title="tab.url">{{ tab.url }}</span>
                  <span class="tab-ws-tags">
                    <el-tag
                      v-for="ws in workspacesForTab(tab)"
                      :key="ws.workspaceId"
                      size="small"
                      :style="{ backgroundColor: ws.workspaceColor ? mapColor(ws.workspaceColor) : '#909399', color: '#fff', cursor: 'pointer' }"
                      @click="openWorkspace(ws.workspaceId)"
                    >{{ ws.workspaceName }}</el-tag>
                  </span>
                  <el-button class="row-action" text :icon="Close" @click="closeTab(tab)" />
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 加入工作组选择器 -->
    <WorkspacePickerDialog
      v-model="pickerVisible"
      :title="pickerMode === 'fold' ? '收折到工作组' : '加入工作组'"
      @select="handlePickerSelect"
    />

    <!-- 创建工作组对话框 -->
    <el-dialog
      v-model="createWorkspaceDialogVisible"
      title="创建工作组"
      width="420px"
      @closed="resetNewWorkspace"
    >
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="newWorkspace.name" placeholder="例如：前端调研" maxlength="50" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="newWorkspace.icon" placeholder="可选，如 📚" maxlength="4" style="max-width: 160px;" />
        </el-form-item>
        <el-form-item label="颜色">
          <div class="color-palette">
            <span
              v-for="c in colorPalette"
              :key="c"
              class="color-dot"
              :class="{ active: newWorkspace.color === c }"
              :style="{ backgroundColor: c }"
              @click="newWorkspace.color = c"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createWorkspaceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateWorkspace">创建并加入选中标签页</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Close, Loading, CaretRight, Monitor, FolderAdd, Plus, FolderChecked, FolderOpened } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'
import LazyFavicon from '@/shared/components/LazyFavicon.vue'
import type { WorkspaceTreeNode } from '@/shared/utils/workspace-tree'
import type { WorkspaceTabsSummaryData, WorkspacesData } from '@/shared/types'

interface TreeTab {
  id: number
  title: string
  url: string
  favIconUrl?: string
  windowId: number
}

interface TreeGroup {
  id: number
  title: string
  color?: string
  tabs: TreeTab[]
}

// 窗口内的有序节点：未分组标签页与分组按真实顺序排列
type TreeItem =
  | { kind: 'tab'; tab: TreeTab }
  | { kind: 'group'; group: TreeGroup }

interface TreeWindow {
  id: number
  title: string
  items: TreeItem[]
}

const loading = ref(false)
const windows = ref<TreeWindow[]>([])
const searchKeyword = ref('')
const windowFilter = ref<number | ''>('')
const filteredWindows = ref<TreeWindow[]>([])
const winExpanded = reactive<Record<number, boolean>>({})
const groupExpanded = reactive<Record<number, boolean>>({})
const selectedTabIds = reactive(new Set<number>())
const pickerVisible = ref(false)
const createWorkspaceDialogVisible = ref(false)
const newWorkspace = reactive({ name: '', color: '#409EFF', icon: '' })
const colorPalette = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#9B59B6', '#16A085', '#E84393']
const workspacesSummary = ref<WorkspaceTabsSummaryData['summaries']>([])

// 按 URL 建立「该标签页所属工作组」索引，用于在树中展示标签并支持点击跳转
const urlToWorkspaces = computed<Record<string, Array<{ workspaceId: string; workspaceName: string; workspaceColor: string }>>>(() => {
  const map: Record<string, Array<{ workspaceId: string; workspaceName: string; workspaceColor: string }>> = {}
  for (const s of workspacesSummary.value) {
    for (const t of s.tabs) {
      ;(map[t.url] ||= []).push({
        workspaceId: s.workspaceId,
        workspaceName: s.workspaceName,
        workspaceColor: s.workspaceColor,
      })
    }
  }
  return map
})

function workspacesForTab(tab: TreeTab) {
  return urlToWorkspaces.value[tab.url] || []
}

const router = useRouter()
function openWorkspace(_id: string) {
  router.push('/workspaces')
}

function resetNewWorkspace() {
  newWorkspace.name = ''
  newWorkspace.icon = ''
  newWorkspace.color = '#409EFF'
}

function showCreateWorkspace() {
  if (selectedTabIds.size === 0) {
    ElMessage.warning('请先选择标签页')
    return
  }
  resetNewWorkspace()
  createWorkspaceDialogVisible.value = true
}

async function loadWorkspaceSummary() {
  try {
    const res = await sendMessage({ action: 'GET_WORKSPACE_TABS_SUMMARY' })
    if (res.success && res.data) {
      workspacesSummary.value = (res.data as WorkspaceTabsSummaryData).summaries
    }
  } catch {
    /* 忽略：未登录或后端不可用时无需展示标签 */
  }
}

function mapColor(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`
}

function winCount(win: TreeWindow): number {
  return win.items.reduce(
    (sum, item) => sum + (item.kind === 'group' ? item.group.tabs.length : 1),
    0,
  )
}

function itemKey(item: TreeItem): string {
  return item.kind === 'tab' ? 't' + item.tab.id : 'g' + item.group.id
}

function toggleWindow(id: number) {
  winExpanded[id] = !winExpanded[id]
}

function toggleGroup(id: number) {
  groupExpanded[id] = !groupExpanded[id]
}

function toggleTab(id: number, val: boolean) {
  if (val) selectedTabIds.add(id)
  else selectedTabIds.delete(id)
}

function clearSelection() {
  selectedTabIds.clear()
}

async function refresh(showLoading = true) {
  if (showLoading) loading.value = true
  try {
    const chromeWindows = await chrome.windows.getAll({ populate: true })
    const result: TreeWindow[] = []
    for (const win of chromeWindows) {
      if (win.type !== 'normal') continue
      const winTabs: chrome.tabs.Tab[] = win.tabs || []
      const groupsMap = new Map<number, TreeGroup>()
      const winItems: TreeItem[] = []
      let currentGroupId = 0
      for (const t of winTabs) {
        if (t.id == null || !t.url) continue
        const tab: TreeTab = {
          id: t.id,
          title: t.title || t.url,
          url: t.url,
          favIconUrl: t.favIconUrl,
          windowId: win.id!,
        }
        const gid = t.groupId && t.groupId > 0 ? t.groupId : 0
        if (gid > 0) {
          // 在真实顺序中，分组作为一个整体出现在它首个标签页所在位置
          if (gid !== currentGroupId) {
            let g = groupsMap.get(gid)
            if (!g) {
              g = { id: gid, title: '', color: undefined, tabs: [] }
              groupsMap.set(gid, g)
            }
            winItems.push({ kind: 'group', group: g })
            currentGroupId = gid
          }
          groupsMap.get(gid)!.tabs.push(tab)
        } else {
          currentGroupId = 0
          winItems.push({ kind: 'tab', tab })
        }
      }
      // 补全分组标题/颜色
      for (const [gid, g] of groupsMap) {
        try {
          const info = await chrome.tabGroups.get(gid)
          g.title = info.title || ''
          g.color = info.color
        } catch {
          /* 分组可能已不存在 */
        }
      }
      result.push({
        id: win.id!,
        title: '',
        items: winItems,
      })
      if (!(win.id! in winExpanded)) winExpanded[win.id!] = true
    }
    windows.value = result
    applyFilters()
    void loadWorkspaceSummary()
  } catch (e) {
    ElMessage.error('加载本地标签页失败：' + (e as Error).message)
  } finally {
    if (showLoading) loading.value = false
  }
}

function applyFilters() {
  const kw = searchKeyword.value.trim().toLowerCase()
  const wf = windowFilter.value
  const matchTab = (t: TreeTab) =>
    !kw || t.title.toLowerCase().includes(kw) || t.url.toLowerCase().includes(kw)
  filteredWindows.value = windows.value
    .filter((w) => (wf === '' ? true : w.id === wf))
    .map((w) => {
      const items = w.items
        .map((item): TreeItem | null => {
          if (item.kind === 'tab') {
            return matchTab(item.tab) ? item : null
          }
          const tabs = item.group.tabs.filter(matchTab)
          return tabs.length > 0 ? { kind: 'group', group: { ...item.group, tabs } } : null
        })
        .filter((x): x is TreeItem => x !== null)
      return { ...w, items }
    })
    .filter((w) => w.items.length > 0)
}

async function activateTab(tab: TreeTab) {
  try {
    await chrome.tabs.update(tab.id, { active: true })
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }
  } catch {
    /* 忽略 */
  }
}

async function closeTab(tab: TreeTab) {
  try {
    await chrome.tabs.remove(tab.id)
    selectedTabIds.delete(tab.id)
    await refresh()
  } catch {
    /* 忽略 */
  }
}

async function handleCloseSelected() {
  const ids = Array.from(selectedTabIds)
  if (ids.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定要关闭选中的 ${ids.length} 个标签页吗？`,
      '批量关闭',
      { confirmButtonText: '关闭', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await chrome.tabs.remove(ids)
    clearSelection()
    await refresh()
  } catch {
    /* 忽略 */
  }
}

async function handleCreateWorkspace() {
  if (selectedTabIds.size === 0) {
    ElMessage.warning('请先选择标签页')
    return
  }
  if (!newWorkspace.name.trim()) {
    ElMessage.warning('请填写工作组名称')
    return
  }
  const ids = Array.from(selectedTabIds)
  const allTabs: chrome.tabs.Tab[] = []
  for (const id of ids) {
    try {
      const t = await chrome.tabs.get(id)
      allTabs.push(t)
    } catch {
      /* 标签页可能已关闭，忽略 */
    }
  }
  const payloadTabs = allTabs.map((t) => ({
    url: t.url || '',
    title: t.title || t.url || '',
    favIconUrl: t.favIconUrl || '',
    chromeTabId: t.id || 0,
  }))
  try {
    const res = await sendMessage({
      action: 'CREATE_WORKSPACE',
      payload: { name: newWorkspace.name.trim(), color: newWorkspace.color, icon: newWorkspace.icon || undefined },
    })
    if (!res.success) {
      ElMessage.error(res.error || '创建工作组失败')
      return
    }
    const created = (res.data as { workspace: { id: string } } | undefined)?.workspace
    if (!created) {
      ElMessage.error('创建工作组建失败：未返回工作组信息')
      return
    }
    const updateRes = await sendMessage({
      action: 'UPDATE_WORKSPACE',
      payload: { id: created.id, tabs: payloadTabs },
    })
    if (updateRes.success) {
      ElMessage.success(`已创建工作组「${newWorkspace.name.trim()}」并加入 ${payloadTabs.length} 个标签页`)
      createWorkspaceDialogVisible.value = false
      clearSelection()
      void loadWorkspaceSummary()
    } else if (updateRes.authError) {
      ElMessage.warning('工作组已创建，但添加标签页需要登录后端')
    } else {
      ElMessage.error(updateRes.error || '已创建工作组建但添加标签页失败')
    }
  } catch (e) {
    ElMessage.error('创建工作组失败：' + (e as Error).message)
  }
}

const pickerMode = ref<'add' | 'fold'>('add')

async function collectSelectedTabs(): Promise<chrome.tabs.Tab[]> {
  const ids = Array.from(selectedTabIds)
  const all: chrome.tabs.Tab[] = []
  for (const id of ids) {
    try {
      const t = await chrome.tabs.get(id)
      all.push(t)
    } catch {
      /* 标签页可能已关闭 */
    }
  }
  return all
}

function handleAddToWorkspace() {
  if (selectedTabIds.size === 0) {
    ElMessage.warning('请先选择标签页')
    return
  }
  pickerMode.value = 'add'
  pickerVisible.value = true
}

function showFoldPicker() {
  if (selectedTabIds.size === 0) {
    ElMessage.warning('请先选择标签页')
    return
  }
  pickerMode.value = 'fold'
  pickerVisible.value = true
}

async function handlePickerSelect(node: WorkspaceTreeNode) {
  if (pickerMode.value === 'fold') {
    await foldToWorkspace(node.id, node.name)
  } else {
    await addToWorkspace(node.id, node.name)
  }
}

async function addToWorkspace(workspaceId: string, workspaceName: string) {
  const allTabs = await collectSelectedTabs()
  if (allTabs.length === 0) return
  const payloadTabs = allTabs.map((t) => ({
    url: t.url || '',
    title: t.title || t.url || '',
    favIconUrl: t.favIconUrl || '',
    chromeTabId: t.id || 0,
  }))
  try {
    const res = await sendMessage({ action: 'ADD_TABS_TO_WORKSPACE', payload: { workspaceId, tabs: payloadTabs } })
    if (res.success) {
      const added = (res.data as { added?: number } | undefined)?.added ?? payloadTabs.length
      ElMessage.success(`已加入「${workspaceName}」：${added} 个新标签页`)
      clearSelection()
      void loadWorkspaceSummary()
    } else if (res.authError) {
      ElMessage.warning('未连接到后端，无法加入工作组')
    } else {
      ElMessage.error(res.error || '加入工作组失败')
    }
  } catch (e) {
    ElMessage.error('加入工作组失败：' + (e as Error).message)
  }
}

// 收折：加入工作组后立即关闭本地标签页
async function foldToWorkspace(workspaceId: string, workspaceName: string) {
  const ids = Array.from(selectedTabIds)
  if (ids.length === 0) return
  const allTabs = await collectSelectedTabs()
  if (allTabs.length === 0) {
    ElMessage.warning('所选标签页已关闭')
    return
  }
  const payloadTabs = allTabs.map((t) => ({
    url: t.url || '',
    title: t.title || t.url || '',
    favIconUrl: t.favIconUrl || '',
    chromeTabId: t.id || 0,
  }))
  try {
    const res = await sendMessage({ action: 'ADD_TABS_TO_WORKSPACE', payload: { workspaceId, tabs: payloadTabs } })
    if (res.authError) {
      ElMessage.warning('收折失败：未连接到后端')
      return
    }
    if (!res.success) {
      ElMessage.error(res.error || '收折失败')
      return
    }
    await chrome.tabs.remove(ids).catch(() => {})
    ElMessage.success(`已收折 ${payloadTabs.length} 个标签页到「${workspaceName}」`)
    clearSelection()
    void loadWorkspaceSummary()
  } catch (e) {
    ElMessage.error('收折失败：' + (e as Error).message)
  }
}

// 收折到默认分组：取列表首个工作组；无则自动创建「默认」
async function handleFoldToDefault() {
  if (selectedTabIds.size === 0) {
    ElMessage.warning('请先选择标签页')
    return
  }
  const target = await getDefaultWorkspace()
  if (!target) return
  await foldToWorkspace(target.id, target.name)
}

async function getDefaultWorkspace(): Promise<{ id: string; name: string } | null> {
  try {
    const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES' })
    if (res.success && res.data && res.data.workspaces.length > 0) {
      const ws = res.data.workspaces[0]
      return { id: ws.id, name: ws.name }
    }
  } catch {
    /* 忽略，走自动创建分支 */
  }
  const createRes = await sendMessage({
    action: 'CREATE_WORKSPACE',
    payload: { name: '默认', color: '#409EFF' },
  })
  if (!createRes.success || !createRes.data) {
    ElMessage.warning('尚未创建工作组，且自动创建失败')
    return null
  }
  const ws = (createRes.data as { workspace: { id: string; name: string } }).workspace
  return { id: ws.id, name: ws.name }
}

// 事件驱动刷新：仅在标签页/窗口/分组真正变化时才静默更新，避免固定轮询造成的频繁刷新
let refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => refresh(false), 150)
}

const listeners: Array<() => void> = []
function registerListeners() {
  const add = (
    ev?: { addListener: (cb: (...args: any[]) => void) => void; removeListener: (cb: (...args: any[]) => void) => void },
  ) => {
    if (!ev) return
    const cb = () => scheduleRefresh()
    ev.addListener(cb)
    listeners.push(() => ev.removeListener(cb))
  }

  add(chrome.tabs.onCreated)
  add(chrome.tabs.onRemoved)
  add(chrome.tabs.onUpdated)
  add(chrome.tabs.onMoved)
  add(chrome.tabs.onAttached)
  add(chrome.tabs.onDetached)
  add(chrome.tabs.onReplaced)
  add(chrome.tabGroups?.onCreated)
  add(chrome.tabGroups?.onUpdated)
  add(chrome.tabGroups?.onRemoved)
  add(chrome.windows.onCreated)
  add(chrome.windows.onRemoved)
  add(chrome.windows.onFocusChanged)
}

onMounted(() => {
  refresh()
  registerListeners()
})
onUnmounted(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  for (const off of listeners) off()
})
</script>

<style scoped>
.tabs-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.window-filter {
  width: 200px;
}
.search-input {
  width: 280px;
}
.toolbar-spacer {
  flex: 1;
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
}
.batch-count {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
}
.tree-scroll {
  flex: 1;
  overflow-y: auto;
}
.tree-window {
  margin-bottom: 8px;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.tree-row:hover {
  background: var(--el-fill-color-light);
}
.window-header {
  font-weight: 600;
  cursor: pointer;
  background: var(--el-fill-color-lighter);
}
.window-title {
  flex: 1;
}
.caret {
  transition: transform 0.2s;
}
.caret.collapsed {
  transform: rotate(0deg);
}
.caret:not(.collapsed) {
  transform: rotate(90deg);
}
.tree-body {
  padding-left: 16px;
}
.group-header {
  cursor: pointer;
}
.group-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.group-title {
  flex: 1;
}
.tab-row {
  cursor: default;
}
.tab-title {
  cursor: pointer;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-color-primary);
}
.tab-title:hover {
  text-decoration: underline;
}
.tab-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.favicon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
}
.count-badge {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  border-radius: 10px;
  padding: 0 8px;
}
.row-action {
  margin-left: auto;
}
.tab-ws-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
  overflow: hidden;
}
.tab-ws-tags .el-tag {
  flex: 0 0 auto;
  line-height: 18px;
}
.color-palette {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  box-sizing: border-box;
}
.color-dot.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}
</style>
