<template>
  <div class="tab-list-panel">
    <div class="filter-row">
      <div class="sort-row">
        <span class="sort-label">排序</span>
        <div class="sort-toggle">
          <button
            v-if="showManualSort"
            type="button"
            class="sort-btn"
            :class="{ active: sortMode === 'manual' }"
            title="按工作组内的手动排序（可拖拽调整）"
            @click="onSortClick('manual')"
          >默认顺序</button>
          <button
            type="button"
            class="sort-btn"
            :class="{ active: sortMode === 'name' }"
            title="再次点击切换 A-Z / Z-A"
            @click="onSortClick('name')"
          >
            按名称
            <el-icon v-if="sortMode === 'name'" class="sort-dir">
              <SortUp v-if="sortAsc" />
              <SortDown v-else />
            </el-icon>
          </button>
          <button
            type="button"
            class="sort-btn"
            :class="{ active: sortMode === 'createdAt' }"
            title="再次点击切换创建时间升序 / 降序"
            @click="onSortClick('createdAt')"
          >
            按创建时间
            <el-icon v-if="sortMode === 'createdAt'" class="sort-dir">
              <SortUp v-if="sortAsc" />
              <SortDown v-else />
            </el-icon>
          </button>
          <button
            type="button"
            class="sort-btn"
            :class="{ active: sortMode === 'updatedAt' }"
            title="再次点击切换修改时间升序 / 降序"
            @click="onSortClick('updatedAt')"
          >
            按修改时间
            <el-icon v-if="sortMode === 'updatedAt'" class="sort-dir">
              <SortUp v-if="sortAsc" />
              <SortDown v-else />
            </el-icon>
          </button>
        </div>
      </div>
      <el-radio-group class="scheme-filter" size="small" :model-value="scheme" @change="onSchemeChange">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="http">HTTP</el-radio-button>
        <el-radio-button value="https">HTTPS</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="loading" class="panel-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>
    <el-empty v-else-if="items.length === 0" class="panel-empty" :image-size="60" :description="emptyDescription" />

    <template v-else>
      <SelectionBar v-if="selectable && selectedIds.length > 0" :count="selectedIds.length" class="batch-bar">
        <el-button size="small" @click="openSelectedTabs">打开</el-button>
        <el-button size="small" @click="copySelectedLinks">复制链接</el-button>
        <el-button size="small" type="primary" @click="batchMoveVisible = true">移动到工作组</el-button>
        <el-button size="small" type="danger" plain @click="removeSelectedTabs">移除</el-button>
        <el-button size="small" text @click="toggleSelectAll">
          {{ allSelected ? '取消全选' : '全选本页' }}
        </el-button>
        <el-button size="small" text @click="selectedIds = []">取消选择</el-button>
      </SelectionBar>

      <div class="list-scroll">
        <TabList
          :items="items"
          :menu-items="menuItems"
          :selectable="selectable"
          :sortable="sortable"
          :selected="selectedIds"
          @update:selected="onSelectionChange"
          @sort="(list, evt) => emit('sort', list, evt)"
          @click="openItem"
          @command="onCommand"
        >
          <template #actions="{ item }">
            <el-button
              class="row-action"
              text
              type="danger"
              :icon="Delete"
              title="移动到回收站"
              :loading="removingIds.has(String(item.id))"
              @click="removeOne(item as CloudTabListItem)"
            >删除</el-button>
          </template>
        </TabList>
      </div>
    </template>

    <div v-if="total > 0" class="pagination">
      <span class="total-count">{{ totalText ?? `共 ${total} 个标签页` }}</span>
      <el-pagination
        layout="sizes, prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="pageSizes"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <CloudTabDialogs v-model:mode="dialogMode" :target="dialogTarget" @saved="requestRefresh" />
    <TabPropertiesDialog
      v-model="propertiesVisible"
      :tab="propertiesTarget?.tab ?? null"
      :workspace-path="propertiesPath"
    />
    <WorkspacePickerDialog
      v-model="batchMoveVisible"
      title="移动到工作组"
      :disabled-ids="batchMoveDisabledIds"
      @select="onBatchMove"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Delete, Loading, SortDown, SortUp } from '@element-plus/icons-vue'
import TabList from '@/shared/components/TabList.vue'
import SelectionBar from '@/shared/components/SelectionBar.vue'
import CloudTabDialogs, { type CloudTabDialogMode } from '@/shared/components/CloudTabDialogs.vue'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'
import TabPropertiesDialog from './TabPropertiesDialog.vue'
import { cloudTabMenu } from '@/shared/actions/tab-actions'
import { copyText } from '@/shared/utils/clipboard'
import { openTabAfterActive, openTabsAfterActive } from '@/shared/utils/tab-utils'
import { getWorkspacePath, type WorkspaceTreeNode } from '@/shared/utils/workspace-tree'
import {
  listWorkspaceTabs,
  moveWorkspaceTab,
  removeWorkspaceTab,
  reportServiceError,
} from '@/shared/services'
import type {
  CloudTabListItem,
  CloudTabSortMode,
  TabListItem,
  TabListSortEvent,
  TabSchemeFilter,
} from '@/shared/types/tab-list'
import type { Workspace } from '@/shared/types'

