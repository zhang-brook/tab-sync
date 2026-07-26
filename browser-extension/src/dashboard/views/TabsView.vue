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
        <el-select v-model="windowFilter" placeholder="窗口" style="width: 140px" clearable @change="handleFilterChange">
          <el-option label="全部窗口" value="" />
          <el-option v-for="winId in windowIds" :key="winId" :label="`窗口 ${winId}`" :value="winId" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" :disabled="selectedTabs.length === 0" @click="showCreateWorkspaceDialog">
          <el-icon><Plus /></el-icon>
          创建工作组 ({{ selectedTabs.length }})
        </el-button>
        <el-button type="success" :disabled="selectedTabs.length === 0" @click="showAddToWorkspaceDialog">
          <el-icon><FolderAdd /></el-icon>
          加入现有工作组 ({{ selectedTabs.length }})
        </el-button>
        <el-button :disabled="selectedTabs.length === 0" type="danger" @click="handleBatchClose">
          <el-icon><Close /></el-icon>
          批量关闭 ({{ selectedTabs.length }})
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
      :data="pagedTabs"
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

      <el-table-column label="最后访问时间" width="140" align="center">
        <template #default="{ row }">
          <el-tooltip :content="lastAccessedTip(row as TabRow)" placement="top" :disabled="!row.lastAccessedAt">
            <span class="time-text">{{ formatTime(row.lastAccessedAt) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column label="工作组" min-width="160" header-align="center">
        <template #default="{ row }">
          <div class="workspace-tags">
            <el-tag
              v-for="tag in row.workspaceTags"
              :key="tag.workspaceId"
              size="small"
              :color="tag.workspaceColor"
              effect="dark"
              style="margin: 1px 2px; cursor: pointer"
              @click="switchToWorkspaces(tag.workspaceId)"
            >
              {{ tag.workspaceName }}
            </el-tag>
            <span v-if="row.workspaceTags.length === 0" class="no-tag">--</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.chromeStatus)" size="small">
            {{ statusLabel(row.chromeStatus) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="所在窗口" width="90" align="center" prop="windowId">
        <template #default="{ row }">
          <span class="time-text">窗口 {{ row.windowId }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <el-tooltip content="切换到该标签页" placement="top">
            <el-button size="small" text type="primary" @click="handleSwitchToTab(row as TabRow)">
              <el-icon><View /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="关闭标签页" placement="top">
            <el-button size="small" text type="danger" @click="handleCloseTab(row.chromeTabId)">
              <el-icon><Close /></el-icon>
            </el-button>
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 + 统计 -->
    <div class="table-footer">
      <span class="footer-text">
        共 {{ filteredTabs.length }} 个标签页
        <template v-if="selectedTabs.length > 0">，已选 {{ selectedTabs.length }} 个</template>
      </span>
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="filteredTabs.length"
        layout="prev, pager, next"
        type="small"
        background
      />
    </div>

    <!-- 创建工作组对话框 -->
    <el-dialog
      v-model="dialogVisible"
      title="创建工作组"
      width="560px"
      destroy-on-close
    >
      <el-form label-width="80px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="wsForm.name" placeholder="例如: 项目A开发" />
        </el-form-item>
        <el-form-item label="标识色">
          <el-color-picker v-model="wsForm.color" :predefine="presetColors" />
        </el-form-item>
        <el-form-item label="选中标签页">
          <div class="tab-selector">
            <div v-for="tab in selectedTabs" :key="tab.chromeTabId" class="tab-checkbox-item">
              <img
                v-if="tab.favIconUrl"
                :src="tab.favIconUrl"
                class="tab-favicon"
                @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
              />
              <div v-else class="tab-favicon-placeholder" />
              <span class="tab-checkbox-title" :title="tab.title">{{ tab.title || '(无标题)' }}</span>
            </div>
            <el-empty v-if="selectedTabs.length === 0" :image-size="40" description="请在表格中选择标签页" />
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreateWorkspace">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 加入现有工作组对话框 -->
    <el-dialog
      v-model="addToWsDialogVisible"
      title="加入现有工作组"
      width="500px"
      destroy-on-close
    >
      <el-form label-width="80px" label-position="left">
        <el-form-item label="目标工作组" required>
          <el-select v-model="addToWsTargetId" placeholder="请选择工作组" style="width: 100%">
            <el-option
              v-for="ws in availableWorkspaces"
              :key="ws.id"
              :label="ws.name"
              :value="ws.id"
            >
              <span class="ws-option">
                <span class="ws-color-dot" :style="{ backgroundColor: ws.color }" />
                <span>{{ ws.name }}</span>
                <el-tag size="small" type="info" style="margin-left: auto">{{ ws.tabs.length }} 个标签页</el-tag>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="选中标签页">
          <div class="tab-selector">
            <div v-for="tab in selectedTabs" :key="tab.chromeTabId" class="tab-checkbox-item">
              <img
                v-if="tab.favIconUrl"
                :src="tab.favIconUrl"
                class="tab-favicon"
                @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
              />
              <div v-else class="tab-favicon-placeholder" />
              <span class="tab-checkbox-title" :title="tab.title">{{ tab.title || '(无标题)' }}</span>
            </div>
            <el-empty v-if="selectedTabs.length === 0" :image-size="40" description="请在表格中选择标签页" />
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="addToWsDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="addingToWs" :disabled="!addToWsTargetId" @click="handleAddToWorkspace">
          加入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, Refresh, Close, View, Plus, FolderAdd } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '../../shared/composables/useMessage'
import type { WorkspaceTabsSummaryData, WorkspaceTabPayload, Workspace, WorkspacesData } from '../../shared/types'

/** 扩展的标签页行数据 */
interface TabRow {
  chromeTabId: number
  url: string
  title: string
  favIconUrl: string
  windowId: number
  chromeStatus: string
  /** Chrome 最后激活时间（毫秒时间戳，来自 chrome.tabs.Tab.lastAccessed） */
  lastAccessedAt: number
  workspaceTags: Array<{ workspaceId: string; workspaceName: string; workspaceColor: string }>
}

const searchKeyword = ref('')
const windowFilter = ref<number | ''>('')
const allTabs = ref<TabRow[]>([])
const selectedTabs = ref<TabRow[]>([])
const loading = ref(true)
const currentPage = ref(1)
const pageSize = 25

// 对话框
const dialogVisible = ref(false)
const saving = ref(false)
const wsForm = ref({ name: '', color: '#409EFF' })

// 加入现有工作组对话框
const addToWsDialogVisible = ref(false)
const addingToWs = ref(false)
const addToWsTargetId = ref('')
const availableWorkspaces = ref<Workspace[]>([])

const presetColors = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C',
  '#909399', '#00BCD4', '#9C27B0', '#FF5722',
]

// 工作组的 URL → workspace 映射
const urlToWorkspaceMap = ref<Map<string, Array<{ workspaceId: string; workspaceName: string; workspaceColor: string }>>>(new Map())

/** 所有窗口 ID 列表 */
const windowIds = computed(() => {
  const ids = new Set(allTabs.value.map(t => t.windowId))
  return Array.from(ids).sort((a, b) => a - b)
})

/** 筛选后的标签页 */
const filteredTabs = computed(() => {
  let tabs = allTabs.value
  if (windowFilter.value !== '') {
    tabs = tabs.filter(t => t.windowId === windowFilter.value)
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    tabs = tabs.filter(t => t.title.toLowerCase().includes(kw) || t.url.toLowerCase().includes(kw))
  }
  return tabs
})

/** 分页后的标签页 */
const pagedTabs = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredTabs.value.slice(start, start + pageSize)
})

