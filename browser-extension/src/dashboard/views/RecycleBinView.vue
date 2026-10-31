<template>
  <div class="recyclebin-view">
    <el-alert type="info" :closable="false" show-icon>
      从工作组移除的标签页会暂存在此处，可勾选后恢复到指定工作组；也可在此彻底删除，或一键清空。
    </el-alert>

    <!-- 列表内容统一放在白色块中 -->
    <div v-loading="loading" class="list-pane">
      <div class="pane-toolbar">
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
              :class="{ active: sortMode === 'deletedAt' }"
              title="再次点击切换删除时间升序 / 降序"
              @click="onSortClick('deletedAt')"
            >
              按删除时间
              <el-icon v-if="sortMode === 'deletedAt'" class="sort-dir">
                <SortUp v-if="sortAsc" />
                <SortDown v-else />
              </el-icon>
            </button>
            <button
              type="button"
              class="sort-btn"
              :class="{ active: sortMode === 'addedAt' }"
              title="再次点击切换添加时间升序 / 降序"
              @click="onSortClick('addedAt')"
            >
              按添加时间
              <el-icon v-if="sortMode === 'addedAt'" class="sort-dir">
                <SortUp v-if="sortAsc" />
                <SortDown v-else />
              </el-icon>
            </button>
          </div>
        </div>

        <el-button
          type="danger"
          plain
          :disabled="total === 0"
          :loading="emptying"
          @click="handleEmpty"
        >
          <el-icon><Delete /></el-icon>
          清空回收站
        </el-button>
      </div>

      <SelectionBar v-if="selectedCount > 0" :count="selectedCount" class="batch-bar">
        <el-button @click="clearSelection">取消选择</el-button>
        <el-button type="primary" :loading="restoring" @click="openRestoreDialog(selectedItems)">
          恢复到工作组
        </el-button>
      </SelectionBar>

      <div v-if="items.length > 0" class="recyclebin-list">
        <div
          v-for="item in items"
          :key="item.id"
          class="recycle-item"
          @click="onRowClick(item, $event)"
        >
          <el-checkbox
            class="item-check"
            :model-value="selectedIds.includes(item.id)"
            @change="toggleSelect(item.id)"
          />

          <el-avatar :size="36" shape="square" class="item-favicon">
            <img v-if="item.favIconUrl" :src="item.favIconUrl" alt="" @error="onFavError" />
            <el-icon v-else><Link /></el-icon>
          </el-avatar>

          <div class="item-main">
            <div class="item-title" :title="displayName(item)">
              {{ displayName(item) }}
            </div>
            <div class="item-url" :title="item.url">{{ item.url }}</div>
            <div v-if="item.description" class="item-desc" :title="item.description">{{ item.description }}</div>
            <div class="item-meta">
              <el-tag size="small" type="info" effect="plain">
                来自：{{ item.originalWorkspaceName || '未知工作组' }}
              </el-tag>
              <span class="item-time">添加于 {{ formatTime(item.addedAt) }}</span>
              <span class="item-time">删除于 {{ formatTime(item.deletedAt) }}</span>
            </div>
          </div>

          <div class="item-actions">
            <el-button type="primary" size="small" :disabled="restoring" @click="openRestoreDialog([item])">
              恢复
            </el-button>
            <el-button
              type="danger"
              size="small"
              plain
              :loading="deletingId === item.id"
              @click="handleDelete(item)"
            >
              彻底删除
            </el-button>
          </div>
        </div>
      </div>

      <el-empty v-else class="pane-empty" description="回收站为空，从工作组移除的标签页会显示在这里" :image-size="120" />

      <div v-if="total > 0" class="pagination">
        <div class="list-summary">
          <el-checkbox
            :model-value="allSelected"
            :indeterminate="someSelected"
            @change="toggleSelectAll"
          >全选</el-checkbox>
          <span class="total-count">共 {{ total }} 条</span>
        </div>
        <el-pagination
          layout="prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          :disabled="total <= pageSize"
          @current-change="onPageChange"
        />
      </div>
    </div>

    <WorkspacePickerDialog
      v-model="restoreDialogVisible"
      title="选择恢复到的工作组"
      confirmable
      :show-close-option="false"
      :highlight-default-workspace="false"
      :preselect-id="restorePreselectId"
      :manageable="false"
      @select="handleRestoreTarget"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Delete, Link, SortDown, SortUp } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '@/shared/composables/useMessage'
import SelectionBar from '@/shared/components/SelectionBar.vue'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'
import type { WorkspaceTreeNode } from '@/shared/utils/workspace-tree'
import type { RecycleBinData, RecycleBinTab } from '@/shared/types'

type SortMode = 'name' | 'deletedAt' | 'addedAt'

const items = ref<RecycleBinTab[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(true)
const emptying = ref(false)
const restoring = ref(false)
const deletingId = ref<number | null>(null)

/** 排序由后端完成：名称默认 A-Z，时间默认最新在前 */
const sortMode = ref<SortMode>('deletedAt')
const sortAsc = ref(false)

/** 当前勾选的回收站条目 id */
const selectedIds = ref<number[]>([])
/** 待恢复的条目（单条或批量），恢复目标由用户在选择弹窗中确定 */
const restoreTargets = ref<RecycleBinTab[]>([])
const restoreDialogVisible = ref(false)
/** 选择弹窗的预选工作组：单条恢复或来源一致时预选原工作组 */
const restorePreselectId = ref('')

const selectedCount = computed(() => selectedIds.value.length)
const allSelected = computed(
  () => items.value.length > 0 && items.value.every((item) => selectedIds.value.includes(item.id)),
)
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value)
const selectedItems = computed(() =>
  items.value.filter((item) => selectedIds.value.includes(item.id)),
)

