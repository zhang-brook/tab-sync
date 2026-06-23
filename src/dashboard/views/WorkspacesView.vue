<template>
  <div class="workspaces-view">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索工作组名称..."
          clearable
          style="width: 240px"
          :prefix-icon="Search"
        />
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="showCreateDialog">
          <el-icon><Plus /></el-icon>
          新建工作组
        </el-button>
        <el-button @click="loadWorkspaces">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 工作组列表 -->
    <div v-loading="loading" class="workspace-list">
      <el-empty v-if="filteredWorkspaces.length === 0 && !loading" description="暂无工作组，请先在标签页视图中选择标签页并创建" />

      <el-card
        v-for="ws in filteredWorkspaces"
        :key="ws.id"
        shadow="hover"
        class="workspace-card"
        :style="{ borderLeftColor: ws.color }"
      >
        <template #header>
          <div class="ws-header">
            <div class="ws-title-row">
              <span class="ws-color-dot" :style="{ backgroundColor: ws.color }" />
              <span class="ws-name">{{ ws.name }}</span>
              <el-tag size="small" type="info">{{ ws.tabs.length }} 个标签页</el-tag>
            </div>
            <div class="ws-actions">
              <el-tooltip content="打开所有标签页" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenWorkspace(ws.id, false)">
                  <el-icon><FolderOpened /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="在新窗口中打开所有" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenWorkspace(ws.id, true)">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="打开为标签组" placement="top">
                <el-button size="small" text type="primary" @click="handleOpenAsTabGroup(ws.id)">
                  <el-icon><Collection /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="编辑" placement="top">
                <el-button size="small" text @click="showEditDialog(ws)">
                  <el-icon><Edit /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button size="small" text type="danger" @click="handleDelete(ws)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </template>

        <!-- 标签页列表（可跨工作组拖拽排序） -->
        <div v-if="ws.tabs.length > 0" class="ws-tabs">
          <draggable
            :list="ws.tabs"
            group="workspaces"
            item-key="tabId"
            handle=".drag-handle"
            ghost-class="tab-ghost"
            :animation="200"
            @update="onDragUpdate(ws.id, $event)"
            @add="onDragAdd(ws.id, $event)"
          >
            <template #item="{ element: tab }">
              <div class="ws-tab-item">
                <span class="drag-handle" title="拖拽排序">⋮⋮</span>
                <img
                  v-if="tab.favIconUrl"
                  :src="tab.favIconUrl"
                  class="tab-favicon"
                  @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
                />
                <div v-else class="tab-favicon-placeholder" />
                <div class="tab-text">
                  <div class="tab-title" :title="tab.title">{{ tab.title || '(无标题)' }}</div>
                  <div class="tab-url" :title="tab.url">{{ tab.url }}</div>
                </div>
                <el-tooltip content="在新标签页中打开" placement="top">
                  <el-button size="small" text type="primary" @click="openSingleTab(tab.url)">
                    <el-icon><View /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </template>
          </draggable>
        </div>
        <el-empty v-else :image-size="60" description="工作组内暂无标签页" />

        <div class="ws-footer">
          <span class="ws-time">创建于 {{ formatTime(ws.createdAt) }}</span>
          <span class="ws-time">更新于 {{ formatTime(ws.updatedAt) }}</span>
        </div>
      </el-card>
    </div>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑工作组' : '新建工作组'"
      width="600px"
      destroy-on-close
    >
      <el-form label-width="80px" label-position="left">
        <el-form-item label="名称" required>
          <el-input v-model="formData.name" placeholder="例如: 项目A开发" />
        </el-form-item>
        <el-form-item label="标识色">
          <el-color-picker v-model="formData.color" :predefine="presetColors" />
        </el-form-item>
        <el-form-item label="选择标签页">
          <div class="tab-selector">
            <el-checkbox-group v-model="formData.checkIds">
              <div v-for="tab in currentOpenTabs" :key="tab.chromeTabId" class="tab-checkbox-item">
                <el-checkbox :value="tab.chromeTabId">
                  <div class="tab-checkbox-content">
                    <img
                      v-if="tab.favIconUrl"
                      :src="tab.favIconUrl"
                      class="tab-favicon"
                      @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
                    />
                    <div v-else class="tab-favicon-placeholder" />
                    <span class="tab-checkbox-title" :title="tab.title">{{ tab.title || '(无标题)' }}</span>
                  </div>
                </el-checkbox>
              </div>
            </el-checkbox-group>
            <el-empty v-if="currentOpenTabs.length === 0" :image-size="40" description="暂无打开的标签页" />
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, Plus, Refresh, FolderOpened, CopyDocument, Collection, Edit, Delete, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { sendMessage } from '../../shared/composables/useMessage'
import type { Workspace, WorkspacesData, WorkspaceTabPayload } from '../../shared/types'