onMounted(() => {
  loadTabs()
})

async function loadTabs() {
  loading.value = true
  try {
    // 并行加载浏览器标签页和工作组摘要
    const [chromeTabs, summaryRes] = await Promise.all([
      chrome.tabs.query({}),
      sendMessage<WorkspaceTabsSummaryData>({ action: 'GET_WORKSPACE_TABS_SUMMARY' }),
    ])

    // 构建 URL → workspace 映射
    const urlMap = new Map<string, Array<{ workspaceId: string; workspaceName: string; workspaceColor: string }>>()
    if (summaryRes.success && summaryRes.data) {
      for (const summary of summaryRes.data.summaries) {
        for (const tab of summary.tabs) {
          if (!tab.url) continue
          const existing = urlMap.get(tab.url) || []
          existing.push({
            workspaceId: summary.workspaceId,
            workspaceName: summary.workspaceName,
            workspaceColor: summary.workspaceColor,
          })
          urlMap.set(tab.url, existing)
        }
      }
    }
    urlToWorkspaceMap.value = urlMap

    // 构建标签页行数据
    allTabs.value = chromeTabs.map(tab => {
      const url = tab.url || tab.pendingUrl || ''
      return {
        chromeTabId: tab.id ?? 0,
        url,
        title: tab.title || '',
        favIconUrl: tab.favIconUrl || '',
        windowId: tab.windowId ?? 0,
        chromeStatus: tab.status || 'complete',
        lastAccessedAt: tab.lastAccessed ?? 0,
        workspaceTags: urlMap.get(url) || [],
      }
    })
  } catch (err) {
    ElMessage.error('加载标签页失败: ' + String(err))
  }
  loading.value = false
  currentPage.value = 1
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
  }, 300)
}

