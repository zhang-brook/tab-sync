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
            v-for="win in windowOptions"
            :key="win.id"
            :label="win.label"
            :value="win.id"
          />
        </el-select>
        <el-input
          v-model="keyword"
          placeholder="搜索标签页..."
          size="small"
          clearable
          :prefix-icon="Search"
          class="search-input"
        />
        <el-tooltip content="定位到当前激活的标签页" placement="top">
          <el-button size="small" :icon="Aim" @click="focusActiveTab">定位</el-button>
        </el-tooltip>
      </div>

      <!-- 选择操作栏 -->
      <SelectionBar v-if="selectedCount > 0" :count="selectedCount" class="selection">
        <el-button size="small" text @click="clearSelection">取消选择</el-button>
        <el-button size="small" @click="openSavePicker('add', selectedTabs)">加入工作组</el-button>
        <el-button size="small" type="primary" @click="openSavePicker('add-close', selectedTabs)">
          加入并关闭
        </el-button>
        <el-button size="small" type="danger" plain :loading="closing" @click="closeSelectedTabs">
          关闭选中
        </el-button>
      </SelectionBar>

      <!-- 树状列表 -->
      <div class="tree-list">
        <div v-if="loading" class="hint-state">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>加载中...</span>
        </div>

        <div v-else-if="visibleWindows.length === 0" class="hint-state">
          <span>暂无标签页</span>
        </div>

        <LocalTabTree
          v-else
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
    </template>

    <!-- 工作组选择弹窗：加入 / 加入并关闭 -->
    <LocalSaveTabsDialog
      v-model="saveDialogVisible"
      :tabs="saveDialogTabs"
      :title="saveCloseAfter ? '保存到工作组并关闭' : '保存到工作组'"
      :default-close-after-save="saveCloseAfter"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Loading, Aim } from '@element-plus/icons-vue'
import LocalTabTree from '@/shared/components/LocalTabTree.vue'
import SelectionBar from '@/shared/components/SelectionBar.vue'
import LocalSaveTabsDialog from '@/shared/components/LocalSaveTabsDialog.vue'
import LoginPanel from '@/shared/components/LoginPanel.vue'
import { useLocalTabs } from '@/shared/composables/useLocalTabs'
import { useLocalTabActions } from '@/shared/composables/useLocalTabActions'
import { localTabMenu } from '@/shared/actions/tab-actions'
import { closeLocalTabs, type LocalTab, type LocalTabSegment } from '@/shared/services/local-tabs'
import { sendMessage } from '@/shared/composables/useMessage'
import { useWorkspaceTabIndex } from '@/shared/composables/useWorkspaceTabIndex'
import { openTabAfterActive } from '@/shared/utils/tab-utils'
import { dashboardTargetUrl, targetOfTag } from '@/shared/utils/dashboard-links'
import { DASHBOARD_URL } from '@/shared/utils/pages'
import type { StateData } from '@/shared/types'
import type { TabRowMeta, TabTagDisplay } from '@/shared/types/tab-list'

// ============ 登录态（从 popup 迁移） ============
const authLoading = ref(true)
const authenticated = ref(false)

async function initAuth() {
  const res = await sendMessage<StateData>({ action: 'GET_STATE' })
  authenticated.value = !!(res.success && res.data?.auth?.authenticated)
  authLoading.value = false
}

async function onLoginSuccess() {
  authenticated.value = true
  await reload()
  void loadWorkspaceIndex()
}

async function logout() {
  await sendMessage({ action: 'LOGOUT' })
  authenticated.value = false
  ElMessage.success('已退出登录')
}

function openSettings() {
  void openTabAfterActive(DASHBOARD_URL + '#/settings')
}

function openDashboard() {
  void sendMessage({ action: 'OPEN_DASHBOARD' })
}

// ============ 标签页管理 ============
const {
  loading,
  keyword,
  windowFilter,
  selectedIds,
  activeTabId,
  collapsedWindows,
  collapsedGroups,
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
  focusActiveTab,
} = useLocalTabs()

const closing = ref(false)

const menuItems = computed(() => localTabMenu())

// ============ 已保存到工作组的标签页（按 URL 交叉比对） ============
const { load: loadWorkspaceIndex, tagsFor, colorsFor } = useWorkspaceTabIndex()

function metaForTab(tab: LocalTab): TabRowMeta | undefined {
  const tags = tagsFor(tab.url)
  return tags.length ? { tags, saved: true, savedColors: colorsFor(tab.url) } : undefined
}

function onTagClick(tag: TabTagDisplay) {
  const target = targetOfTag(tag)
  if (target) void openTabAfterActive(dashboardTargetUrl(target))
}

async function onSort(payload: { segment: LocalTabSegment; orderedIds: number[]; movedId: number }) {
  await sortSegment(payload.segment, payload.orderedIds, payload.movedId)
}

async function closeSelectedTabs() {
  if (selectedCount.value === 0) return
  try {
    await ElMessageBox.confirm(
      `确定要关闭选中的 ${selectedCount.value} 个标签页吗？`,
      '关闭标签页',
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

// ============ 保存到工作组（与浏览器右键菜单同一套动作） ============
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
  // 侧边栏没有独立的「新建并保存」表单，统一在选择器内用「新建工作组」完成
  openCreateWorkspace: (closeAfterAdd, tabs) =>
    openSavePicker(closeAfterAdd ? 'add-close' : 'add', tabs),
  onActivate: activate,
  onSaved: () => {
    clearSelection()
    void reload({ silent: true })
    void loadWorkspaceIndex()
  },
})

onMounted(() => {
  void initAuth()
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

.selection {
  margin: 0 12px 6px;
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
</style>
