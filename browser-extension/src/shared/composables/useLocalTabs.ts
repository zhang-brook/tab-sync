import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  activateLocalTab,
  closeLocalTabs,
  filterLocalWindows,
  findLocalTab,
  flattenLocalWindows,
  getActiveLocalTab,
  moveTabWithinSegment,
  queryLocalWindows,
  watchLocalTabs,
  type LocalTab,
  type LocalTabGroup,
  type LocalTabSegment,
  type LocalTabWindow,
} from '../services/local-tabs'

/**
 * 本地标签页的查询、筛选、多选、折叠、定位与实时刷新。
 * 侧边栏与管理面板共用同一套状态与行为，各端只负责渲染与场景化操作。
 */
export function useLocalTabs(options: { auto?: boolean } = {}) {
  const auto = options.auto ?? true

  const loading = ref(true)
  const keyword = ref('')
  const windowFilter = ref<number | 'all'>('all')
  const currentWindowId = ref<number | null>(null)
  const windows = ref<LocalTabWindow[]>([])
  const selectedIds = ref<Set<number>>(new Set())
  const activeTabId = ref<number | null>(null)
  const collapsedWindows = ref<Set<number>>(new Set())
  const collapsedGroups = ref<Set<number>>(new Set())

  const allTabs = computed(() => flattenLocalWindows(windows.value))
  const selectedTabs = computed(() =>
    allTabs.value.filter((t) => selectedIds.value.has(t.chromeTabId)),
  )
  /** TabList 选中态：数组形态 */
  const selectedIdArray = computed<Array<string | number>>(() => Array.from(selectedIds.value))
  const selectedCount = computed(() => selectedIds.value.size)

  const visibleWindows = computed(() =>
    filterLocalWindows(windows.value, {
      keyword: keyword.value,
      windowId: windowFilter.value,
    }),
  )

  const windowOptions = computed(() =>
    windows.value.map((w) => ({
      id: w.id,
      label: `窗口 ${w.order}${w.isCurrent ? '（当前）' : ''}`,
    })),
  )

  async function reload(opts: { silent?: boolean } = {}) {
    if (!opts.silent) loading.value = true
    try {
      const data = await queryLocalWindows()
      windows.value = data.windows
      currentWindowId.value = data.currentWindowId

      const alive = new Set(flattenLocalWindows(data.windows).map((t) => t.chromeTabId))
      const pruned = new Set(Array.from(selectedIds.value).filter((id) => alive.has(id)))
      if (pruned.size !== selectedIds.value.size) selectedIds.value = pruned
      if (activeTabId.value != null && !alive.has(activeTabId.value)) activeTabId.value = null
    } catch {
      ElMessage.error('加载本地标签页失败')
    } finally {
      loading.value = false
    }
  }

  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => void reload({ silent: true }), 120)
  }

  function setSelection(ids: Array<string | number>) {
    selectedIds.value = new Set(ids.map(Number).filter((n) => Number.isFinite(n)))
  }

  function toggleTabSelection(chromeTabId: number, checked: boolean) {
    const next = new Set(selectedIds.value)
    if (checked) next.add(chromeTabId)
    else next.delete(chromeTabId)
    selectedIds.value = next
  }

  function toggleGroupSelection(group: LocalTabGroup, checked: boolean) {
    const next = new Set(selectedIds.value)
    for (const tab of group.tabs) {
      if (checked) next.add(tab.chromeTabId)
      else next.delete(tab.chromeTabId)
    }
    selectedIds.value = next
  }

  function clearSelection() {
    selectedIds.value = new Set()
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

  function scrollToTab(chromeTabId: number) {
    nextTick(() => {
      document
        .querySelector(`[data-tab-id="${chromeTabId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  /** 展开包含该标签页的窗口/分组并滚动到可视区 */
  function ensureVisible(chromeTabId: number) {
    const tab = findLocalTab(windows.value, chromeTabId)
    if (!tab) return
    if (collapsedWindows.value.has(tab.windowId)) {
      const next = new Set(collapsedWindows.value)
      next.delete(tab.windowId)
      collapsedWindows.value = next
    }
    if (
      tab.groupId > 0 &&
      tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE &&
      collapsedGroups.value.has(tab.groupId)
    ) {
      const next = new Set(collapsedGroups.value)
      next.delete(tab.groupId)
      collapsedGroups.value = next
    }
    scrollToTab(chromeTabId)
  }

  async function activate(tab: LocalTab) {
    activeTabId.value = tab.chromeTabId
    await activateLocalTab(tab)
    ensureVisible(tab.chromeTabId)
  }

  async function closeTab(tab: LocalTab) {
    await closeLocalTabs([tab.chromeTabId])
    const next = new Set(selectedIds.value)
    next.delete(tab.chromeTabId)
    selectedIds.value = next
    if (activeTabId.value === tab.chromeTabId) activeTabId.value = null
    scheduleReload()
  }

  async function closeSelected() {
    const ids = Array.from(selectedIds.value)
    if (ids.length === 0) return 0
    await closeLocalTabs(ids)
    clearSelection()
    scheduleReload()
    return ids.length
  }

  async function sortSegment(segment: LocalTabSegment, orderedIds: readonly number[], movedId: number) {
    await moveTabWithinSegment(segment, orderedIds, movedId)
    scheduleReload()
  }

  /** 定位到浏览器当前激活的标签页：清除可能隐藏它的筛选并展开所在窗口/分组 */
  async function focusActiveTab() {
    const tab = await getActiveLocalTab()
    if (!tab) return
    activeTabId.value = tab.chromeTabId
    if (keyword.value.trim()) keyword.value = ''
    if (windowFilter.value !== 'all' && windowFilter.value !== tab.windowId) {
      windowFilter.value = 'all'
    }
    await nextTick()
    await reload({ silent: true })
    ensureVisible(tab.chromeTabId)
  }

  /** 把高亮同步到当前浏览器窗口的激活标签页 */
  async function syncActiveTab() {
    const tab = await getActiveLocalTab()
    if (!tab) return
    activeTabId.value = tab.chromeTabId
    ensureVisible(tab.chromeTabId)
  }

  let dispose: (() => void) | null = null
  let onActivated: ((info: chrome.tabs.OnActivatedInfo) => void) | null = null

  onMounted(async () => {
    if (!auto) return
    await reload()
    dispose = watchLocalTabs(scheduleReload)
    onActivated = (info) => {
      activeTabId.value = info.tabId
      scheduleReload()
      ensureVisible(info.tabId)
    }
    chrome.tabs.onActivated.addListener(onActivated)
    await syncActiveTab()
  })

  onUnmounted(() => {
    dispose?.()
    if (onActivated) chrome.tabs.onActivated.removeListener(onActivated)
    if (reloadTimer) clearTimeout(reloadTimer)
  })

  return {
    loading,
    keyword,
    windowFilter,
    currentWindowId,
    windows,
    selectedIds,
    activeTabId,
    collapsedWindows,
    collapsedGroups,
    allTabs,
    selectedTabs,
    selectedIdArray,
    selectedCount,
    visibleWindows,
    windowOptions,
    reload,
    scheduleReload,
    setSelection,
    toggleTabSelection,
    toggleGroupSelection,
    clearSelection,
    toggleWindow,
    toggleGroupCollapse,
    ensureVisible,
    activate,
    closeTab,
    closeSelected,
    sortSegment,
    focusActiveTab,
    syncActiveTab,
  }
}
