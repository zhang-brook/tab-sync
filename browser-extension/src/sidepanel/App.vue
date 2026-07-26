<template>
  <div class="sidepanel-container">
    <!-- 顶部栏 -->
    <div class="sidepanel-header">
      <h3>Tab Sync</h3>
      <div class="sp-actions">
        <el-button size="small" text @click="openDashboard">管理面板</el-button>
        <el-button size="small" text @click="openSettings">设置</el-button>
        <el-button v-if="authenticated" size="small" text type="danger" @click="logout">
          退出
        </el-button>
      </div>
    </div>

    <!-- 未登录：显示登录面板（从 popup 迁移而来） -->
    <div v-if="authLoading" class="hint-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中...</span>
    </div>
    <LoginPanel v-else-if="!authenticated" @login-success="onLoginSuccess" />

    <!-- 已登录：标签页管理 -->
    <template v-else>
      <!-- 工具栏：窗口选择 + 搜索 -->
      <div class="toolbar">
        <el-select v-model="windowFilter" size="small" class="window-select">
          <el-option label="全部窗口" value="all" />
          <el-option
            v-for="(win, idx) in windows"
            :key="win.id"
            :label="`窗口 ${idx + 1}${win.id === currentWindowId ? '（当前）' : ''}`"
            :value="win.id"
          />
        </el-select>
        <el-input
          v-model="searchKeyword"
          placeholder="搜索标签页..."
          size="small"
          clearable
          :prefix-icon="Search"
          class="search-input"
        />
      </div>

      <!-- 选择操作栏 -->
      <div v-if="selectedTabIds.size > 0" class="selection-bar">
        <span class="selection-count">已选 {{ selectedTabIds.size }} 个标签页</span>
        <div class="selection-actions">
          <el-button size="small" text @click="clearSelection">清除</el-button>
          <el-button size="small" type="primary" @click="pickerVisible = true">
            加入工作组
          </el-button>
        </div>
      </div>

      <!-- 树状列表 -->
      <div class="tree-list">
        <div v-if="loading" class="hint-state">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>加载中...</span>
        </div>

        <div v-else-if="visibleWindows.length === 0" class="hint-state">
          <span>暂无标签页</span>
        </div>

        <template v-else>
          <div v-for="win in visibleWindows" :key="win.id" class="window-node">
            <!-- 窗口标题行 -->
            <div class="window-header" @click="toggleWindow(win.id)">
              <el-icon class="expand-icon" :class="{ 'is-expanded': !collapsedWindows.has(win.id) }">
                <CaretRight />
              </el-icon>
              <el-icon class="window-icon"><Monitor /></el-icon>
              <span class="window-title">
                窗口 {{ win.order }}{{ win.id === currentWindowId ? '（当前）' : '' }}
              </span>
              <span class="node-count">{{ win.tabCount }}</span>
            </div>

            <!-- 窗口内容 -->
            <div v-show="!collapsedWindows.has(win.id)" class="window-body">
              <template v-for="item in win.items" :key="item.key">
                <!-- 标签页分组 -->
                <div v-if="item.type === 'group'" class="group-node">
                  <div class="group-header">
                    <el-checkbox
                      :model-value="groupCheckState(item).checked"
                      :indeterminate="groupCheckState(item).indeterminate"
                      @change="(v) => toggleGroup(item, Boolean(v))"
                      @click.stop
                    />
                    <el-icon
                      class="expand-icon"
                      :class="{ 'is-expanded': !collapsedGroups.has(item.groupId) }"
                      @click="toggleGroupCollapse(item.groupId)"
                    >
                      <CaretRight />
                    </el-icon>
                    <span class="group-dot" :style="{ backgroundColor: groupColorHex(item.color) }" />
                    <span class="group-title">{{ item.title || '未命名分组' }}</span>
                    <span class="node-count">{{ item.tabs.length }}</span>
                  </div>
                  <div v-show="!collapsedGroups.has(item.groupId)" class="group-body">
                    <div
                      v-for="tab in item.tabs"
                      :key="tab.chromeTabId"
                      class="tab-item is-grouped"
                      :class="{ 'is-active': tab.chromeTabId === selectedTabId }"
                      :ref="(el: any) => setTabRef(tab.chromeTabId, el)"
                      @click="activateTab(tab)"
                    >
                      <el-checkbox
                        :model-value="selectedTabIds.has(tab.chromeTabId)"
                        @change="(v) => toggleTab(tab.chromeTabId, Boolean(v))"
                        @click.stop
                      />
                      <img
                        v-if="tab.favIconUrl"
                        :src="tab.favIconUrl"
                        class="tab-favicon"
                        @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
                      />
                      <div v-else class="tab-favicon-placeholder" />
                      <div class="tab-info">
                        <div class="tab-title" :title="tab.title">{{ tab.title || '(无标题)' }}</div>
                        <div class="tab-url" :title="tab.url">{{ tab.url }}</div>
                      </div>
                      <div class="tab-actions" @click.stop>
                        <el-tooltip content="关闭" placement="top">
                          <el-button size="small" text circle @click="closeTab(tab.chromeTabId)">
                            <el-icon><Close /></el-icon>
                          </el-button>
                        </el-tooltip>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 未分组标签页 -->
                <div
                  v-else
                  class="tab-item"
                  :class="{ 'is-active': item.chromeTabId === selectedTabId }"
                  :ref="(el: any) => setTabRef(item.chromeTabId, el)"
                  @click="activateTab(item)"
                >
                  <el-checkbox
                    :model-value="selectedTabIds.has(item.chromeTabId)"
                    @change="(v) => toggleTab(item.chromeTabId, Boolean(v))"
                    @click.stop
                  />
                  <img
                    v-if="item.favIconUrl"
                    :src="item.favIconUrl"
                    class="tab-favicon"
                    @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
                  />
                  <div v-else class="tab-favicon-placeholder" />
                  <div class="tab-info">
                    <div class="tab-title" :title="item.title">{{ item.title || '(无标题)' }}</div>
                    <div class="tab-url" :title="item.url">{{ item.url }}</div>
                  </div>
                  <div class="tab-actions" @click.stop>
                    <el-tooltip content="关闭" placement="top">
                      <el-button size="small" text circle @click="closeTab(item.chromeTabId)">
                        <el-icon><Close /></el-icon>
                      </el-button>
                    </el-tooltip>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- 工作组选择弹窗 -->
    <WorkspacePickerDialog
      v-model="pickerVisible"
      title="加入工作组"
      @select="handleAddToWorkspace"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Search, Close, Loading, CaretRight, Monitor } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { sendMessage } from '../shared/composables/useMessage'
