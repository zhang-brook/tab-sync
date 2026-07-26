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

      <el-button :icon="Refresh" @click="refresh">刷新</el-button>
    </div>

    <!-- 批量操作栏 -->
    <div v-if="selectedTabIds.size > 0" class="batch-bar">
      <span class="batch-count">已选 {{ selectedTabIds.size }} 个标签页</span>
      <el-button type="primary" @click="handleAddToWorkspace">加入工作组</el-button>
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
          <!-- 未分组标签页 -->
          <div v-for="tab in win.tabs" :key="'u' + tab.id" class="tree-row tab-row">
            <el-checkbox
              :model-value="selectedTabIds.has(tab.id)"
              @change="(val: any) => toggleTab(tab.id, val)"
              @click.stop
            />
            <img v-if="tab.favIconUrl" :src="tab.favIconUrl" class="favicon" alt="" />
            <span class="tab-title" :title="tab.title" @click="activateTab(tab)">{{ tab.title || tab.url }}</span>
            <span class="tab-url" :title="tab.url">{{ tab.url }}</span>
            <el-button class="row-action" text :icon="Close" @click="closeTab(tab)" />
          </div>

          <!-- 标签分组 -->
          <div v-for="group in win.groups" :key="'g' + group.id" class="tree-group">
            <div class="tree-row group-header" @click="toggleGroup(group.id)">
              <el-icon class="caret" :class="{ collapsed: !groupExpanded[group.id] }"><CaretRight /></el-icon>
              <span class="group-dot" :style="{ backgroundColor: group.color ? mapColor(group.color) : '#909399' }" />
              <span class="group-title">{{ group.title || '未命名分组' }}</span>
              <span class="count-badge">{{ group.tabs.length }}</span>
            </div>

            <div v-show="groupExpanded[group.id]" class="tree-body">
              <div v-for="tab in group.tabs" :key="'g' + group.id + 't' + tab.id" class="tree-row tab-row">
                <el-checkbox
                  :model-value="selectedTabIds.has(tab.id)"
                  @change="(val: any) => toggleTab(tab.id, val)"
                  @click.stop
                />
                <img v-if="tab.favIconUrl" :src="tab.favIconUrl" class="favicon" alt="" />
                <span class="tab-title" :title="tab.title" @click="activateTab(tab)">{{ tab.title || tab.url }}</span>
                <span class="tab-url" :title="tab.url">{{ tab.url }}</span>
                <el-button class="row-action" text :icon="Close" @click="closeTab(tab)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加入工作组选择器 -->
    <WorkspacePickerDialog
      v-model="pickerVisible"
      title="加入工作组"
      @select="handlePickerSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Close, Loading, CaretRight, Monitor } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'
import type { WorkspaceTreeNode } from '@/shared/utils/workspace-tree'

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

interface TreeWindow {
  id: number
  title: string
  tabs: TreeTab[]
  groups: TreeGroup[]
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

function mapColor(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`
}

function winCount(win: TreeWindow): number {
  return win.tabs.length + win.groups.reduce((sum, g) => sum + g.tabs.length, 0)
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

async function refresh() {
  loading.value = true
  try {
    const chromeWindows = await chrome.windows.getAll({ populate: true })
    const result: TreeWindow[] = []
    for (const win of chromeWindows) {
      if (win.type !== 'normal') continue
        const winTabs: chrome.tabs.Tab[] = win.tabs || []
      const groupsMap = new Map<number, TreeGroup>()
      const ungrouped: TreeTab[] = []
      for (const t of winTabs) {
        if (t.id == null || !t.url) continue
        const tab: TreeTab = {
          id: t.id,
          title: t.title || t.url,
          url: t.url,
          favIconUrl: t.favIconUrl,
          windowId: win.id!,
        }
        if (t.groupId && t.groupId > 0) {
          let g = groupsMap.get(t.groupId)
          if (!g) {
            g = { id: t.groupId, title: '', color: undefined, tabs: [] }
            groupsMap.set(t.groupId, g)
          }
          g.tabs.push(tab)
        } else {
          ungrouped.push(tab)
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
        tabs: ungrouped,
        groups: Array.from(groupsMap.values()),
      })
      if (!(win.id! in winExpanded)) winExpanded[win.id!] = true
    }
    windows.value = result
    applyFilters()
  } catch (e) {
    ElMessage.error('加载本地标签页失败：' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  const kw = searchKeyword.value.trim().toLowerCase()
  const wf = windowFilter.value
  filteredWindows.value = windows.value
    .filter((w) => (wf === '' ? true : w.id === wf))
    .map((w) => {
      const matchTab = (t: TreeTab) =>
        !kw || t.title.toLowerCase().includes(kw) || t.url.toLowerCase().includes(kw)
      const tabs = w.tabs.filter(matchTab)
      const groups = w.groups
        .map((g) => ({ ...g, tabs: g.tabs.filter(matchTab) }))
        .filter((g) => g.tabs.length > 0)
      return { ...w, tabs: tabs.filter((t) => t.title || t.url), groups }
    })
    .filter((w) => w.tabs.length > 0 || w.groups.length > 0)
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
    await chrome.tabs.remove(ids)
    clearSelection()
    await refresh()
  } catch {
    /* 忽略 */
  }
}

function handleAddToWorkspace() {
  if (selectedTabIds.size === 0) {
    ElMessage.warning('请先选择标签页')
    return
  }
  pickerVisible.value = true
}

async function handlePickerSelect(node: WorkspaceTreeNode) {
  pickerVisible.value = false
  const ids = Array.from(selectedTabIds)
  const allTabs: chrome.tabs.Tab[] = []
  for (const id of ids) {
    try {
      const t = await chrome.tabs.get(id)
      allTabs.push(t)
    } catch {
      /* 忽略 */
    }
  }
  const payloadTabs = allTabs.map((t) => ({
    url: t.url || '',
    title: t.title || t.url || '',
    favIconUrl: t.favIconUrl || '',
    chromeTabId: t.id || 0,
  }))
  try {
    const res = await sendMessage({ action: 'ADD_TABS_TO_WORKSPACE', payload: {
      workspaceId: node.id,
      tabs: payloadTabs,
    } })
    if (res.success) {
      const added = (res.data as { added?: number } | undefined)?.added ?? payloadTabs.length
      ElMessage.success(`已加入「${node.name}」：${added} 个新标签页`)
      clearSelection()
    } else if (res.authError) {
      ElMessage.warning('未连接到后端，无法加入工作组')
    } else {
      ElMessage.error(res.error || '加入工作组失败')
    }
  } catch (e) {
    ElMessage.error('加入工作组失败：' + (e as Error).message)
  }
}

let refreshTimer: number | undefined
onMounted(() => {
  refresh()
  refreshTimer = window.setInterval(() => {
    refresh()
  }, 5000)
})
onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
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
</style>
