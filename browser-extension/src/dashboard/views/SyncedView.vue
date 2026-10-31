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
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <!-- 列表内容统一放在白色块中 -->
    <div class="list-pane">
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
          :menu-items="tabMenu"
          @click="onTabClick"
          @command="onCommand"
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
        <span class="total-count">共 {{ total }} 个已同步标签页</span>
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

    <CloudTabDialogs v-model:mode="tabDialogMode" :target="tabDialogTarget" @saved="load" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import TabList, { type TabListItem } from '@/shared/components/TabList.vue'
import CloudTabDialogs, { type CloudTabDialogMode } from '@/shared/components/CloudTabDialogs.vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Search, Refresh, Delete, Loading } from '@element-plus/icons-vue'
import { openTabAfterActive } from '@/shared/utils/tab-utils'
import { copyText } from '@/shared/utils/clipboard'
import { syncedTabMenu } from '@/shared/actions/tab-actions'
import { listSyncedTabs, removeWorkspaceTab, reportServiceError } from '@/shared/services'
import type { TabReference } from '@/shared/types/workspace'

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

const tabMenu = syncedTabMenu()

const tabDialogMode = ref<CloudTabDialogMode | null>(null)
const tabDialogTarget = ref<{ workspaceId: string; tab: TabReference } | null>(null)

/** 已同步标签页 → 公共列表组件数据 */
const listItems = computed<SyncedListItem[]>(() =>
  items.value.map((i) => ({
    id: `${i.workspaceId}-${i.tab.tabId}`,
    title: i.tab.displayName || i.tab.title || i.tab.url,
    originalTitle: i.tab.displayName ? i.tab.title : undefined,
    url: i.tab.url,
    favIconUrl: i.tab.favIconUrl,
    badgeText: i.name,
    badgeColor: i.color,
    tags: (i.tab.tags ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    description: i.tab.description,
    addedAt: i.tab.addedAt,
    source: i,
  })),
)

function findItem(item: TabListItem): SyncedItem | undefined {
  return items.value.find((i) => `${i.workspaceId}-${i.tab.tabId}` === String(item.id))
}

function onTabClick(item: TabListItem) {
  const target = findItem(item)
  if (target?.tab.url) void openTabAfterActive(target.tab.url)
}

function onCommand(command: string, item: TabListItem) {
  const target = findItem(item)
  if (!target) return
  switch (command) {
    case 'open':
      if (target.tab.url) void openTabAfterActive(target.tab.url)
      return
    case 'copyTitle':
      void copyTitle(target.tab)
      return
    case 'copyLink':
      void copyLink(target.tab.url)
      return
    case 'openWorkspace':
      void router.push({ path: '/workspaces', query: { workspaceId: target.workspaceId } })
      return
    case 'remove':
      void remove(target)
      return
    default:
      tabDialogTarget.value = { workspaceId: target.workspaceId, tab: target.tab }
      tabDialogMode.value = command as CloudTabDialogMode
  }
}

async function copyTitle(tab: TabReference) {
  const ok = await copyText(tab.displayName || tab.title || tab.url)
  if (ok) ElMessage.success('标题已复制')
  else ElMessage.error('复制失败')
}

async function copyLink(url: string) {
  const ok = await copyText(url)
  if (ok) ElMessage.success('链接已复制')
  else ElMessage.error('复制失败')
}

// 点击「查询」或回车：回到第一页后重新拉取（服务端搜索）
function onSearch() {
  page.value = 1
  void load()
}

async function load() {
  loading.value = true
  try {
    // 「已同步标签页」页改用专门的聚合分页接口，直接跨所有工作组扁平返回，
    // 无需先取工作组树再拍平；搜索与分页均在服务端完成。
    const data = await listSyncedTabs({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value.trim(),
      includeSystem: true,
    })
    items.value = data.items.map((it) => ({
      workspaceId: it.workspaceId,
      name: it.name,
      color: it.color,
      tab: it.tab,
    }))
    total.value = data.total
  } catch (err) {
    items.value = []
    total.value = 0
    reportServiceError(err, { fallback: '获取已同步标签页失败' })
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  void load()
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
    await removeWorkspaceTab(item.workspaceId, item.tab.tabId)
    ElNotification({
      title: '已移至回收站',
      message: `「${item.tab.title || item.tab.url}」已移动到回收站，可前往回收站恢复或彻底删除`,
      type: 'success',
      duration: 3500,
      onClick: () => router.push('/recyclebin'),
    })
    await load()
  } catch (err) {
    reportServiceError(err, { fallback: '移除失败' })
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
  gap: 16px;
  height: 100%;
  box-sizing: border-box;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
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
.list-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
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
  min-height: 0;
  overflow-y: auto;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}
.pagination .total-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