onMounted(load)

async function load() {
  loading.value = true
  const res = await sendMessage<RecycleBinData>({
    action: 'GET_RECYCLE_BIN',
    payload: {
      page: page.value,
      pageSize: pageSize.value,
      sort: sortMode.value,
      order: sortAsc.value ? 'asc' : 'desc',
    },
  })
  loading.value = false

  if (!res.success || !res.data) {
    ElMessage.error(res.error || '获取回收站失败')
    return
  }

  // 删除/恢复后当前页可能已不存在，回退到最后一页重新加载
  const maxPage = Math.max(1, Math.ceil(res.data.total / pageSize.value))
  if (page.value > maxPage) {
    page.value = maxPage
    await load()
    return
  }

  items.value = res.data.items ?? []
  total.value = res.data.total
  // 丢弃已不在当前页的勾选项（可能已被其他设备恢复或彻底删除）
  const existing = new Set(items.value.map((item) => item.id))
  selectedIds.value = selectedIds.value.filter((id) => existing.has(id))
}

function onPageChange(p: number) {
  page.value = p
  clearSelection()
  void load()
}

function onSortClick(mode: SortMode) {
  if (sortMode.value === mode) {
    sortAsc.value = !sortAsc.value
  } else {
    sortMode.value = mode
    sortAsc.value = mode === 'name'
  }
  page.value = 1
  clearSelection()
  void load()
}

function displayName(item: RecycleBinTab): string {
  return item.displayName?.trim() || item.title?.trim() || item.url || '(无标题)'
}

function onFavError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

/** 格式化时间；空值或零值（旧数据未记录添加时间）显示占位符 */
function formatTime(iso: string): string {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1970) return '--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) {
    selectedIds.value.push(id)
  } else {
    selectedIds.value.splice(idx, 1)
  }
}

/** 点击行内非勾选框、非操作按钮的区域时切换勾选 */
function onRowClick(item: RecycleBinTab, event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.item-check, .item-actions')) return
  toggleSelect(item.id)
}

/** el-checkbox 的 change 参数可能是 boolean/string/number，统一按真值处理；全选只作用于当前页 */
function toggleSelectAll(checked: boolean | string | number) {
  selectedIds.value = checked ? items.value.map((item) => item.id) : []
}

function clearSelection() {
  selectedIds.value = []
}

/** 打开恢复目标选择弹窗；单条恢复或来源一致时预选原工作组 */
function openRestoreDialog(targets: RecycleBinTab[]) {
  if (targets.length === 0 || restoring.value) return
  restoreTargets.value = [...targets]
  const origins = new Set(targets.map((item) => item.originalWorkspaceId).filter(Boolean))
  restorePreselectId.value = origins.size === 1 ? [...origins][0] : ''
  restoreDialogVisible.value = true
}

/** 选定目标工作组后提交恢复；未选中目标（如原工作组已被删除）时不提交 */
async function handleRestoreTarget(node?: WorkspaceTreeNode) {
  if (!node?.id || restoring.value || restoreTargets.value.length === 0) return
  restoring.value = true
  const ids = restoreTargets.value.map((item) => item.id)
  const res = await sendMessage({
    action: 'RESTORE_RECYCLE_BIN_TABS',
    payload: { ids, workspaceId: node.id },
  })
  restoring.value = false
  if (res.success) {
    ElMessage.success(
      ids.length > 1
        ? `已恢复 ${ids.length} 个标签页到「${node.name}」`
        : `已恢复到「${node.name}」`,
    )
    restoreDialogVisible.value = false
    restoreTargets.value = []
    clearSelection()
    await load()
  } else {
    ElMessage.error(res.error || '恢复失败')
  }
}

/** 彻底删除单条 */
async function handleDelete(item: RecycleBinTab) {
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除「${displayName(item)}」吗？此操作不可恢复。`,
      '彻底删除',
      { type: 'warning', confirmButtonText: '彻底删除' },
    )
  } catch {
    return
  }
  deletingId.value = item.id
  const res = await sendMessage({ action: 'DELETE_RECYCLE_BIN_TAB', payload: { id: item.id } })
  deletingId.value = null
  if (res.success) {
    ElMessage.success('已彻底删除')
    await load()
  } else {
    ElMessage.error(res.error || '删除失败')
  }
}

/** 清空回收站 */
async function handleEmpty() {
  try {
    await ElMessageBox.confirm('确定要清空回收站吗？所有暂存标签页将被永久删除，此操作不可恢复。', '清空回收站', {
      type: 'warning',
      confirmButtonText: '清空',
    })
  } catch {
    return
  }
  emptying.value = true
  const res = await sendMessage({ action: 'EMPTY_RECYCLE_BIN' })
  emptying.value = false
  if (res.success) {
    ElMessage.success('回收站已清空')
    await load()
  } else {
    ElMessage.error(res.error || '清空失败')
  }
}
</script>

<style scoped>
.recyclebin-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  box-sizing: border-box;
}

.list-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}

.pane-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
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

.recyclebin-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.batch-bar {
  flex-shrink: 0;
}

.pane-empty {
  flex: 1;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.list-summary {
  display: flex;
  align-items: center;
  gap: 12px;
}

.total-count {
  font-size: 12px;
  color: #909399;
}

.recycle-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.recycle-item:hover {
  background: #f5f7fa;
}

.item-check {
  flex-shrink: 0;
}

.item-favicon {
  flex-shrink: 0;
  background: #f5f7fa;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-url {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  margin-top: 2px;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.item-time {
  font-size: 12px;
  color: #c0c4cc;
}

.item-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}
</style>
