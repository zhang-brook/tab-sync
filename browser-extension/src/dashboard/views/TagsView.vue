<template>
  <div class="tags-view">
    <!-- 左侧：标签列表（按作用域分组） -->
    <div class="tags-left">
      <div class="left-header">
        <span class="left-title">标签</span>
        <div class="left-actions">
          <el-button
            size="small"
            text
            :icon="Refresh"
            :loading="tagsLoading"
            title="刷新"
            @click="refresh"
          />
          <el-tooltip content="新建标签" placement="top">
            <el-button size="small" text type="primary" @click="openCreate">
              <el-icon>
                <Plus />
              </el-icon>
              <span>新建</span>
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <el-input
        v-model="keyword"
        placeholder="搜索标签"
        size="small"
        clearable
        :prefix-icon="Search"
        class="tag-search"
      />

      <el-segmented
        v-model="scopeFilter"
        :options="scopeOptions"
        block
        class="scope-filter"
      />

      <div class="sort-row">
        <span class="sort-label">排序</span>
        <div class="sort-toggle">
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
            :class="{ active: sortMode === 'count' }"
            title="再次点击切换数量升序 / 降序"
            @click="onSortClick('count')"
          >
            按数量
            <el-icon v-if="sortMode === 'count'" class="sort-dir">
              <SortUp v-if="sortAsc" />
              <SortDown v-else />
            </el-icon>
          </button>
        </div>
      </div>

      <el-checkbox v-model="hideEmpty" size="small" class="hide-empty">
        隐藏数量为 0 的标签
      </el-checkbox>

      <div v-if="tagsLoading" class="left-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
      <el-empty
        v-else-if="visibleTags.length === 0"
        :description="
          keyword.trim()
            ? '没有匹配的标签'
            : hideEmpty
              ? '没有数量大于 0 的标签'
              : '该分类下还没有标签'
        "
        :image-size="60"
      />
      <div v-else class="tag-list">
        <div
          v-for="tag in visibleTabTags"
          :key="tag.id"
          class="tag-item"
          :class="{ active: selectedTag?.id === tag.id }"
          @click="selectTag(tag)"
        >
          <span class="tag-dot" :style="{ backgroundColor: normalizeColor(tag.color) }" />
          <span class="tag-name">{{ tag.name }}</span>
          <div class="tag-meta">
            <span class="tag-count" title="包含的标签页数">{{ tag.tabCount ?? 0 }}</span>
            <div class="tag-actions">
              <el-button
                class="tag-action"
                text
                size="small"
                :icon="Edit"
                title="编辑"
                @click.stop="openEdit(tag)"
              />
              <el-button
                class="tag-del"
                text
                size="small"
                :icon="Delete"
                title="删除"
                @click.stop="removeTag(tag)"
              />
            </div>
          </div>
        </div>

        <div
          v-for="tag in visibleWorkspaceTags"
          :key="tag.id"
          class="tag-item"
          :class="{ active: selectedTag?.id === tag.id }"
          @click="selectTag(tag)"
        >
          <span class="tag-dot" :style="{ backgroundColor: normalizeColor(tag.color) }" />
          <span class="tag-name">{{ tag.name }}</span>
          <div class="tag-meta">
            <span class="tag-count" title="包含的工作组数">{{ workspaceCountOf(tag.id) }}</span>
            <div class="tag-actions">
              <el-button
                class="tag-action"
                text
                size="small"
                :icon="Edit"
                title="编辑"
                @click.stop="openEdit(tag)"
              />
              <el-button
                class="tag-del"
                text
                size="small"
                :icon="Delete"
                title="删除"
                @click.stop="removeTag(tag)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧：标签页标签 → 标签页；工作组标签 → 工作组 -->
    <div class="tags-right">
      <div v-if="!selectedTag" class="right-empty">
        <el-empty description="选择左侧标签查看关联内容" />
      </div>

      <template v-else>
        <div class="right-header">
          <span class="right-title">
            <span class="tag-dot" :style="{ backgroundColor: normalizeColor(selectedTag.color) }" />
            {{ selectedTag.name }}
            <el-tag size="small" effect="plain" type="info">
              {{ selectedTag.scope === 'workspace' ? '工作组标签' : '标签页标签' }}
            </el-tag>
          </span>
          <span v-if="selectedTag.scope === 'workspace'" class="right-count">
            {{ taggedWorkspaces.length }} 个工作组
          </span>
        </div>

        <!-- 工作组标签 -->
        <template v-if="selectedTag.scope === 'workspace'">
          <el-empty
            v-if="taggedWorkspaces.length === 0"
            description="该标签下暂无工作组"
            :image-size="60"
          />
          <div v-else class="workspace-list">
            <div
              v-for="ws in taggedWorkspaces"
              :key="ws.id"
              class="workspace-item"
              :style="{ paddingLeft: `${10 + workspaceDepth(ws.id) * 16}px` }"
              @click="navigateToWorkspace(ws.id)"
            >
              <span class="tag-dot" :style="{ backgroundColor: normalizeColor(ws.color) }" />
              <div class="workspace-info">
                <div class="workspace-name">
                  {{ ws.name }}
                  <el-tag v-if="ws.isSystem" size="small" type="info" effect="plain">系统</el-tag>
                </div>
                <div v-if="ws.description" class="workspace-desc" :title="ws.description">
                  {{ ws.description }}
                </div>
                <div v-if="ws.tags?.length" class="workspace-tags">
                  <EntityTag v-for="t in ws.tags" :key="t.id" :tag="t" />
                </div>
              </div>
              <el-button
                text
                :icon="Delete"
                title="移除该标签"
                @click.stop="removeTagFromWorkspace(ws.id)"
              >移除</el-button>
            </div>
          </div>
        </template>

        <!-- 标签页标签：与「标签页」「工作组」页共用同一列表组件 -->
        <template v-else>
          <CloudTabListPanel
            v-model:page="tabPage"
            v-model:page-size="tabPageSize"
            v-model:sort-mode="tabSortMode"
            v-model:sort-asc="tabSortAsc"
            v-model:scheme="tabScheme"
            :items="pagedTagTabItems"
            :total="filteredTagTabItems.length"
            :loading="detailLoading"
            :workspaces="workspaces"
            :empty-description="tagTabEmptyDescription"
            :remove-tag-id="selectedTag.id"
            :show-tag-filter="false"
            show-open-workspace
            @refresh="onTagTabsRefresh"
            @open-workspace="navigateToWorkspace"
          />
        </template>
      </template>
    </div>

    <!-- 新建/编辑标签对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建标签' : '编辑标签'"
      width="380px"
    >
      <el-form label-width="64px">
        <el-form-item label="名称">
          <el-input v-model="tagForm.name" placeholder="标签名称" maxlength="32" show-word-limit />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="用途">
          <el-radio-group v-model="tagForm.scope">
            <el-radio value="tab">标签页</el-radio>
            <el-radio value="workspace">工作组</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-else label="用途">
          <span class="scope-readonly">
            {{ tagForm.scope === 'workspace' ? '工作组标签' : '标签页标签' }}
          </span>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker
            v-model="tagForm.color"
            color-format="hex"
            @active-change="onColorActiveChange"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="tagForm.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可选，仅当你填写时才会保存"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!tagForm.name.trim()" @click="submitTag">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Loading, Plus, Refresh, Search, SortDown, SortUp } from '@element-plus/icons-vue'
