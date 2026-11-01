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
      <CloudTabListPanel
        v-model:page="page"
        v-model:page-size="pageSize"
        v-model:sort-mode="sortMode"
        v-model:sort-asc="sortAsc"
        :items="items"
        :total="total"
        :loading="loading"
        :workspaces="workspaces"
        :empty-description="emptyDescription"
        :total-text="`共 ${total} 个已同步标签页`"
        show-open-workspace
        @refresh="load"
        @open-workspace="openWorkspace"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Refresh } from '@element-plus/icons-vue'
import CloudTabListPanel from '../components/CloudTabListPanel.vue'
import { listSyncedTabs, listWorkspaces, reportServiceError } from '@/shared/services'
import type { CloudTabListItem, CloudTabSortMode } from '@/shared/types/tab-list'
import type { Workspace } from '@/shared/types'

const router = useRouter()

const loading = ref(false)
const searchKeyword = ref('')
const items = ref<CloudTabListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const sortMode = ref<CloudTabSortMode>('createdAt')
const sortAsc = ref(false)
/** 仅用于属性弹窗展示标签页所属工作组的完整路径 */
const workspaces = ref<Workspace[]>([])

const emptyDescription = computed(() =>
  searchKeyword.value ? '没有匹配的标签页' : '云端还没有同步的标签页',
)

// 点击「查询」或回车：回到第一页后重新拉取（服务端搜索）
function onSearch() {
  if (page.value === 1) void load()
  else page.value = 1
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
      // 创建时间取标签页的添加时间，与列表行展示的时间一致
      sort: sortMode.value,
      order: sortAsc.value ? 'asc' : 'desc',
    })
    // 移除末页最后一条后当前页可能已不存在，回退到最后一页重新加载
    const maxPage = Math.max(1, Math.ceil(data.total / pageSize.value))
    if (page.value > maxPage) {
      page.value = maxPage
      return
    }
    items.value = data.items.map((it) => ({
      id: `${it.workspaceId}-${it.tab.tabId}`,
      title: it.tab.displayName || it.tab.title || it.tab.url,
      originalTitle: it.tab.displayName ? it.tab.title : undefined,
      url: it.tab.url,
      favIconUrl: it.tab.favIconUrl,
      badgeText: it.name,
      badgeColor: it.color,
      badgeKey: it.workspaceId,
      tags: (it.tab.tags ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
      description: it.tab.description,
      addedAt: it.tab.addedAt,
      workspaceId: it.workspaceId,
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

function openWorkspace(workspaceId: string) {
  void router.push({ path: '/workspaces', query: { workspaceId } })
}

// 翻页、调整每页行数或切换排序后按新的查询参数重新拉取（服务端分页与排序）
watch([page, pageSize, sortMode, sortAsc], () => void load())

onMounted(() => {
  void load()
  void listWorkspaces({ includeSystem: true })
    .then((list) => {
      workspaces.value = list
    })
    .catch(() => {
      workspaces.value = []
    })
})
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
</style>