import LoginPanel from '@/shared/components/LoginPanel.vue'
import WorkspacePickerDialog from '../shared/components/WorkspacePickerDialog.vue'
import type { StateData } from '@/shared/types'
import type { WorkspaceTreeNode as WsTreeNode } from '@/shared/utils/workspace-tree'

interface TabNode {
  type: 'tab'
  key: string
  chromeTabId: number
  windowId: number
  groupId: number
  index: number
  title: string
  url: string
  favIconUrl: string
  active: boolean
}

interface GroupNode {
  type: 'group'
  key: string
  groupId: number
  windowId: number
  title: string
  color: string
  tabs: TabNode[]
}

interface WindowNode {
  id: number
  order: number
  tabCount: number
  items: Array<GroupNode | TabNode>
}

// ============ 登录态（从 popup 迁移） ============
const authLoading = ref(true)
const authenticated = ref(false)

async function initAuth() {
  const res = await sendMessage<StateData>({ action: 'GET_STATE' })
  authenticated.value = !!(res.success && res.data?.auth?.authenticated)
  authLoading.value = false
}

function onLoginSuccess() {
  authenticated.value = true
  reload()
}

async function logout() {
  await sendMessage({ action: 'LOGOUT' })
  authenticated.value = false
  ElMessage.success('已退出登录')
}

function openSettings() {
  const url = chrome.runtime.getURL('dashboard.html') + '#/settings'
  chrome.tabs.create({ url })
}

// ============ 标签页管理 ============
const loading = ref(true)
const searchKeyword = ref('')
const windowFilter = ref<'all' | number>('all')
const currentWindowId = ref<number>(-1)