import CloudTabListPanel from '../components/CloudTabListPanel.vue'
import {
  deleteTag,
  listTagTabs,
  listTags,
  listWorkspaces,
  removeWorkspaceTag,
  createTag,
  updateTag,
  reportServiceError,
  type TagScope,
} from '@/shared/services'
import { DEFAULT_WORKSPACE_COLOR, normalizeColor } from '@/shared/constants/theme'
import { useDashboardNavigation } from '@/shared/composables/useDashboardNavigation'
import EntityTag from '@/shared/components/EntityTag.vue'
import type { TagInfo, TagTabItem, Workspace } from '@/shared/types'
import type { CloudTabListItem, CloudTabSortMode, TabSchemeFilter } from '@/shared/types/tab-list'

const route = useRoute()
const router = useRouter()
const { navigateToWorkspace } = useDashboardNavigation()

const tags = ref<TagInfo[]>([])
const workspaces = ref<Workspace[]>([])
const tagsLoading = ref(false)
const selectedTag = ref<TagInfo | null>(null)
const taggedTabs = ref<TagTabItem[]>([])
const detailLoading = ref(false)

const tabTags = computed(() => tags.value.filter((t) => t.scope === 'tab'))
const workspaceTags = computed(() => tags.value.filter((t) => t.scope === 'workspace'))