const workspaces = ref<Workspace[]>([])
const loading = ref(true)
const searchKeyword = ref('')

// 对话框
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const editingId = ref('')
const currentOpenTabs = ref<Array<{ chromeTabId: number; url: string; title: string; favIconUrl: string }>>([])

const formData = ref({
  name: '',
  color: '#409EFF',
  checkIds: [] as number[],
})

const presetColors = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C',
  '#909399', '#00BCD4', '#9C27B0', '#FF5722',
]

const filteredWorkspaces = computed(() => {
  if (!searchKeyword.value.trim()) return workspaces.value
  const kw = searchKeyword.value.trim().toLowerCase()
  return workspaces.value.filter(w => w.name.toLowerCase().includes(kw))
})

onMounted(() => {
  loadWorkspaces()
})

async function loadWorkspaces() {
  loading.value = true
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES' })
  if (res.success && res.data) {
    workspaces.value = res.data.workspaces
  }
  loading.value = false
}

async function loadOpenTabsForDialog() {
  const chromeTabs = await chrome.tabs.query({})
  currentOpenTabs.value = chromeTabs.map(tab => ({
    chromeTabId: tab.id ?? 0,
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || '',
    favIconUrl: tab.favIconUrl || '',
  }))
}

function showCreateDialog() {
  isEditing.value = false
  editingId.value = ''
  formData.value = { name: '', color: '#409EFF', checkIds: [] }
  loadOpenTabsForDialog()
  dialogVisible.value = true
}

function showEditDialog(ws: Workspace) {
  isEditing.value = true
  editingId.value = ws.id
  formData.value = {
    name: ws.name,
    color: ws.color,
    checkIds: [],
  }
  loadOpenTabsForDialog()
  dialogVisible.value = true
}

async function handleSave() {
  if (!formData.value.name.trim()) {
    ElMessage.warning('请输入工作组名称')
    return
  }

  saving.value = true

  // 构建标签页数据
  const selectedTabs = currentOpenTabs.value.filter(t => formData.value.checkIds.includes(t.chromeTabId))
  const tabs: WorkspaceTabPayload[] = selectedTabs.map(t => ({
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    chromeTabId: t.chromeTabId,
  }))

  if (isEditing.value) {
    const res = await sendMessage({
      action: 'UPDATE_WORKSPACE',
      payload: {
        id: editingId.value,
        name: formData.value.name.trim(),
        color: formData.value.color,
        tabs,
      },
    })
    if (res.success) {
      ElMessage.success('工作组已更新')
    } else {
      ElMessage.error(res.error || '更新失败')
    }
  } else {
    const res = await sendMessage({
      action: 'CREATE_WORKSPACE',
      payload: {
        name: formData.value.name.trim(),
        color: formData.value.color,
        tabs,
      },
    })
    if (res.success) {
      ElMessage.success('工作组已创建')
    } else {
      ElMessage.error(res.error || '创建失败')
    }
  }

  saving.value = false
  dialogVisible.value = false
  await loadWorkspaces()
}

async function handleDelete(ws: Workspace) {
  try {
    await ElMessageBox.confirm(
      `确定要删除工作组"${ws.name}"吗？`,
      '删除工作组',
      { type: 'warning' },
    )
  } catch {
    return
  }

  const res = await sendMessage({ action: 'DELETE_WORKSPACE', payload: { id: ws.id } })
  if (res.success) {
    ElMessage.success('工作组已删除')
    await loadWorkspaces()
  } else {
    ElMessage.error(res.error || '删除失败')
  }
}

