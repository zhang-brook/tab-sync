<template>
  <div class="sidepanel-container">
    <!-- 顶部栏 -->
    <div class="sidepanel-header">
      <h3>SpiderMemos Tab Sync</h3>
      <el-button type="primary" size="small" @click="openDashboard">
        管理面板
      </el-button>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索标签页..."
        size="small"
        clearable
        :prefix-icon="Search"
        @input="handleSearch"
      />
    </div>

    <!-- 状态筛选 -->
    <div class="filter-bar">
      <el-radio-group v-model="statusFilter" size="small" @change="loadTabs">
        <el-radio-button value="open">打开 ({{ openCount }})</el-radio-button>
        <el-radio-button value="closed">已关闭</el-radio-button>
        <el-radio-button value="">全部</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 标签页列表 -->
    <div class="tab-list">
      <div v-if="loading" class="loading-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>

      <div v-else-if="tabs.length === 0" class="empty-state">
        <span>暂无标签页</span>
      </div>

      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ 'tab-item--closed': tab.status !== 'open' }"
        @click="handleTabClick(tab)"
      >
        <!-- 图标 -->
        <img
          v-if="tab.favIconUrl"
          :src="tab.favIconUrl"
          class="tab-favicon"
          @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
        />
        <div v-else class="tab-favicon-placeholder" />

        <!-- 标题和 URL -->
        <div class="tab-info">
          <div class="tab-title" :title="tab.title">{{ tab.title || '(无标题)' }}</div>
          <div class="tab-url" :title="tab.url">{{ tab.url }}</div>
        </div>

        <!-- 操作按钮 -->
        <div class="tab-actions" @click.stop>
          <!-- 打开状态：显示关闭按钮 -->
          <el-tooltip v-if="tab.status === 'open'" content="关闭（保留远端记录）" placement="top">
            <el-button size="small" text circle @click="handleCloseTab(tab.id)">
              <el-icon><Close /></el-icon>
            </el-button>
          </el-tooltip>
          <!-- 关闭状态：显示重新打开按钮 -->
          <el-tooltip v-else content="重新打开" placement="top">
            <el-button size="small" text circle @click="handleReopenTab(tab.url)">
              <el-icon><RefreshRight /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, Close, RefreshRight, Loading } from '@element-plus/icons-vue'
import { sendMessage } from '../shared/composables/useMessage'
import type { TabRecord, TabsData, StateData } from '../shared/types'

const searchKeyword = ref('')
const statusFilter = ref('open')
const tabs = ref<TabRecord[]>([])
const openCount = ref(0)
const loading = ref(true)

/** 搜索防抖定时器 */
let searchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  // 先获取打开数量
  const stateRes = await sendMessage<StateData>({ action: 'GET_STATE' })
  if (stateRes.success && stateRes.data) {
    openCount.value = stateRes.data.tabCount.open
  }
  // 加载标签页列表
  await loadTabs()
})

async function loadTabs() {
  loading.value = true
  const payload: Record<string, string> = {}
  if (statusFilter.value) {
    payload.status = statusFilter.value
  }
  if (searchKeyword.value.trim()) {
    payload.search = searchKeyword.value.trim()
  }

  const res = await sendMessage<TabsData>({ action: 'GET_TABS', payload })
  if (res.success && res.data) {
    tabs.value = res.data.tabs
  }
  loading.value = false
}

function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadTabs()
  }, 300)
}

/** 点击标签页 - 如果是打开状态，切换到该标签页 */
function handleTabClick(tab: TabRecord) {
  if (tab.status === 'open') {
    chrome.tabs.update(tab.chromeTabId, { active: true })
    chrome.windows.update(tab.windowId, { focused: true })
  }
}

/** 关闭标签页（保留远端记录） */
async function handleCloseTab(tabId: string) {
  await sendMessage({ action: 'CLOSE_TAB', payload: { tabId } })
  // 刷新列表
  await loadTabs()
}

/** 重新打开标签页 */
async function handleReopenTab(url: string) {
  await sendMessage({ action: 'REOPEN_TAB', payload: { url } })
}

function openDashboard() {
  sendMessage({ action: 'OPEN_DASHBOARD' })
}
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

.search-bar {
  padding: 8px 16px;
}

.filter-bar {
  padding: 0 16px 8px;
}

.tab-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: #909399;
  font-size: 13px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.tab-item:hover {
  background-color: #f5f7fa;
}

.tab-item--closed {
  opacity: 0.6;
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