// 左侧筛选：标签页标签 / 工作组标签
const scopeFilter = ref<TagScope>('tab')
const scopeOptions: Array<{ label: string; value: TagScope }> = [
  { label: '标签页', value: 'tab' },
  { label: '工作组', value: 'workspace' },
]

type SortMode = 'name' | 'count'
const sortMode = ref<SortMode>('name')
// 名称默认 A-Z，数量默认多→少；再次点击当前排序项切换方向
const sortAsc = ref(true)
const hideEmpty = ref(false)
const keyword = ref('')

function onSortClick(mode: SortMode): void {
  if (sortMode.value === mode) {
    sortAsc.value = !sortAsc.value
    return
  }
  sortMode.value = mode
  sortAsc.value = mode === 'name'
}

const visibleTabTags = computed(() =>
  scopeFilter.value === 'tab' ? sortTags(tabTags.value) : [],
)
const visibleWorkspaceTags = computed(() =>
  scopeFilter.value === 'workspace' ? sortTags(workspaceTags.value) : [],
)
const visibleTags = computed(() => [...visibleTabTags.value, ...visibleWorkspaceTags.value])

// 当前排序项按方向排序；数量相同的项始终按名称升序兜底
function sortTags(list: TagInfo[]): TagInfo[] {
  const kw = keyword.value.trim().toLowerCase()
  // 关键字按名称模糊匹配（忽略大小写），与隐藏空标签筛选叠加生效
  const visible = list.filter(
    (tag) =>
      (!kw || tag.name.toLowerCase().includes(kw)) &&
      (!hideEmpty.value || tagCountOf(tag) > 0),
  )
  return [...visible].sort((a, b) => {
    const primary =
      sortMode.value === 'count'
        ? tagCountOf(a) - tagCountOf(b)
        : a.name.localeCompare(b.name, 'zh-CN', { /*numeric: true*/ })
    if (primary !== 0) return sortAsc.value ? primary : -primary
    return a.name.localeCompare(b.name, 'zh-CN', { /*numeric: true*/ })
  })
}

function tagCountOf(tag: TagInfo): number {
  return tag.scope === 'workspace' ? workspaceCountOf(tag.id) : (tag.tabCount ?? 0)
}

// 切换筛选后，若当前选中的标签不属于该分类，则清空右侧详情
watch(scopeFilter, (scope) => {
  const tag = selectedTag.value
  if (tag && tag.scope !== scope) {
    clearSelection()
  }
})
const taggedWorkspaces = computed(() =>
  selectedTag.value?.scope === 'workspace'
    ? workspaces.value.filter((w) => w.tags?.some((t) => t.id === selectedTag.value?.id))
    : [],
)

const workspaceCounts = computed(() => {
  const counts = new Map<number, number>()
  for (const ws of workspaces.value) {
    for (const t of ws.tags ?? []) counts.set(t.id, (counts.get(t.id) ?? 0) + 1)
  }
  return counts
})

function workspaceCountOf(tagId: number): number {
  return workspaceCounts.value.get(tagId) ?? 0
}

const workspaceDepthMap = computed(() => {
  const byId = new Map(workspaces.value.map((w) => [w.id, w]))
  const depths = new Map<string, number>()
  const depthOf = (id: string, seen: Set<string>): number => {
    const cached = depths.get(id)
    if (cached !== undefined) return cached
    const ws = byId.get(id)
    if (!ws?.parentId || !byId.has(ws.parentId) || seen.has(id)) {
      depths.set(id, 0)
      return 0
    }
    seen.add(id)
    const depth = depthOf(ws.parentId, seen) + 1
    depths.set(id, depth)
    return depth
  }
  for (const ws of workspaces.value) depthOf(ws.id, new Set())
  return depths
})