// 原始数据
const rawTabs = ref<chrome.tabs.Tab[]>([])
const rawGroups = ref<chrome.tabGroups.TabGroup[]>([])
const rawWindows = ref<chrome.windows.Window[]>([])

// UI 折叠状态
const collapsedWindows = ref<Set<number>>(new Set())
const collapsedGroups = ref<Set<number>>(new Set())

// 选择状态（以 chromeTabId 记录）
const selectedTabIds = ref<Set<number>>(new Set())

// 当前浏览器激活的标签页（高亮 + 定位用），随浏览器选中页变化而同步
const selectedTabId = ref<number | null>(null)
const tabRefs = {} as Record<number, HTMLElement>

function setTabRef(id: number, el: Element | null) {
  if (el) tabRefs[id] = el as HTMLElement
  else delete tabRefs[id]
}

function scrollToSelected() {
  if (selectedTabId.value == null) return
  nextTick(() => {
    tabRefs[selectedTabId.value as number]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

/** 展开包含该标签页的窗口并滚动到该标签页 */
function ensureVisible(tabId: number) {
  for (const w of visibleWindows.value) {
    const found = w.items.some((it) =>
      it.type === 'tab'
        ? it.chromeTabId === tabId
        : it.tabs.some((t) => t.chromeTabId === tabId),
    )
    if (found && collapsedWindows.value.has(w.id)) {
      toggleWindow(w.id)
      break
    }
  }
  scrollToSelected()
}

/** 将高亮定位到「当前浏览器窗口」的激活标签页 */
async function syncSelection() {
  try {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (t?.id != null) {
      selectedTabId.value = t.id
      ensureVisible(t.id)
    }
  } catch {
    /* 忽略：无活动标签页等异常情况 */
  }
}

function syncSelectionFromEvent(info: chrome.tabs.OnActivatedInfo) {
  selectedTabId.value = info.tabId
  ensureVisible(info.tabId)
}

const pickerVisible = ref(false)

/** 供窗口下拉使用 */
const windows = computed(() =>
  rawWindows.value.map((w) => ({ id: w.id ?? -1 })).filter((w) => w.id !== -1),
)

/** 组装窗口 → 分组 → 标签页的树 */
const treeWindows = computed<WindowNode[]>(() => {
  const groupMap = new Map<number, chrome.tabGroups.TabGroup>()
  for (const g of rawGroups.value) groupMap.set(g.id, g)

  const orderMap = new Map<number, number>()
  rawWindows.value.forEach((w, i) => {
    if (w.id != null) orderMap.set(w.id, i + 1)
  })

  // 按窗口分组标签页
  const tabsByWindow = new Map<number, chrome.tabs.Tab[]>()
  for (const t of rawTabs.value) {
    const wid = t.windowId ?? -1
    if (!tabsByWindow.has(wid)) tabsByWindow.set(wid, [])
    tabsByWindow.get(wid)!.push(t)
  }

  const result: WindowNode[] = []
  for (const win of rawWindows.value) {
    const wid = win.id ?? -1
    if (wid === -1) continue
    const tabs = (tabsByWindow.get(wid) ?? [])
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))

    const items: Array<GroupNode | TabNode> = []
    let currentGroup: GroupNode | null = null

    for (const t of tabs) {
      const tabNode: TabNode = {
        type: 'tab',
        key: `t-${t.id}`,
        chromeTabId: t.id ?? -1,
        windowId: wid,
        groupId: t.groupId ?? -1,
        index: t.index ?? 0,
        title: t.title || '',
        url: t.url || t.pendingUrl || '',
        favIconUrl: t.favIconUrl || '',
        active: !!t.active,
      }

      const gid = t.groupId ?? -1
      if (gid !== -1 && gid !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        if (!currentGroup || currentGroup.groupId !== gid) {
          const g = groupMap.get(gid)
          currentGroup = {
            type: 'group',
            key: `g-${gid}`,
            groupId: gid,
            windowId: wid,
            title: g?.title || '',
            color: g?.color || 'grey',
            tabs: [],
          }
          items.push(currentGroup)
        }
        currentGroup.tabs.push(tabNode)
      } else {
        currentGroup = null
        items.push(tabNode)
      }
    }

    result.push({
      id: wid,
      order: orderMap.get(wid) ?? 0,
      tabCount: tabs.length,
      items,
    })
  }

  return result
})

/** 应用窗口筛选与搜索后的可见窗口 */
const visibleWindows = computed<WindowNode[]>(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const matchTab = (t: TabNode) =>
    !kw || t.title.toLowerCase().includes(kw) || t.url.toLowerCase().includes(kw)

  return treeWindows.value
    .filter((w) => windowFilter.value === 'all' || w.id === windowFilter.value)
    .map((w) => {
      if (!kw) return w
      const items = w.items
        .map((item) => {
          if (item.type === 'tab') return matchTab(item) ? item : null
          const tabs = item.tabs.filter(matchTab)
          return tabs.length ? { ...item, tabs } : null
        })
        .filter((x): x is GroupNode | TabNode => x !== null)
      return { ...w, items, tabCount: items.reduce((n, it) => n + (it.type === 'tab' ? 1 : it.tabs.length), 0) }
    })
    .filter((w) => w.items.length > 0)
})