async function handleOpenWorkspace(id: string, newWindow: boolean) {
  const res = await sendMessage<{ opened: number; alreadyOpen: number }>({
    action: 'OPEN_WORKSPACE',
    payload: { id, newWindow },
  })
  if (res.success) {
    const data = res.data
    if (data && data.alreadyOpen > 0 && data.opened === 0) {
      ElMessage.info(`所有 ${data.alreadyOpen} 个标签页均已打开`)
    } else if (data && data.alreadyOpen > 0) {
      ElMessage.success(`已打开 ${data.opened} 个标签页，另有 ${data.alreadyOpen} 个已存在`)
    } else {
      ElMessage.success(`已打开 ${data?.opened ?? 0} 个标签页`)
    }
  } else {
    ElMessage.error(res.error || '打开失败')
  }
}

async function handleOpenAsTabGroup(id: string) {
  const res = await sendMessage<{ opened: number; alreadyOpen: number }>({
    action: 'OPEN_WORKSPACE',
    payload: { id, asTabGroup: true },
  })
  if (res.success) {
    const data = res.data
    if (data && data.alreadyOpen > 0 && data.opened === 0) {
      ElMessage.info(`所有 ${data.alreadyOpen} 个标签页均已打开并归入标签组`)
    } else if (data && data.alreadyOpen > 0) {
      ElMessage.success(`已打开 ${data.opened} 个标签页并归入标签组，另有 ${data.alreadyOpen} 个已存在`)
    } else {
      ElMessage.success(`已打开 ${data?.opened ?? 0} 个标签页并归入标签组`)
    }
  } else {
    ElMessage.error(res.error || '打开失败')
  }
}

function openSingleTab(url: string) {
  chrome.tabs.create({ url })
}

/** 同组内拖拽排序 — SortableJS @update 事件，列表数据已更新 */
function onDragUpdate(workspaceId: string, evt: any) {
  const ws = workspaces.value.find(w => w.id === workspaceId)
  if (!ws) return
  const tab = ws.tabs[evt.newIndex]
  if (tab) {
    handleMoveTab(workspaceId, tab.tabId, evt.newIndex)
  }
}

/** 跨工作组拖入 — SortableJS @add 事件，列表数据已更新（含新元素） */
function onDragAdd(workspaceId: string, evt: any) {
  const ws = workspaces.value.find(w => w.id === workspaceId)
  if (!ws) return
  const tab = ws.tabs[evt.newIndex]
  if (tab) {
    handleMoveTab(workspaceId, tab.tabId, evt.newIndex)
  }
}

/** 移动标签页到目标工作组指定位置（后端自动处理跨组/同组） */
async function handleMoveTab(targetWsId: string, tabId: string, newIndex: number) {
  try {
    const res = await sendMessage({
      action: 'MOVE_WORKSPACE_TAB',
      payload: { workspaceId: targetWsId, tabId, newIndex },
    })
    if (!res.success) {
      // API 失败则刷新以回滚视觉状态
      await loadWorkspaces()
    }
  } catch {
    await loadWorkspaces()
  }
}

function formatTime(iso: string): string {
  if (!iso) return '--'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.workspaces-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workspace-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-card {
  border-left: 3px solid #409eff;
}

.ws-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ws-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ws-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.ws-actions {
  display: flex;
  gap: 4px;
}

.ws-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ws-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.ws-tab-item:hover {
  background-color: #f5f7fa;
}

.tab-favicon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 2px;
}

.tab-favicon-placeholder {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  background-color: #dcdfe6;
  border-radius: 2px;
}

.tab-text {
  min-width: 0;
  flex: 1;
}

.tab-title {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-url {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.ws-footer {
  display: flex;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  margin-top: 8px;
}

.ws-time {
  font-size: 11px;
  color: #c0c4cc;
}

.tab-selector {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px;
  width: 100%;
}

.tab-checkbox-item {
  padding: 4px 0;
}

.tab-checkbox-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-checkbox-title {
  max-width: 350px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

/* 拖拽排序 */
.drag-handle {
  cursor: grab;
  color: #c0c4cc;
  font-size: 14px;
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
  padding: 0 2px;
  transition: color 0.15s;
}

.drag-handle:hover {
  color: #909399;
}

.drag-handle:active {
  cursor: grabbing;
}

.tab-ghost {
  opacity: 0.4;
  background: #e6f7ff;
  border: 1px dashed #409eff;
}
</style>