function workspaceDepth(id: string): number {
  return workspaceDepthMap.value.get(id) ?? 0
}

// 右侧标签页列表：与「标签页」「工作组」页共用同一面板，排序与分页在前端完成
const tabPage = ref(1)
const tabPageSize = ref(20)
const tabSortMode = ref<CloudTabSortMode>('createdAt')
const tabSortAsc = ref(false)
const tabScheme = ref<TabSchemeFilter>('')

function tabTitle(item: TagTabItem): string {
  return item.tab.displayName || item.tab.title || item.tab.url
}

const tagTabEmptyDescription = computed(() =>
  tabScheme.value ? '没有匹配筛选条件的标签页' : '该标签下暂无标签页',
)

/** 协议筛选只影响展示，不重新请求 */
const filteredTagTabItems = computed(() => {
  if (!tabScheme.value) return taggedTabs.value
  return taggedTabs.value.filter((item) =>
    item.tab.url.toLowerCase().startsWith(`${tabScheme.value}://`),
  )
})

/** 创建时间取标签页添加时间 addedAt，修改时间取后端下发的 updatedAt */
const sortedTagTabItems = computed(() => {
  const items = filteredTagTabItems.value
  const dir = tabSortAsc.value ? 1 : -1
  if (tabSortMode.value === 'name') {
    return [...items].sort((a, b) => dir * tabTitle(a).localeCompare(tabTitle(b), 'zh-Hans-CN'))
  }
  const timeOf = (item: TagTabItem) =>
    Date.parse(tabSortMode.value === 'createdAt' ? item.tab.addedAt : (item.tab.updatedAt ?? '')) || 0
  return [...items].sort((a, b) => dir * (timeOf(a) - timeOf(b)))
})

