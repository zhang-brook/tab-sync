<template>
  <div class="recyclebin-view">
    <div class="toolbar">
      <el-alert type="info" :closable="false" show-icon>
        从工作组移除的标签页会暂存在此处，恢复时统一归入「未分组」；也可在此彻底删除，或一键清空。
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

    <el-card v-loading="loading" shadow="never" class="recyclebin-card">
      <template #header>
        <span class="card-title">回收站（{{ items.length }}）</span>
      </template>

      <div v-if="items.length > 0" class="recyclebin-list">
        <div v-for="item in sortedItems" :key="item.id" class="recycle-item">
          <el-avatar :size="36" shape="square" class="item-favicon">
            <img v-if="item.favIconUrl" :src="item.favIconUrl" alt="" @error="onFavError" />
            <el-icon v-else><Link /></el-icon>
          </el-avatar>

          <div class="item-main">
            <div class="item-title" :title="displayName(item)">
              {{ displayName(item) }}
            </div>
            <div class="item-url" :title="item.url">{{ item.url }}</div>
            <div class="item-meta">
              <el-tag size="small" type="info" effect="plain">
                来自：{{ item.originalWorkspaceName || '未知工作组' }}
              </el-tag>
              <span class="item-time">删除于 {{ formatTime(item.deletedAt) }}</span>
            </div>
          </div>

          <div class="item-actions">
            <el-button type="primary" size="small" :loading="restoringId === item.id" @click="handleRestore(item)">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Delete, Link } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '@/shared/composables/useMessage'
import type { RecycleBinData, RecycleBinTab } from '@/shared/types'

const items = ref<RecycleBinTab[]>([])
const loading = ref(true)
const emptying = ref(false)
const restoringId = ref<number | null>(null)
const deletingId = ref<number | null>(null)

/** 按删除时间倒序展示 */
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()),
)

onMounted(load)

async function load() {
  loading.value = true
  const res = await sendMessage<RecycleBinData>({ action: 'GET_RECYCLE_BIN' })
  if (res.success && res.data) {
    items.value = res.data.recycleBin ?? []
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

/** 恢复：统一恢复到「未分组」 */
async function handleRestore(item: RecycleBinTab) {
  try {
    await ElMessageBox.confirm(
      `将「${displayName(item)}」恢复到「未分组」，确定吗？`,
      '恢复标签页',
      { type: 'info', confirmButtonText: '恢复' },
    )
  } catch {
    return
  }
  restoringId.value = item.id
  const res = await sendMessage({ action: 'RESTORE_RECYCLE_BIN_TAB', payload: { id: item.id } })
  restoringId.value = null
  if (res.success) {
    ElMessage.success('已恢复到「未分组」')
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