function handleFilterChange() {
  currentPage.value = 1
}

function handleSelectionChange(rows: TabRow[]) {
  selectedTabs.value = rows
}

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'complete') return 'success'
  if (status === 'loading') return 'warning'
  return 'info'
}

function statusLabel(status: string): string {
  if (status === 'unloaded') return '已冻结' // '未加载'
  if (status === 'loading') return '加载中'
  if (status === 'complete') return '已加载'
  return status || '未知'
}

/** 格式化时间（支持 ISO 字符串或毫秒时间戳） */
function formatTime(value: string | number): string {
  if (!value) return '--'
  const d = typeof value === 'number' ? new Date(value) : new Date(value)
  if (isNaN(d.getTime())) return '--'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  // 1 分钟内：刚刚
  if (diffMin < 1) return '刚刚'
  // 1 小时内：X分钟前
  if (diffMin < 60) return `${diffMin}分钟前`
  // 今天：HH:mm
  if (isSameDay(d, now)) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  // 昨天：昨天 HH:mm
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(d, yesterday)) {
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  // 今年内：MM-DD HH:mm
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  // 跨年：YYYY-MM-DD
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 生成 tooltip 用的完整 ISO 时间字符串 */
function lastAccessedTip(row: TabRow): string {
  if (!row.lastAccessedAt) return ''
  return new Date(row.lastAccessedAt).toLocaleString()
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/** 切换到指定标签页 */
async function handleSwitchToTab(row: TabRow) {
  try {
    await chrome.tabs.update(row.chromeTabId, { active: true })
    await chrome.windows.update(row.windowId, { focused: true })
  } catch {
    ElMessage.warning('标签页可能已被关闭')
  }
}

/** 关闭单个标签页 */
async function handleCloseTab(chromeTabId: number) {
  try {
    await chrome.tabs.remove(chromeTabId)
    ElMessage.success('标签页已关闭')
    await loadTabs()
  } catch {
    ElMessage.warning('关闭失败，标签页可能已被关闭')
  }
}

/** 批量关闭 */
async function handleBatchClose() {
  if (selectedTabs.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定要关闭选中的 ${selectedTabs.value.length} 个标签页吗？`,
      '批量关闭',
      { type: 'warning' },
    )
  } catch {
    return
  }
  const ids = selectedTabs.value.map(t => t.chromeTabId)
  try {
    await chrome.tabs.remove(ids)
    ElMessage.success(`已关闭 ${ids.length} 个标签页`)
    selectedTabs.value = []
    await loadTabs()
  } catch {
    ElMessage.warning('部分标签页关闭失败')
  }
}

/** 显示创建工作组对话框 */
function showCreateWorkspaceDialog() {
  wsForm.value = { name: '', color: '#409EFF' }
  dialogVisible.value = true
}

/** 显示加入现有工作组对话框 */
async function showAddToWorkspaceDialog() {
  addToWsTargetId.value = ''
  addToWsDialogVisible.value = true
  // 加载工作组列表
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES' })
  if (res.success && res.data) {
    availableWorkspaces.value = res.data.workspaces
  } else {
    ElMessage.warning(res.error || '获取工作组列表失败')
  }
}

/** 将选中标签页加入指定工作组 */
async function handleAddToWorkspace() {
  if (!addToWsTargetId.value) {
    ElMessage.warning('请选择目标工作组')
    return
  }
  if (selectedTabs.value.length === 0) {
    ElMessage.warning('请选择至少一个标签页')
    return
  }

  addingToWs.value = true
  const tabs: WorkspaceTabPayload[] = selectedTabs.value.map(t => ({
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    chromeTabId: t.chromeTabId,
  }))

  const res = await sendMessage<{ added: number; skipped: number }>({
    action: 'ADD_TABS_TO_WORKSPACE',
    payload: {
      workspaceId: addToWsTargetId.value,
      tabs,
    },
  })

  addingToWs.value = false
  if (res.success) {
    const data = res.data
    if (data && data.added === 0 && (data.skipped ?? 0) > 0) {
      ElMessage.info('所选标签页均已存在于该工作组中')
    } else {
      ElMessage.success(`已将 ${data?.added ?? tabs.length} 个标签页加入工作组`)
    }
    addToWsDialogVisible.value = false
    selectedTabs.value = []
    // 询问是否关闭已保存的标签页
    try {
      await ElMessageBox.confirm(
        `已加入工作组，是否关闭这 ${tabs.length} 个标签页？`,
        '关闭标签页',
        { confirmButtonText: '关闭', cancelButtonText: '保留', type: 'info' },
      )
      const tabIds = tabs.map(t => t.chromeTabId)
      try {
        await chrome.tabs.remove(tabIds)
      } catch { /* ignore */ }
      await loadTabs()
    } catch {
      await loadTabs() // 刷新以显示新的 tag
    }
  } else {
    ElMessage.error(res.error || '加入失败')
  }
}

/** 创建工作组 */
async function handleCreateWorkspace() {
  if (!wsForm.value.name.trim()) {
    ElMessage.warning('请输入工作组名称')
    return
  }
  if (selectedTabs.value.length === 0) {
    ElMessage.warning('请选择至少一个标签页')
    return
  }

  saving.value = true
  const tabs: WorkspaceTabPayload[] = selectedTabs.value.map(t => ({
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    chromeTabId: t.chromeTabId,
  }))

  const res = await sendMessage<{ workspace: any }>({
    action: 'CREATE_WORKSPACE',
    payload: {
      name: wsForm.value.name.trim(),
      color: wsForm.value.color,
      tabs,
    },
  })

  saving.value = false
  if (res.success) {
    ElMessage.success('工作组已创建')
    dialogVisible.value = false
    selectedTabs.value = []
    // 询问是否关闭已保存的标签页
    try {
      await ElMessageBox.confirm(
        `工作组"${wsForm.value.name}"已创建，是否关闭这 ${tabs.length} 个标签页？`,
        '关闭标签页',
        { confirmButtonText: '关闭', cancelButtonText: '保留', type: 'info' },
      )
      // selectedTabs 已被清空，使用之前的数据
      const tabIds = tabs.map(t => t.chromeTabId)
      try {
        await chrome.tabs.remove(tabIds)
      } catch { /* ignore */ }
      await loadTabs()
    } catch {
      // 用户选择保留
      await loadTabs() // 刷新以显示新的 tag
    }
  } else {
    ElMessage.error(res.error || '创建失败')
  }
}

/** 点击工作组 tag，切换到工作组视图 */
function switchToWorkspaces(workspaceId: string) {
  // 通知 Dashboard 切换 tab
  window.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'workspaces', workspaceId } }))
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

.workspace-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.no-tag {
  color: #c0c4cc;
  font-size: 12px;
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

/* 对话框内标签页选择器 */
.tab-selector {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px;
  width: 100%;
}

.tab-checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

.tab-checkbox-title {
  max-width: 350px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

/* 加入工作组选择器 */
.ws-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.ws-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