const pagedTagTabItems = computed<CloudTabListItem[]>(() => {
  const start = (tabPage.value - 1) * tabPageSize.value
  return sortedTagTabItems.value.slice(start, start + tabPageSize.value).map((item) => ({
    id: `${item.workspaceId}-${item.tab.tabId}`,
    title: tabTitle(item),
    originalTitle: item.tab.displayName ? item.tab.title : undefined,
    url: item.tab.url,
    favIconUrl: item.tab.favIconUrl,
    badgeText: item.workspaceName,
    badgeColor: item.workspaceColor,
    badgeKey: item.workspaceId,
    tags: (item.tab.tags ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    description: item.tab.description,
    addedAt: item.tab.addedAt,
    workspaceId: item.workspaceId,
    tab: item.tab,
  }))
})

/** 标签页减少后回退到最后一个有效页 */
const tabPageCount = computed(() =>
  Math.max(1, Math.ceil(filteredTagTabItems.value.length / tabPageSize.value)),
)
watch(tabPageCount, (max) => {
  if (tabPage.value > max) tabPage.value = max
})

// ============ 数据加载 ============
async function loadTags(): Promise<void> {
  tagsLoading.value = true
  try {
    tags.value = await listTags()
    // 刷新后按 id 重新指向最新对象，避免编辑后的颜色/名称滞后
    if (selectedTag.value) {
      selectedTag.value =
        tags.value.find((t) => t.id === selectedTag.value?.id) ?? null
      if (!selectedTag.value) taggedTabs.value = []
    }
  } catch (err) {
    tags.value = []
    reportServiceError(err, { fallback: '获取标签失败' })
  } finally {
    tagsLoading.value = false
  }
}

async function loadWorkspaces(): Promise<void> {
  try {
    workspaces.value = await listWorkspaces({ includeSystem: true })
  } catch {
    // 工作组标签计数/列表不可用时不影响标签页标签视图
    workspaces.value = []
  }
}

async function loadTagTabs(tagId: number): Promise<void> {
  detailLoading.value = true
  taggedTabs.value = []
  try {
    taggedTabs.value = await listTagTabs(tagId)
  } catch (err) {
    reportServiceError(err, { fallback: '获取标签页失败' })
  } finally {
    detailLoading.value = false
  }
}

async function applySelection(tag: TagInfo): Promise<void> {
  selectedTag.value = tag
  tabPage.value = 1
  if (tag.scope === 'tab') {
    await loadTagTabs(tag.id)
  } else {
    taggedTabs.value = []
  }
}

/** 路由带入的目标标签（从标签页/工作组跳转过来时定位） */
const routeTagId = computed(() => {
  const v = route.query.tagId
  const id = typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(id) ? id : null
})

/** 已发起但路由尚未更新的目标值：避免选中项 watcher 把刚 push 的记录又 replace 掉 */
let pendingTagQuery: number | null = null

/** 选中项同步到 URL query：刷新或复制链接后可恢复到同一标签 */
function syncTagToQuery(id: number | null, mode: 'push' | 'replace' = 'replace') {
  if (id === routeTagId.value || id === pendingTagQuery) return
  pendingTagQuery = id
  const query = { ...route.query }
  if (id == null) delete query.tagId
  else query.tagId = String(id)
  void router[mode]({ query }).finally(() => {
    if (pendingTagQuery === id) pendingTagQuery = null
  })
}

function clearSelection(): void {
  selectedTag.value = null
  taggedTabs.value = []
  syncTagToQuery(null)
}

/** 用户点选标签：写入历史记录，浏览器返回可逐个回到之前选中的标签 */
async function selectTag(tag: TagInfo): Promise<void> {
  scopeFilter.value = tag.scope
  await applySelection(tag)
  syncTagToQuery(tag.id, 'push')
}

/** 从 URL 恢复选中项：标签列表加载完成后按 id 定位 */
async function restoreFromQuery(): Promise<void> {
  const id = routeTagId.value
  if (id == null) return
  const tag = tags.value.find((t) => t.id === id)
  if (!tag) return
  scopeFilter.value = tag.scope
  await applySelection(tag)
}

// 同一路由仅 query 变化（返回/前进或外部跳转）时同步右侧详情
watch(routeTagId, (id) => {
  if (id == null) {
    selectedTag.value = null
    taggedTabs.value = []
    return
  }
  const tag = tags.value.find((t) => t.id === id)
  if (!tag || selectedTag.value?.id === tag.id) return
  scopeFilter.value = tag.scope
  void applySelection(tag)
})

async function refresh(): Promise<void> {
  await Promise.all([loadTags(), loadWorkspaces()])
  if (selectedTag.value) {
    await selectTag(selectedTag.value)
  }
  ElMessage.success('已刷新')
}

// ============ 行操作 ============

/** 面板内修改了标签页：刷新当前标签下的列表，并同步左侧标签计数 */
function onTagTabsRefresh(): void {
  const tag = selectedTag.value
  if (!tag || tag.scope !== 'tab') return
  void loadTagTabs(tag.id)
  void loadTags()
}

async function removeTagFromWorkspace(workspaceId: string): Promise<void> {
  const tag = selectedTag.value
  if (!tag) return
  try {
    await removeWorkspaceTag(workspaceId, tag.id)
    ElMessage.success('已移除标签')
    await Promise.all([loadWorkspaces(), loadTags()])
  } catch (err) {
    reportServiceError(err, { fallback: '移除标签失败' })
  }
}

// ============ 标签增删改 ============
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const editingTag = ref<TagInfo | null>(null)
const tagForm = reactive({
  name: '',
  color: DEFAULT_WORKSPACE_COLOR,
  scope: 'tab' as TagScope,
  description: '',
})

// 颜色面板失焦关闭时会回退到关闭前的值，实时同步预览色使选色直接生效
function onColorActiveChange(color: string | null) {
  if (color && color !== tagForm.color) tagForm.color = color
}

function openCreate(): void {
  dialogMode.value = 'create'
  editingTag.value = null
  tagForm.name = ''
  tagForm.color = DEFAULT_WORKSPACE_COLOR
  tagForm.scope = scopeFilter.value
  tagForm.description = ''
  dialogVisible.value = true
}

function openEdit(tag: TagInfo): void {
  dialogMode.value = 'edit'
  editingTag.value = tag
  tagForm.name = tag.name
  // 无颜色时保持为空，避免编辑未设置颜色的标签时被默认蓝色覆盖
  tagForm.color = tag.color || ''
  tagForm.scope = tag.scope
  tagForm.description = tag.description || ''
  dialogVisible.value = true
}

async function submitTag(): Promise<void> {
  const name = tagForm.name.trim()
  if (!name) return
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      const created = await createTag({
        name,
        color: tagForm.color,
        scope: tagForm.scope,
        description: tagForm.description,
      })
      ElMessage.success('已创建标签')
      dialogVisible.value = false
      await Promise.all([loadTags(), loadWorkspaces()])
      const tag = tags.value.find((t) => t.id === created.id)
      if (tag) {
        // 新建的标签不在当前筛选分类时，切到对应分类再选中
        if (scopeFilter.value !== tag.scope) {
          scopeFilter.value = tag.scope
        }
        await selectTag(tag)
      }
    } else if (editingTag.value) {
      // 清空颜色时 picker 值为 undefined，归一化为空字符串以告知后端清除颜色
      await updateTag(editingTag.value.id, {
        name,
        color: tagForm.color || '',
        description: tagForm.description,
      })
      ElMessage.success('已更新标签')
      dialogVisible.value = false
      await Promise.all([loadTags(), loadWorkspaces()])
    }
  } catch (err) {
    reportServiceError(err, { fallback: dialogMode.value === 'create' ? '创建标签失败' : '更新标签失败' })
  } finally {
    saving.value = false
  }
}