function groupCheckState(group: GroupNode) {
  const total = group.tabs.length
  const selected = group.tabs.filter((t) => selectedTabIds.value.has(t.chromeTabId)).length
  return {
    checked: total > 0 && selected === total,
    indeterminate: selected > 0 && selected < total,
  }
}

function toggleGroup(group: GroupNode, checked: boolean) {
  const next = new Set(selectedTabIds.value)
  for (const t of group.tabs) {
    if (checked) next.add(t.chromeTabId)
    else next.delete(t.chromeTabId)
  }
  selectedTabIds.value = next
}

function toggleTab(chromeTabId: number, checked: boolean) {
  const next = new Set(selectedTabIds.value)
  if (checked) next.add(chromeTabId)
  else next.delete(chromeTabId)
  selectedTabIds.value = next
}

function clearSelection() {
  selectedTabIds.value = new Set()
}

function toggleWindow(id: number) {
  const next = new Set(collapsedWindows.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedWindows.value = next
}

function toggleGroupCollapse(id: number) {
  const next = new Set(collapsedGroups.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedGroups.value = next
}

/** Chrome 分组颜色名 → 展示色 */
function groupColorHex(color: string): string {
  const map: Record<string, string> = {
    grey: '#5f6368',
    blue: '#1a73e8',
    red: '#d93025',
    yellow: '#f9ab00',
    green: '#188038',
    pink: '#d01884',
    purple: '#9334e6',
    cyan: '#007b83',
    orange: '#fa903e',
  }
  return map[color] || '#5f6368'
}

function activateTab(tab: TabNode) {
  chrome.tabs.update(tab.chromeTabId, { active: true })
  chrome.windows.update(tab.windowId, { focused: true })
  selectedTabId.value = tab.chromeTabId
  ensureVisible(tab.chromeTabId)
}

async function closeTab(chromeTabId: number) {
  try {
    await chrome.tabs.remove(chromeTabId)
  } catch {
    // 可能已关闭
  }
}

/** 将当前选中的标签页加入指定工作组 */
async function handleAddToWorkspace(node: WsTreeNode) {
  const ids = selectedTabIds.value
  const tabs = rawTabs.value
    .filter((t) => t.id != null && ids.has(t.id))
    .map((t) => ({
      url: t.url || t.pendingUrl || '',
      title: t.title || '',
      favIconUrl: t.favIconUrl || '',
      chromeTabId: t.id ?? 0,
    }))
    .filter((t) => t.url)

  if (tabs.length === 0) {
    ElMessage.warning('没有可加入的标签页')
    return
  }

  const res = await sendMessage<{ added: number; skipped: number }>({
    action: 'ADD_TABS_TO_WORKSPACE',
    payload: { workspaceId: node.id, tabs },
  })

  if (res.success) {
    const added = res.data?.added ?? 0
    const skipped = res.data?.skipped ?? 0
    ElMessage.success(`已加入「${node.name}」：新增 ${added} 个${skipped ? `，跳过 ${skipped} 个重复` : ''}`)
    clearSelection()
  } else {
    ElMessage.error(res.error || '加入工作组失败')
  }
}

function openDashboard() {
  sendMessage({ action: 'OPEN_DASHBOARD' })
}

// ============ 数据加载与实时更新 ============

async function reload() {
  const [tabs, groups, wins, curWin] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
    chrome.windows.getAll({ windowTypes: ['normal'] }),
    chrome.windows.getCurrent().catch(() => null),
  ])
  rawTabs.value = tabs
  rawGroups.value = groups
  rawWindows.value = wins
  if (curWin?.id != null) currentWindowId.value = curWin.id

  // 清理已不存在的标签页选择
  const alive = new Set(tabs.map((t) => t.id))
  let changed = false
  const next = new Set<number>()
  for (const id of selectedTabIds.value) {
    if (alive.has(id)) next.add(id)
    else changed = true
  }
  if (changed) selectedTabIds.value = next

  loading.value = false
}