const props = withDefaults(
  defineProps<{
    /** 当前页的云端标签页行 */
    items: CloudTabListItem[]
    /** 全部行数（分页由父组件提供，服务端分页时也一致） */
    total: number
    page: number
    pageSize: number
    loading?: boolean
    /** 是否支持多选与批量操作 */
    selectable?: boolean
    /** 是否支持拖拽排序 */
    sortable?: boolean
    emptyDescription?: string
    /** 分页左侧的总数文案，默认「共 N 个标签页」 */
    totalText?: string
    pageSizes?: number[]
    /** 工作组树数据，用于属性弹窗展示完整路径 */
    workspaces?: Workspace[]
    /** 行菜单是否提供「打开工作组」 */
    showOpenWorkspace?: boolean
    /** 排序方式：名称 / 创建时间（标签页添加时间）/ 修改时间；manual 为组内手动顺序 */
    sortMode?: CloudTabSortMode
    /** 排序方向：true 为升序 */
    sortAsc?: boolean
    /** 是否提供「默认顺序」选项（工作组成员列表支持手动拖拽排序） */
    showManualSort?: boolean
    /** 协议筛选：空字符串不限，http/https 只保留对应协议 */
    scheme?: TabSchemeFilter
  }>(),
  {
    loading: false,
    selectable: true,
    sortable: false,
    emptyDescription: '暂无标签页',
    totalText: undefined,
    pageSizes: () => [20, 50, 100, 200],
    workspaces: undefined,
    showOpenWorkspace: false,
    sortMode: 'createdAt',
    sortAsc: false,
    showManualSort: false,
    scheme: '',
  },
)

const emit = defineEmits<{
  (e: 'update:page', page: number): void
  (e: 'update:pageSize', size: number): void
  (e: 'update:sortMode', mode: CloudTabSortMode): void
  (e: 'update:sortAsc', asc: boolean): void
  (e: 'update:scheme', scheme: TabSchemeFilter): void
  /** 数据已被修改，父组件需重新拉取 */
  (e: 'refresh'): void
  (e: 'sort', items: TabListItem[], evt: TabListSortEvent): void
  (e: 'openWorkspace', workspaceId: string): void
}>()

const router = useRouter()

const menuItems = computed(() => cloudTabMenu({ withOpenWorkspace: props.showOpenWorkspace }))

const selectedIds = ref<Array<string | number>>([])

const allSelected = computed(
  () => props.items.length > 0 && props.items.every((i) => selectedIds.value.includes(i.id)),
)

const selectedItems = computed(() => props.items.filter((i) => selectedIds.value.includes(i.id)))

// 选中项只保留当前页仍在展示的行；翻页后上一页的勾选随之失效
watch(
  () => props.items,
  (items) => {
    const existing = new Set(items.map((i) => i.id))
    selectedIds.value = selectedIds.value.filter((id) => existing.has(id))
  },
)

function onSelectionChange(keys: Array<string | number>) {
  selectedIds.value = keys
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? [] : props.items.map((i) => i.id)
}

const dialogMode = ref<CloudTabDialogMode | null>(null)
const dialogTarget = ref<{ workspaceId: string; tab: CloudTabListItem['tab'] } | null>(null)

const propertiesVisible = ref(false)
const propertiesTarget = ref<CloudTabListItem | null>(null)

const propertiesPath = computed(() => {
  const item = propertiesTarget.value
  if (!item || !props.workspaces?.some((w) => w.id === item.workspaceId)) return ''
  return getWorkspacePath(props.workspaces, item.workspaceId).fullPath
})

const batchMoveVisible = ref(false)
const batchMoveDisabledIds = computed(() => [...new Set(selectedItems.value.map((i) => i.workspaceId))])

const removingIds = ref<Set<string>>(new Set())

function setRemoving(id: string, removing: boolean) {
  const next = new Set(removingIds.value)
  if (removing) next.add(id)
  else next.delete(id)
  removingIds.value = next
}

/** 同一轮内的多次修改（如跨组移动会分别通知源/目标组）合并为一次刷新 */
let refreshQueued = false
function requestRefresh() {
  if (refreshQueued) return
  refreshQueued = true
  void Promise.resolve().then(() => {
    refreshQueued = false
    emit('refresh')
  })
}

function openItem(item: TabListItem) {
  const url = (item as CloudTabListItem).tab.url
  if (url) void openTabAfterActive(url)
}

async function copyToClipboard(text: string, successMsg: string) {
  const ok = await copyText(text)
  if (ok) ElMessage.success(successMsg)
  else ElMessage.error('复制失败')
}

