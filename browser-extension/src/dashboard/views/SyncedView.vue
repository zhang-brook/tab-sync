<template>
  <div class="synced-view">
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索标题或网址"
        clearable
        class="search-input"
        @input="applySearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="toolbar-spacer" />
      <span class="total-count">共 {{ filtered.length }} 个已同步标签页</span>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div v-if="loading" class="empty-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>
    <div v-else-if="filtered.length === 0" class="empty-state">
      <el-empty :description="searchKeyword ? '没有匹配的标签页' : '云端还没有同步的标签页'" />
    </div>

    <div v-else class="tab-scroll">
      <div v-for="item in filtered" :key="item.workspaceId + '-' + item.tab.tabId" class="synced-item">
        <img v-if="item.tab.favIconUrl" :src="item.tab.favIconUrl" class="favicon" alt="" />
        <div class="main" @click="openTab(item.tab.url)">
          <div class="title">{{ item.tab.title || item.tab.url }}</div>
          <div class="url">{{ item.tab.url }}</div>
        </div>
        <el-tag
          size="small"
          effect="plain"
          class="ws-chip"
          :style="{ borderColor: item.color, color: item.color }"
        >{{ item.name }}</el-tag>
        <el-button class="row-action" text :icon="Close" title="从该工作组移除" @click="remove(item)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Close, Loading } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import type { TabReference } from '@/shared/types/workspace'
import type { WorkspacesData } from '@/shared/types/messages'

interface SyncedItem {
  workspaceId: string
  name: string
  color: string
  tab: TabReference
}

const loading = ref(false)
const searchKeyword = ref('')
const items = ref<SyncedItem[]>([])
const filtered = ref<SyncedItem[]>([])

async function load() {
  loading.value = true
  try {
    const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES' })
    if (res.success && res.data) {
      const list: SyncedItem[] = []
      for (const ws of res.data.workspaces) {
        for (const tab of ws.tabs) {
          list.push({ workspaceId: ws.id, name: ws.name, color: ws.color, tab })
        }
      }
      items.value = list
      applySearch()
    } else if (res.authError) {
      items.value = []
      filtered.value = []
    } else {
      ElMessage.error(res.error || '获取已同步标签页失败')
    }
  } finally {
    loading.value = false
  }
}

function applySearch() {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) {
    filtered.value = items.value
    return
  }
  filtered.value = items.value.filter(
    (i) =>
      i.tab.title?.toLowerCase().includes(kw) || i.tab.url?.toLowerCase().includes(kw),
  )
}

function openTab(url?: string) {
  if (url) chrome.tabs.create({ url })
}

async function remove(item: SyncedItem) {
  try {
    const res = await sendMessage({ action: 'REMOVE_WORKSPACE_TAB', payload: {
      workspaceId: item.workspaceId,
      tabId: item.tab.tabId,
    } })
    if (res.success) {
      ElMessage.success('已移除')
      await load()
    } else if (res.authError) {
      ElMessage.warning('未连接到后端')
    } else {
      ElMessage.error(res.error || '移除失败')
    }
  } catch (e) {
    ElMessage.error('移除失败：' + (e as Error).message)
  }
}

onMounted(load)
</script>

<style scoped>
.synced-view {
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
.search-input {
  width: 320px;
}
.toolbar-spacer {
  flex: 1;
}
.total-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
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
.tab-scroll {
  flex: 1;
  overflow-y: auto;
}
.synced-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
}
.synced-item:hover {
  background: var(--el-fill-color-light);
}
.main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.url {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.favicon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
}
.ws-chip {
  flex-shrink: 0;
}
</style>
