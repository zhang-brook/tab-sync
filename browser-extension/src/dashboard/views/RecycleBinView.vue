<template>
  <div class="recyclebin-view">
    <div class="toolbar">
      <el-alert type="info" :closable="false" show-icon>
        从工作组移除的标签页会暂存在此处，可勾选后恢复到指定工作组；也可在此彻底删除，或一键清空。
      </el-alert>
      <div class="toolbar-actions">
        <el-button
          type="danger"
          plain
          :disabled="items.length === 0"
          :loading="emptying"
          @click="handleEmpty"
        >
          <el-icon><Delete /></el-icon>
          清空回收站
        </el-button>
      </div>
    </div>

    <SelectionBar v-if="selectedCount > 0" :count="selectedCount" class="batch-bar">
      <el-button @click="clearSelection">取消选择</el-button>
      <el-button type="primary" :loading="restoring" @click="openRestoreDialog(selectedItems)">
        恢复到工作组
      </el-button>
    </SelectionBar>

    <el-card v-loading="loading" shadow="never" class="recyclebin-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">回收站（{{ items.length }}）</span>
          <el-checkbox
            v-if="items.length > 0"
            :model-value="allSelected"
            :indeterminate="someSelected"
            @change="toggleSelectAll"
          >全选</el-checkbox>
        </div>
      </template>

      <div v-if="items.length > 0" class="recyclebin-list">
        <div v-for="item in sortedItems" :key="item.id" class="recycle-item">
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

      <el-empty v-else description="回收站为空，从工作组移除的标签页会显示在这里" :image-size="120" />
    </el-card>

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
import { Delete, Link } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '@/shared/composables/useMessage'
import SelectionBar from '@/shared/components/SelectionBar.vue'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'
import type { WorkspaceTreeNode } from '@/shared/utils/workspace-tree'
import type { RecycleBinData, RecycleBinTab } from '@/shared/types'

const items = ref<RecycleBinTab[]>([])
const loading = ref(true)
const emptying = ref(false)
const restoring = ref(false)
const deletingId = ref<number | null>(null)

/** 当前勾选的回收站条目 id */
const selectedIds = ref<number[]>([])
/** 待恢复的条目（单条或批量），恢复目标由用户在选择弹窗中确定 */
const restoreTargets = ref<RecycleBinTab[]>([])
const restoreDialogVisible = ref(false)
/** 选择弹窗的预选工作组：单条恢复或来源一致时预选原工作组 */
const restorePreselectId = ref('')

/** 按删除时间倒序展示 */
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()),
)

const selectedCount = computed(() => selectedIds.value.length)
const allSelected = computed(
  () => items.value.length > 0 && selectedIds.value.length === items.value.length,
)
const someSelected = computed(
  () => selectedIds.value.length > 0 && selectedIds.value.length < items.value.length,
)
const selectedItems = computed(() =>
  sortedItems.value.filter((item) => selectedIds.value.includes(item.id)),
)

onMounted(load)

async function load() {
  loading.value = true
  const res = await sendMessage<RecycleBinData>({ action: 'GET_RECYCLE_BIN' })
  if (res.success && res.data) {
    items.value = res.data.recycleBin ?? []
    // 丢弃已不在列表中的勾选项（可能已被其他设备恢复或彻底删除）
    const existing = new Set(items.value.map((item) => item.id))
    selectedIds.value = selectedIds.value.filter((id) => existing.has(id))
  } else {
    ElMessage.error(res.error || '获取回收站失败')
  }
  loading.value = false
}

function displayName(item: RecycleBinTab): string {
  return item.displayName?.trim() || item.title?.trim() || item.url || '(无标题)'
}

function onFavError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

/** 格式化时间 */
function formatTime(iso: string): string {
  if (!iso) return '--'
  const d = new Date(iso)
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

/** el-checkbox 的 change 参数可能是 boolean/string/number，统一按真值处理 */
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
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.toolbar :deep(.el-alert) {
  flex: 1;
}

.toolbar-actions {
  flex-shrink: 0;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  font-weight: 600;
}

.recyclebin-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recycle-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
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
  margin: 2px 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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