async function removeTag(tag: TagInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除标签「${tag.name}」吗？该标签将从相关标签页与工作组上移除，对应的记录不会被删除。`,
      '删除标签',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteTag(tag.id)
    ElMessage.success('已删除')
    if (selectedTag.value?.id === tag.id) {
      clearSelection()
    }
    await Promise.all([loadTags(), loadWorkspaces()])
  } catch (err) {
    reportServiceError(err, { fallback: '删除标签失败' })
  }
}

onMounted(async () => {
  await Promise.all([loadTags(), loadWorkspaces()])
  await restoreFromQuery()
})
</script>

<style scoped>
.tags-view {
  display: flex;
  gap: 16px;
  height: 100%;
  box-sizing: border-box;
}
.tags-left {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
}
.left-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.left-title {
  font-weight: 600;
  font-size: 13px;
  color: #909399;
}
.left-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
/* 标题栏按钮组较密：清掉相邻按钮默认外边距，并收紧文字按钮的左右留白 */
.left-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.left-actions :deep(.el-button.is-text) {
  padding-left: 6px;
  padding-right: 6px;
}
.tag-search {
  margin-bottom: 8px;
}
.scope-filter {
  margin-bottom: 8px;
}
.left-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}
.sort-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
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
.sort-btn:last-child {
  border-left: none;
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
.hide-empty {
  height: 24px;
  margin-bottom: 8px;
  font-size: 12px;
}
.tag-list {
  flex: 1;
  overflow-y: auto;
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.tag-item:hover {
  background: var(--el-fill-color-light);
}
.tag-item.active {
  background: var(--el-color-primary-light-9);
}
.tag-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.tag-count {
  display: inline-block;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  overflow: hidden;
  transition: opacity 0.15s, max-width 0.15s, padding 0.15s;
}
.tag-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 0.15s, opacity 0.15s;
}
.tag-actions .el-button {
  margin-left: 0;
  padding: 4px;
  color: var(--el-text-color-regular);
}
.tag-actions .el-button:hover {
  color: var(--el-color-primary);
}
.tag-actions .tag-del:hover {
  color: var(--el-color-danger);
}
.tag-item:hover .tag-count {
  min-width: 0;
  max-width: 0;
  padding: 0;
  opacity: 0;
}
.tag-item:hover .tag-actions {
  max-width: 60px;
  opacity: 1;
}
.tags-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
}
.right-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.right-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.right-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}
.right-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.workspace-list {
  flex: 1;
  overflow-y: auto;
}
.workspace-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.workspace-item:hover {
  background: var(--el-fill-color-light);
}
.workspace-info {
  flex: 1;
  min-width: 0;
}
.workspace-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.workspace-desc {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.scope-readonly {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
