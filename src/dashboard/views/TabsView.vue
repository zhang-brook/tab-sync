<template>
  <div class="tabs-view">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索标题或 URL..."
          clearable
          style="width: 280px"
          :prefix-icon="Search"
          @input="handleSearch"
        />
        <el-select v-model="statusFilter" placeholder="状态" style="width: 120px" @change="loadTabs">
          <el-option label="全部" value="" />
          <el-option label="打开" value="open" />
          <el-option label="已关闭" value="closed" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button
          type="danger"
          :disabled="selectedIds.length === 0"
          @click="handleBatchClose"
        >
          批量关闭 ({{ selectedIds.length }})
        </el-button>
        <el-button @click="loadTabs">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 标签页表格 -->
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="tabs"
      stripe
      border
      style="width: 100%"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="40" />

      <el-table-column label="标签页" min-width="320">
        <template #default="{ row }">
          <div class="tab-cell">
            <img
              v-if="row.favIconUrl"
              :src="row.favIconUrl"
              class="tab-favicon"
              @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
            />
            <div v-else class="tab-favicon-placeholder" />
            <div class="tab-text">
              <div class="tab-title" :title="row.title">{{ row.title || '(无标题)' }}</div>
              <div class="tab-url" :title="row.url">{{ row.url }}</div>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'open' ? 'success' : 'info'" size="small">
            {{ row.status === 'open' ? '打开' : '已关闭' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="打开时间" width="170" prop="openedAt">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.openedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="最近访问" width="170" prop="lastAccessedAt">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.lastAccessedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'open'">
            <el-tooltip content="切换到该标签页" placement="top">
              <el-button size="small" text type="primary" @click="handleSwitchToTab(row)">
                <el-icon><View /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="关闭（保留远端记录）" placement="top">
              <el-button size="small" text type="danger" @click="handleCloseTab(row.id)">
                <el-icon><Close /></el-icon>
              </el-button>
            </el-tooltip>
          </template>
          <template v-else>
            <el-tooltip content="重新打开" placement="top">
              <el-button size="small" text type="primary" @click="handleReopenTab(row.url)">
                <el-icon><RefreshRight /></el-icon>
              </el-button>
            </el-tooltip>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- 底部统计 -->
    <div class="table-footer">
      <span class="footer-text">
        共 {{ tabs.length }} 条记录
        <template v-if="selectedIds.length > 0">
          ，已选 {{ selectedIds.length }} 条
        </template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, Refresh, Close, RefreshRight, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '../../shared/composables/useMessage'
import type { TabRecord, TabsData } from '../../shared/types'

const searchKeyword = ref('')
const statusFilter = ref('')
const tabs = ref<TabRecord[]>([])
const selectedIds = ref<string[]>([])
const loading = ref(true)

/** 搜索防抖定时器 */
let searchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  loadTabs()
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

function handleSelectionChange(rows: TabRecord[]) {
  selectedIds.value = rows.map(r => r.id)
}

/** 切换到指定标签页 */
function handleSwitchToTab(tab: TabRecord) {
  chrome.tabs.update(tab.chromeTabId, { active: true })
  chrome.windows.update(tab.windowId, { focused: true })
}

/** 关闭单个标签页 */
async function handleCloseTab(tabId: string) {
  await sendMessage({ action: 'CLOSE_TAB', payload: { tabId } })
  ElMessage.success('标签页已关闭')
  await loadTabs()
}

/** 批量关闭标签页 */
async function handleBatchClose() {
  const openIds = selectedIds.value
  if (openIds.length === 0) return

  try {
    await ElMessageBox.confirm(
      `确定要关闭选中的 ${openIds.length} 个标签页吗？远端记录将会保留。`,
      '批量关闭',
      { type: 'warning' },
    )
  } catch {
    return // 用户取消
  }

  await sendMessage({ action: 'CLOSE_TABS_BATCH', payload: { tabIds: openIds } })
  ElMessage.success(`已关闭 ${openIds.length} 个标签页`)
  selectedIds.value = []
  await loadTabs()
}

/** 重新打开标签页 */
async function handleReopenTab(url: string) {
  await sendMessage({ action: 'REOPEN_TAB', payload: { url } })
  ElMessage.success('标签页已重新打开')
}

/** 格式化时间 */
function formatTime(iso: string): string {
  if (!iso) return '--'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.tabs-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tab-cell {
  display: flex;
  align-items: center;
  gap: 8px;
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
}

.tab-url {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.time-text {
  font-size: 12px;
  color: #606266;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.footer-text {
  font-size: 13px;
  color: #909399;
}
</style>
