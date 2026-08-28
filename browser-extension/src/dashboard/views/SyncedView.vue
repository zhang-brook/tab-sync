<template>
  <div class="synced-view">
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索标题或网址"
        clearable
        class="search-input"
        @keyup.enter="onSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
      <div class="toolbar-spacer" />
      <span class="total-count">共 {{ total }} 个已同步标签页</span>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div v-if="loading" class="empty-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>
    <div v-else-if="items.length === 0" class="empty-state">
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
            type="danger"
            :icon="Delete"
            title="移动到回收站"
            :loading="(item as any).source.removing"
            @click="remove((item as any).source)"
          >删除</el-button>
        </template>
      </TabList>
    </div>

    <div class="pagination">
      <el-pagination
        layout="prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPageChange"
        :disabled="total <= pageSize"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import TabList, { type TabListItem } from '@/shared/components/TabList.vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Search, Refresh, Delete, Loading } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import { openTabAfterActive } from '@/shared/utils/tab-utils'
import type { TabReference } from '@/shared/types/workspace'
import type { SyncedTabPageData } from '@/shared/types/messages'

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
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

interface SyncedListItem extends TabListItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: SyncedItem
}

/** 已同步标签页 → 公共列表组件数据 */
const listItems = computed<SyncedListItem[]>(() =>
  items.value.map((i) => ({
    id: `${i.workspaceId}-${i.tab.tabId}`,
    title: i.tab.title || i.tab.url,
    url: i.tab.url,
    favIconUrl: i.tab.favIconUrl,
    badgeText: i.name,
    badgeColor: i.color,
    source: i,
  })),
)

// 点击「查询」或回车：回到第一页后重新拉取（服务端搜索）
function onSearch() {
  page.value = 1
  void load()
}

async function load() {
  loading.value = true
  try {
    // 「已同步标签页」页改用专门的聚合分页接口（GET_SYNCED_TABS），直接跨所有工作组扁平返回，
    // 无需先取工作组树再拍平；搜索与分页均在服务端完成。
    const res = await sendMessage<SyncedTabPageData>({
      action: 'GET_SYNCED_TABS',
      payload: {
        page: page.value,
        pageSize: pageSize.value,
        keyword: searchKeyword.value.trim(),
        includeSystem: true,
      },
    })
    if (res.success && res.data) {
      items.value = res.data.items.map((it) => ({
        workspaceId: it.workspaceId,
        name: it.name,
        color: it.color,
        tab: it.tab,
      }))
      total.value = res.data.total
    } else if (res.authError) {
      items.value = []
      total.value = 0
    } else {
      ElMessage.error(res.error || '获取已同步标签页失败')
    }
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  void load()
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
.pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}
</style>
