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
      <el-button :icon="Refresh" @click="onRefresh">刷新</el-button>
    </div>

    <div class="split-pane">
      <!-- 左侧：按根域名聚合的域名树，任意层级均可选中筛选 -->
      <div class="domain-pane">
        <div class="pane-title-row">
          <span class="pane-title">域名</span>
        </div>
        <el-tree
          ref="domainTreeRef"
          :data="domainTree"
          node-key="id"
          :props="domainTreeProps"
          :expand-on-click-node="false"
          highlight-current
          :default-expanded-keys="['all']"
          @node-click="onDomainClick"
        >
          <template #default="{ data }">
            <span class="domain-node">
              <span class="domain-name" :title="data.label">{{ data.label }}</span>
              <span class="domain-count">{{ data.count }}</span>
            </span>
          </template>
        </el-tree>
      </div>

      <!-- 右侧：标签页列表 -->
      <div class="list-pane">
        <CloudTabListPanel
          v-model:page="page"
          v-model:page-size="pageSize"
          v-model:sort-mode="sortMode"
          v-model:sort-asc="sortAsc"
          v-model:scheme="scheme"
          :items="items"
          :total="total"
          :loading="loading"
          :workspaces="workspaces"
          :empty-description="emptyDescription"
          :total-text="`共 ${total} 个已同步标签页`"
          show-open-workspace
          @refresh="onRefresh"
          @open-workspace="openWorkspace"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Refresh } from '@element-plus/icons-vue'
import CloudTabListPanel from '../components/CloudTabListPanel.vue'
import { listSyncedTabs, listTabHosts, listWorkspaces, reportServiceError } from '@/shared/services'
import { rootDomainOf } from '@/shared/utils/domain'
import type { CloudTabListItem, CloudTabSortMode, TabSchemeFilter } from '@/shared/types/tab-list'
import type { TabHostsData, Workspace } from '@/shared/types'

const router = useRouter()

const loading = ref(false)
const searchKeyword = ref('')
const items = ref<CloudTabListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const sortMode = ref<CloudTabSortMode>('createdAt')
const sortAsc = ref(false)
const scheme = ref<TabSchemeFilter>('')
/** 仅用于属性弹窗展示标签页所属工作组的完整路径 */
const workspaces = ref<Workspace[]>([])

const emptyDescription = computed(() =>
  searchKeyword.value ? '没有匹配的标签页' : '云端还没有同步的标签页',
)

// ============ 左侧域名树 ============

interface DomainTreeNode {
  /** all 表示全部；d: 根域名；h: 完整主机名 */
  id: string
  label: string
  count: number
  children?: DomainTreeNode[]
}

const domainTreeProps = { label: 'label', children: 'children' }
const domainTreeRef = ref()
const domainHosts = ref<TabHostsData['hosts']>([])
const domainTotal = ref(0)
/** 当前选中的域名节点，默认「(全部)」 */
const selectedDomain = ref('all')

/** 主机名按根域名归并：根域名节点下挂非根主机的子域名 */
const domainTree = computed<DomainTreeNode[]>(() => {
  const roots = new Map<string, { count: number; children: DomainTreeNode[] }>()
  for (const entry of domainHosts.value) {
    const root = rootDomainOf(entry.host)
    if (!root) continue
    let group = roots.get(root)
    if (!group) {
      group = { count: 0, children: [] }
      roots.set(root, group)
    }
    group.count += entry.count
    if (entry.host !== root) {
      group.children.push({ id: `h:${entry.host}`, label: entry.host, count: entry.count })
    }
  }
  const children = Array.from(roots.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([root, group]) => ({
      id: `d:${root}`,
      label: root,
      count: group.count,
      children: group.children.sort((a, b) => a.label.localeCompare(b.label)),
    }))
  return [{ id: 'all', label: '(全部)', count: domainTotal.value, children }]
})

async function loadHosts() {
  try {
    const data = await listTabHosts({
      scheme: scheme.value || undefined,
      keyword: searchKeyword.value.trim() || undefined,
    })
    domainHosts.value = data.hosts
    domainTotal.value = data.total
  } catch (err) {
    domainHosts.value = []
    domainTotal.value = 0
    reportServiceError(err, { fallback: '获取域名分布失败' })
  }
  ensureDomainSelection()
}

function findDomainNode(nodes: DomainTreeNode[], id: string): DomainTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = node.children ? findDomainNode(node.children, id) : undefined
    if (found) return found
  }
  return undefined
}

/** 域名树刷新后，选中项已不存在（如该域名下标签页被删完）时回到「(全部)」 */
function ensureDomainSelection() {
  if (!findDomainNode(domainTree.value, selectedDomain.value)) {
    selectedDomain.value = 'all'
    page.value = 1
  }
  void nextTick(() => domainTreeRef.value?.setCurrentKey(selectedDomain.value))
}

function onDomainClick(node: DomainTreeNode) {
  if (selectedDomain.value === node.id) return
  selectedDomain.value = node.id
  page.value = 1
}

/** 当前域名节点对应的服务端筛选参数 */
function domainFilter(): { domain?: string; exact?: boolean } {
  const value = selectedDomain.value
  if (value.startsWith('d:')) return { domain: value.slice(2), exact: false }
  if (value.startsWith('h:')) return { domain: value.slice(2), exact: true }
  return {}
}

// ============ 列表数据 ============

// 点击「查询」或回车：回到第一页后重新拉取（服务端搜索）
function onSearch() {
  if (page.value === 1) void load()
  else page.value = 1
  // 域名树计数与列表使用同一个关键字
  void loadHosts()
}

async function load() {
  loading.value = true
  try {
    // 「已同步标签页」页改用专门的聚合分页接口，直接跨所有工作组扁平返回，
    // 无需先取工作组树再拍平；搜索、筛选与分页均在服务端完成。
    const data = await listSyncedTabs({
      page: page.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value.trim(),
      includeSystem: true,
      scheme: scheme.value || undefined,
      ...domainFilter(),
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

/** 列表或域名树数据可能都已变化（刷新、面板内编辑） */
function onRefresh() {
  void load()
  void loadHosts()
}

function openWorkspace(workspaceId: string) {
  void router.push({ path: '/workspaces', query: { workspaceId } })
}

// 翻页、调整每页行数、切换排序/协议/域名后按新的查询参数重新拉取
watch([page, pageSize, sortMode, sortAsc, scheme, selectedDomain], () => void load())
// 协议筛选会改变域名树的计数与可见域名
watch(scheme, () => void loadHosts())

onMounted(() => {
  void load()
  void loadHosts()
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
.split-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}
.domain-pane {
  width: 280px;
  flex-shrink: 0;
  padding: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow-y: auto;
}
.pane-title-row {
  margin-bottom: 8px;
}
.pane-title {
  font-size: 13px;
  font-weight: 600;
  color: #909399;
}
.domain-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.domain-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.domain-count {
  font-size: 11px;
  color: #909399;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 0 6px;
}
.list-pane {
  flex: 1;
  min-width: 0;
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
