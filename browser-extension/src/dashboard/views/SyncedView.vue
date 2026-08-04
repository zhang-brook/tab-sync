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
      <TabList
        :items="listItems"
        @click="(item: any) => openTab(item.source.tab.url)"
      >
        <template #actions="{ item }">
          <el-button
            class="row-action"
            text
            :icon="Close"
            title="移动到回收站"
            :loading="(item as any).source.removing"
            @click="remove((item as any).source)"
          />
        </template>
      </TabList>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import TabList, { type TabListItem } from '@/shared/components/TabList.vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Search, Refresh, Close, Loading } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import { openTabAfterActive } from '@/shared/utils/tab-utils'
import type { TabReference } from '@/shared/types/workspace'
import type { WorkspacesData } from '@/shared/types/messages'

interface SyncedItem {
  workspaceId: string
  name: string
  color: string
  tab: TabReference
  removing?: boolean
}

const router = useRouter()

const loading = ref(false)
const searchKeyword = ref('')
const items = ref<SyncedItem[]>([])
const filtered = ref<SyncedItem[]>([])

interface SyncedListItem extends TabListItem {
  source: SyncedItem
}

/** 已同步标签页 → 公共列表组件数据 */
const listItems = computed<SyncedListItem[]>(() =>
  filtered.value.map((i) => ({
    id: `${i.workspaceId}-${i.tab.tabId}`,
    title: i.tab.title || i.tab.url,
    url: i.tab.url,
    favIconUrl: i.tab.favIconUrl,
    badgeText: i.name,
    badgeColor: i.color,
    source: i,
  })),
)

async function load() {
  loading.value = true
  try {
    const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES', payload: { includeSystem: true } })
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

async function openTab(url?: string) {
  if (url) await openTabAfterActive(url)
}

async function remove(item: SyncedItem) {
  try {
    await ElMessageBox.confirm(
      `确定要将「${item.tab.title || item.tab.url}」移动到回收站吗？`,
      '移除标签页',
      { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return // 用户取消
  }
  item.removing = true
  try {
    const res = await sendMessage({ action: 'REMOVE_WORKSPACE_TAB', payload: {
      workspaceId: item.workspaceId,
      tabId: item.tab.tabId,
    } })
    if (res.success) {
      ElNotification({
        title: '已移至回收站',
        message: `「${item.tab.title || item.tab.url}」已移动到回收站，可前往回收站恢复或彻底删除`,
        type: 'success',
        duration: 3500,
        onClick: () => router.push('/recyclebin'),
      })
      await load()
    } else if (res.authError) {
      ElMessage.warning('未连接到后端')
    } else {
      ElMessage.error(res.error || '移除失败')
    }
  } catch (e) {
    ElMessage.error('移除失败：' + (e as Error).message)
  } finally {
    item.removing = false
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
</style>