let reloadTimer: ReturnType<typeof setTimeout> | null = null
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(reload, 120)
}

const listeners: Array<() => void> = []

function registerListeners() {
  const cb = () => scheduleReload()
  // 单个函数（无参）可赋值给任意 chrome 事件回调（多余参数被忽略）
  type ChromeEvent = {
    addListener: (cb: (...args: any[]) => void) => void
    removeListener: (cb: (...args: any[]) => void) => void
  }
  const add = (ev?: ChromeEvent) => {
    if (!ev) return
    ev.addListener(cb)
    listeners.push(() => ev.removeListener(cb))
  }

  add(chrome.tabs.onCreated)
  add(chrome.tabs.onRemoved)
  add(chrome.tabs.onUpdated)
  add(chrome.tabs.onMoved)
  // 激活标签变化时：刷新列表并同步高亮/定位到当前浏览器选中页
  const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
    scheduleReload()
    syncSelectionFromEvent(info)
  }
  chrome.tabs.onActivated.addListener(onActivated)
  listeners.push(() => chrome.tabs.onActivated.removeListener(onActivated))
  add(chrome.tabs.onAttached)
  add(chrome.tabs.onDetached)
  add(chrome.tabs.onReplaced)

  add(chrome.tabGroups?.onCreated)
  add(chrome.tabGroups?.onUpdated)
  add(chrome.tabGroups?.onRemoved)
  add(chrome.tabGroups?.onMoved)

  add(chrome.windows.onCreated)
  add(chrome.windows.onRemoved)
  add(chrome.windows.onFocusChanged)
}

onMounted(async () => {
  await Promise.all([initAuth(), reload()])
  registerListeners()
  await syncSelection()
})

onUnmounted(() => {
  for (const off of listeners) off()
  if (reloadTimer) clearTimeout(reloadTimer)
})
</script>

<style scoped>
.sidepanel-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #fff;
}

.sidepanel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.sidepanel-header h3 {
  margin: 0;
  font-size: 15px;
  color: #303133;
}

.sp-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
}

.window-select {
  width: 140px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
}

.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #ecf5ff;
  border-top: 1px solid #d9ecff;
  border-bottom: 1px solid #d9ecff;
}

.selection-count {
  font-size: 12px;
  color: #409eff;
}

.selection-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tree-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 12px;
}

.hint-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: #909399;
  font-size: 13px;
}

.window-node {
  margin-bottom: 4px;
}

.window-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: 6px;
  font-weight: 600;
  color: #303133;
  font-size: 13px;
}

.window-header:hover {
  background: #f5f7fa;
}

.window-icon {
  color: #909399;
}

.window-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  transition: transform 0.15s;
  color: #909399;
  font-size: 12px;
}

.expand-icon.is-expanded {
  transform: rotate(90deg);
}

.node-count {
  font-size: 11px;
  color: #909399;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 0 6px;
}

.window-body {
  padding-left: 8px;
}

.group-node {
  margin: 2px 0;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 6px;
  font-size: 12px;
  color: #303133;
}

.group-header:hover {
  background: #f5f7fa;
}

.group-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.group-body {
  padding-left: 18px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.tab-item:hover {
  background-color: #f5f7fa;
}

.tab-item.is-active {
  background-color: #ecf5ff;
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

.tab-info {
  flex: 1;
  min-width: 0;
}

.tab-title {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-url {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.tab-actions {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.tab-item:hover .tab-actions {
  opacity: 1;
}
</style>
