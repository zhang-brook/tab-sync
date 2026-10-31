<template>
  <div class="tabs-view">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-select v-model="windowFilter" placeholder="全部窗口" class="window-filter">
        <el-option label="全部窗口" value="all" />
        <el-option v-for="w in windowOptions" :key="w.id" :label="w.label" :value="w.id" />
      </el-select>

      <el-input v-model="keyword" placeholder="搜索标题或网址" clearable class="search-input">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <div class="toolbar-spacer" />

      <el-button :icon="Refresh" @click="reload()">刷新</el-button>
      <el-button :icon="View" @click="showSavedLocalTabs">查看已保存的本地标签页</el-button>
    </div>

    <!-- 批量操作栏 -->
    <SelectionBar v-if="selectedCount > 0" :count="selectedCount" class="batch-bar">
      <el-button @click="clearSelection">取消选择</el-button>
      <el-button type="primary" :icon="FolderAdd" @click="openSavePicker('add', selectedTabs)">
        加入工作组
      </el-button>
      <el-button type="primary" plain :icon="FolderChecked" @click="openSavePicker('add-close', selectedTabs)">
        加入并关闭
      </el-button>
      <el-button type="success" plain :icon="FolderChecked" @click="saveDefaultAndClose">
        保存到默认分组并关闭
      </el-button>
      <el-button type="success" plain :icon="FolderOpened" @click="saveUngroupedAndClose">
        保存到未分组并关闭
      </el-button>
      <el-button type="danger" :icon="Close" :loading="closing" @click="closeSelectedTabs">
        关闭选中
      </el-button>
    </SelectionBar>

    <div v-if="loading" class="empty-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>

    <div v-else-if="visibleWindows.length === 0" class="empty-state">
      <el-empty :description="keyword ? '没有匹配的标签页' : '当前没有打开的标签页'" />
    </div>

    <!-- 树形：窗口 → 分组 → 标签页 -->
    <div v-else class="tree-scroll">
      <LocalTabTree
        :windows="visibleWindows"
        :selected="selectedIds"
        :active-tab-id="activeTabId"
        :collapsed-windows="collapsedWindows"
        :collapsed-groups="collapsedGroups"
        :menu-items="menuItems"
        :meta-for-tab="metaForTab"
        @update:selected="setSelection"
        @toggle-window="toggleWindow"
        @toggle-group="toggleGroupCollapse"
        @group-selection="toggleGroupSelection"
        @activate="activate"
        @close="closeTab"
        @sort="onSort"
        @command="(cmd, tab) => run(cmd, tab)"
        @tag-click="onTagClick"
      />
    </div>

    <!-- 工作组选择弹窗：加入 / 加入并关闭 -->
    <LocalSaveTabsDialog
      v-model="saveDialogVisible"
      :tabs="saveDialogTabs"
      :title="saveCloseAfter ? '保存到工作组并关闭' : '保存到工作组'"
      :default-close-after-save="saveCloseAfter"
      @saved="onSaved"
    />

    <!-- 已保存的本地标签页弹窗 -->
    <el-dialog v-model="savedTabsDialogVisible" title="已保存的本地标签页" width="720px">
      <div v-if="savedLocalTabs.length === 0" class="saved-empty">
        <el-empty description="当前没有已存在于工作组中的已打开标签页" />
      </div>
      <template v-else>
        <div class="saved-list-header">
          <el-checkbox
            :model-value="savedSelectionCount === savedLocalTabs.length"
            :indeterminate="savedSelectionCount > 0 && savedSelectionCount < savedLocalTabs.length"
            @change="toggleAllSavedTabs"
          >全选</el-checkbox>
          <span class="saved-count">已选 {{ savedSelectionCount }} / {{ savedLocalTabs.length }} 个</span>
        </div>
        <div class="saved-list">
          <TabList
            :items="savedListItems"
            selectable
            :selected="savedSelectedArray"
            :menu-items="[]"
            @update:selected="onSavedSelectionChange"
            @click="(item) => openSavedTab(item)"
            @tag-click="onTagClick"
          >
            <template #actions="{ item }">
              <el-button text :icon="Close" title="关闭标签页" @click="closeSavedTab(Number(item.id))" />
            </template>
          </TabList>
        </div>
      </template>
      <template #footer>
        <el-button @click="savedTabsDialogVisible = false">取消</el-button>
        <el-button
          type="danger"
          :disabled="savedSelectionCount === 0"
          @click="handleBatchCloseSavedTabs"
        >批量关闭选定标签页</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Close, Loading, FolderAdd, FolderChecked, FolderOpened, View } from '@element-plus/icons-vue'
import LocalTabTree from '@/shared/components/LocalTabTree.vue'
import TabList from '@/shared/components/TabList.vue'
import SelectionBar from '@/shared/components/SelectionBar.vue'
import LocalSaveTabsDialog from '@/shared/components/LocalSaveTabsDialog.vue'
import { useLocalTabs } from '@/shared/composables/useLocalTabs'
import { useLocalTabActions } from '@/shared/composables/useLocalTabActions'
import { localTabMenu } from '@/shared/actions/tab-actions'
import { closeLocalTabs, type LocalTab, type LocalTabSegment } from '@/shared/services/local-tabs'
import { useWorkspaceTabIndex } from '@/shared/composables/useWorkspaceTabIndex'
import type { TabListItem, TabRowMeta, TabTagDisplay } from '@/shared/types/tab-list'

const router = useRouter()