function onCommand(command: string, item: TabListItem) {
  const target = item as CloudTabListItem
  switch (command) {
    case 'open':
      openItem(target)
      return
    case 'copyTitle':
      void copyToClipboard(target.tab.displayName || target.tab.title || target.tab.url, '标题已复制')
      return
    case 'copyLink':
      void copyToClipboard(target.tab.url, '链接已复制')
      return
    case 'openWorkspace':
      emit('openWorkspace', target.workspaceId)
      return
    case 'remove':
      void removeOne(target)
      return
    case 'properties':
      propertiesTarget.value = target
      propertiesVisible.value = true
      return
    default:
      dialogTarget.value = { workspaceId: target.workspaceId, tab: target.tab }
      dialogMode.value = command as CloudTabDialogMode
  }
}

async function removeOne(item: CloudTabListItem) {
  try {
    await ElMessageBox.confirm(
      `确定要将「${item.tab.title || item.tab.url}」移动到回收站吗？`,
      '移除标签页',
      { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }
  setRemoving(String(item.id), true)
  try {
    await removeWorkspaceTab(item.workspaceId, item.tab.tabId)
    ElNotification({
      title: '已移至回收站',
      message: `「${item.tab.title || item.tab.url}」已移动到回收站，可前往回收站恢复或彻底删除`,
      type: 'success',
      duration: 3500,
      onClick: () => router.push('/recyclebin'),
    })
    requestRefresh()
  } catch (err) {
    reportServiceError(err, { fallback: '移除失败' })
  } finally {
    setRemoving(String(item.id), false)
  }
}

function openSelectedTabs() {
  const urls = selectedItems.value.map((i) => i.tab.url).filter(Boolean)
  void openTabsAfterActive(urls)
}

async function copySelectedLinks() {
  const urls = selectedItems.value.map((i) => i.tab.url).filter(Boolean)
  await copyToClipboard(urls.join('\n'), `已复制 ${urls.length} 个链接`)
}

async function removeSelectedTabs() {
  const items = selectedItems.value
  if (items.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定将选中的 ${items.length} 个标签页移至回收站吗？`,
      '批量移除',
      { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  let ok = 0
  for (const item of items) {
    try {
      await removeWorkspaceTab(item.workspaceId, item.tab.tabId)
      ok++
    } catch {
      // 单个失败不阻断其余标签页
    }
  }
  if (ok > 0) {
    ElMessage.success(`已移除 ${ok} 个标签页`)
    selectedIds.value = []
    requestRefresh()
  }
}

/** 批量移动：依次将选中标签页追加到目标工作组末尾 */
async function onBatchMove(node: WorkspaceTreeNode) {
  const items = selectedItems.value
  if (items.length === 0) return
  let base = 0
  try {
    base = (await listWorkspaceTabs(node.id)).length
  } catch (err) {
    reportServiceError(err, { fallback: '获取目标工作组失败' })
    return
  }
  let ok = 0
  let fail = 0
  for (const item of items) {
    try {
      await moveWorkspaceTab(node.id, item.tab.tabId, base + ok)
      ok++
    } catch {
      fail++
    }
  }
  batchMoveVisible.value = false
  if (ok > 0) {
    ElMessage.success(`已移动 ${ok} 个标签页到「${node.name}」`)
    selectedIds.value = []
    requestRefresh()
  }
  if (fail > 0) ElMessage.error(`有 ${fail} 个标签页移动失败`)
}

/** 再次点击同一排序方式切换升降序；切换到新方式时名称默认 A-Z、时间默认最新在前 */
function onSortClick(mode: CloudTabSortMode) {
  if (props.sortMode === mode) {
    emit('update:sortAsc', !props.sortAsc)
  } else {
    emit('update:sortMode', mode)
    emit('update:sortAsc', mode === 'name')
  }
  emit('update:page', 1)
}

function onSchemeChange(value: string | number | boolean | undefined) {
  const next: TabSchemeFilter = value === 'http' || value === 'https' ? value : ''
  emit('update:scheme', next)
  emit('update:page', 1)
}

function onPageChange(page: number) {
  emit('update:page', page)
}

function onSizeChange(size: number) {
  emit('update:pageSize', size)
  emit('update:page', 1)
}
</script>

<style scoped>
.tab-list-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.sort-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sort-toggle {
  display: inline-flex;
}

.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}

.sort-btn:first-child {
  border-radius: 4px 0 0 4px;
}

.sort-btn + .sort-btn {
  border-left: none;
}

.sort-btn:last-child {
  border-radius: 0 4px 4px 0;
}

.sort-btn.active {
  color: #fff;
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.sort-btn:not(.active):hover {
  color: var(--el-color-primary);
}

.sort-dir {
  font-size: 12px;
}

.panel-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.panel-empty {
  flex: 1;
}

.batch-bar {
  flex-shrink: 0;
  margin-bottom: 4px;
}

.list-scroll {
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

.total-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
