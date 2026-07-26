<template>
  <div class="history-view">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索已关闭的标签页..."
        clearable
        style="width: 280px"
        :prefix-icon="Search"
        @input="handleSearch"
      />
      <el-button @click="loadHistory">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <!-- 历史记录列表 -->
    <el-table
      v-loading="loading"
      :data="closedTabs"
      stripe
      border
      style="width: 100%"
    >
      <el-table-column label="标签页" min-width="360">
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

      <el-table-column label="打开时间" width="170">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.openedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="关闭时间" width="170">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.closedAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="100" align="center" fixed="right">
        <template #default="{ row }">
          <el-tooltip content="重新打开" placement="top">
            <el-button size="small" text type="primary" @click="handleReopenTab(row.url)">
              <el-icon><RefreshRight /></el-icon>
              打开
            </el-button>
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <!-- 底部统计 -->
    <div class="table-footer">
      <span class="footer-text">共 {{ closedTabs.length }} 条已关闭记录</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, Refresh, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { sendMessage } from '../../shared/composables/useMessage'
import type { TabRecord, TabsData } from '../../shared/types'

const searchKeyword = ref('')
const closedTabs = ref<TabRecord[]>([])
const loading = ref(true)

/** 搜索防抖定时器 */
let searchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  loadHistory()
})

async function loadHistory() {
  loading.value = true
  const payload: Record<string, string> = { status: 'closed' }
  if (searchKeyword.value.trim()) {
    payload.search = searchKeyword.value.trim()
  }

  const res = await sendMessage<TabsData>({ action: 'GET_TABS', payload })
  if (res.success && res.data) {
    // 按关闭时间倒序排列
    closedTabs.value = res.data.tabs.sort((a, b) => {
      const timeA = a.closedAt ? new Date(a.closedAt).getTime() : 0
      const timeB = b.closedAt ? new Date(b.closedAt).getTime() : 0
      return timeB - timeA
    })
  }
  loading.value = false
}

function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadHistory()
  }, 300)
}

/** 重新打开标签页 */
async function handleReopenTab(url: string) {
  await sendMessage({ action: 'REOPEN_TAB', payload: { url } })
  ElMessage.success('标签页已重新打开')
}

/** 格式化时间 */
function formatTime(iso: string | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.history-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
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
  padding: 8px 0;
}

.footer-text {
  font-size: 13px;
  color: #909399;
}
</style>