const {
  loading,
  keyword,
  windowFilter,
  selectedIds,
  activeTabId,
  collapsedWindows,
  collapsedGroups,
  allTabs,
  selectedTabs,
  selectedCount,
  visibleWindows,
  windowOptions,
  reload,
  setSelection,
  toggleGroupSelection,
  clearSelection,
  toggleWindow,
  toggleGroupCollapse,
  activate,
  closeTab,
  closeSelected,
  sortSegment,
} = useLocalTabs()

const menuItems = computed(() => localTabMenu())

async function onSort(payload: { segment: LocalTabSegment; orderedIds: number[]; movedId: number }) {
  await sortSegment(payload.segment, payload.orderedIds, payload.movedId)
}

// ============ 标签页所属工作组（按 URL 交叉比对） ============
const { load: loadWorkspaceIndex, tagsFor, colorsFor } = useWorkspaceTabIndex()

function metaForTab(tab: LocalTab): TabRowMeta | undefined {
  const tags = tagsFor(tab.url)
  return tags.length ? { tags, saved: true, savedColors: colorsFor(tab.url) } : undefined
}

function onTagClick(tag: TabTagDisplay) {
  if (!tag.key) return
  router.push({ path: '/workspaces', query: { workspaceId: tag.key } })
}

// ============ 批量关闭 ============
const closing = ref(false)

async function closeSelectedTabs() {
  if (selectedCount.value === 0) return
  try {
    await ElMessageBox.confirm(
      `确定要关闭选中的 ${selectedCount.value} 个标签页吗？`,
      '批量关闭',
      { confirmButtonText: '关闭', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  closing.value = true
  try {
    const count = await closeSelected()
    ElMessage.success(`已关闭 ${count} 个标签页`)
  } finally {
    closing.value = false
  }
}

// ============ 保存到工作组 ============
const saveDialogVisible = ref(false)
const saveDialogTabs = ref<LocalTab[]>([])
const saveCloseAfter = ref(false)

function openSavePicker(mode: 'add' | 'add-close', tabs: LocalTab[]) {
  if (tabs.length === 0) {
    ElMessage.warning('请先选择标签页')
    return
  }
  saveDialogTabs.value = tabs
  saveCloseAfter.value = mode === 'add-close'
  saveDialogVisible.value = true
}

function onSaved() {
  clearSelection()
  void loadWorkspaceIndex()
}

const { run } = useLocalTabActions({
  selectedTabs: () => selectedTabs.value,
  clearSelection,
  closeTabs: async (ids) => {
    await closeLocalTabs(ids)
    await reload({ silent: true })
  },
  openWorkspacePicker: openSavePicker,
  openCreateWorkspace: (closeAfterAdd, tabs) =>
    openSavePicker(closeAfterAdd ? 'add-close' : 'add', tabs),
  onActivate: activate,
  onSaved: () => {
    clearSelection()
    void reload({ silent: true })
    void loadWorkspaceIndex()
  },
})

function saveDefaultAndClose() {
  void run('saveToDefaultAndClose')
}

function saveUngroupedAndClose() {
  void run('saveToUngroupedAndClose')
}

// ============ 已保存的本地标签页弹窗 ============
const savedTabsDialogVisible = ref(false)
const savedSelection = ref<Set<number>>(new Set())

const savedLocalTabs = computed<LocalTab[]>(() =>
  allTabs.value.filter((tab) => tagsFor(tab.url).length > 0),
)

const savedSelectionCount = computed(() => savedSelection.value.size)
const savedSelectedArray = computed<Array<string | number>>(() => Array.from(savedSelection.value))

const savedListItems = computed<TabListItem[]>(() =>
  savedLocalTabs.value.map((tab) => ({
    id: tab.chromeTabId,
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    tags: tagsFor(tab.url),
  })),
)

function onSavedSelectionChange(ids: Array<string | number>) {
  savedSelection.value = new Set(ids.map(Number))
}

async function showSavedLocalTabs() {
  await loadWorkspaceIndex()
  savedSelection.value = new Set(savedLocalTabs.value.map((t) => t.chromeTabId))
  savedTabsDialogVisible.value = true
}

function toggleAllSavedTabs(checked: boolean | string | number) {
  savedSelection.value = Boolean(checked)
    ? new Set(savedLocalTabs.value.map((t) => t.chromeTabId))
    : new Set()
}

async function openSavedTab(item: TabListItem) {
  const tab = savedLocalTabs.value.find((t) => t.chromeTabId === Number(item.id))
  if (tab) await activate(tab)
}

async function closeSavedTab(chromeTabId: number) {
  await closeLocalTabs([chromeTabId])
  const next = new Set(savedSelection.value)
  next.delete(chromeTabId)
  savedSelection.value = next
}

async function handleBatchCloseSavedTabs() {
  const ids = Array.from(savedSelection.value)
  if (ids.length === 0) {
    ElMessage.warning('请先选择要关闭的标签页')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要关闭选中的 ${ids.length} 个标签页吗？`,
      '批量关闭',
      { confirmButtonText: '关闭', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  await closeLocalTabs(ids)
  ElMessage.success(`已关闭 ${ids.length} 个标签页`)
  savedTabsDialogVisible.value = false
  await reload({ silent: true })
}

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
  margin-bottom: 12px;
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
.saved-list-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.saved-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.saved-list {
  max-height: 440px;
  overflow-y: auto;
}
.saved-empty {
  padding: 8px 0;
}
</style>
