<template>
  <el-dialog v-model="visible" title="工作组属性" width="520px" destroy-on-close>
    <div v-loading="loading">
      <div v-if="data" class="props-body">
        <div class="props-header">
          <span class="props-dot" :style="{ backgroundColor: data.color || '#c0c4cc' }" />
          <div class="props-title">
            <div class="props-title-row">
              <span class="props-name">{{ data.name }}</span>
              <el-tag v-if="data.isSystem" size="small" type="info">系统分组</el-tag>
            </div>
            <div class="props-path-row">
              <span class="props-path">路径：{{ data.fullPath }}</span>
              <el-button link type="info" size="small" :icon="CopyDocument" @click="copyPath">复制</el-button>
            </div>
          </div>
        </div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="所在目录">{{ data.parentPath }}</el-descriptions-item>
          <el-descriptions-item label="描述">
            <span :class="{ 'props-muted': !data.description }">{{ data.description || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="默认状态">{{ data.collapsed ? '默认折叠' : '默认展开' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ data.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="修改时间">{{ data.updatedAt }}</el-descriptions-item>
          <el-descriptions-item label="标签页数">
            {{ data.tabCount }}
            <el-text v-if="loading" type="info" size="small">（统计中…）</el-text>
          </el-descriptions-item>
          <el-descriptions-item label="子工作组数量">{{ data.childCount }}</el-descriptions-item>
          <el-descriptions-item label="子孙工作组标签页总数">
            {{ data.descendantTabCount }}
            <el-text v-if="loading" type="info" size="small">（统计中…）</el-text>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { sendMessage } from '@/shared/composables/useMessage'
import type { Workspace, WorkspaceTabsGroupsData } from '@/shared/types'

const props = defineProps<{
  modelValue: boolean
  /** 要展示属性的工作组 */
  workspace: Workspace | null
  /** 全部工作组扁平列表，用于构建所在目录路径与统计子组数量 */
  workspaces: Workspace[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)

interface WorkspaceProperties {
  name: string
  color: string
  isSystem: boolean
  /** 完整所在路径，如 /分组1/子分组2/孙分组3（含当前层级） */
  fullPath: string
  /** 父级路径，不含当前层级；根级为 / */
  parentPath: string
  description: string
  createdAt: string
  updatedAt: string
  /** 默认折叠状态：true=默认折叠，false=默认展开 */
  collapsed: boolean
  /** 当前工作组直接包含的标签页数 */
  tabCount: number
  /** 直接子工作组数量 */
  childCount: number
  /** 本组及子孙工作组标签页总数 */
  descendantTabCount: number
}

const data = ref<WorkspaceProperties | null>(null)

/** 构建工作组所在路径：沿 parentId 链向上回溯。
 * fullPath 为完整路径（含当前层级，如 /根组/子组/孙组）；
 * parentPath 为父级路径（不含当前层级，根级为 /） */
function buildPaths(id: string): { fullPath: string; parentPath: string } {
  const names: string[] = []
  const seen = new Set<string>()
  let cur: Workspace | undefined = props.workspaces.find((w) => w.id === id)
  while (cur && !seen.has(cur.id)) {
    const node = cur
    seen.add(node.id)
    names.unshift(node.name)
    cur = node.parentId ? props.workspaces.find((w) => w.id === node.parentId) : undefined
  }
  const fullPath = '/' + names.join('/')
  const parentPath = names.length > 1 ? '/' + names.slice(0, -1).join('/') : '/'
  return { fullPath, parentPath }
}

function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 复制完整路径到剪贴板 */
async function copyPath() {
  if (!data.value) return
  try {
    await navigator.clipboard.writeText(data.value.fullPath)
    ElMessage.success('路径已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

/** 打开属性弹窗：先展示本地已知元信息，再按需拉取整棵子树标签页计算数量 */
async function load(ws: Workspace) {
  const { fullPath, parentPath } = buildPaths(ws.id)
  data.value = {
    name: ws.name,
    color: ws.color,
    isSystem: !!ws.isSystem,
    fullPath,
    parentPath,
    description: ws.description || '',
    createdAt: formatDateTime(ws.createdAt),
    updatedAt: formatDateTime(ws.updatedAt),
    collapsed: ws.collapsed ?? false,
    tabCount: 0,
    childCount: props.workspaces.filter((w) => w.parentId === ws.id).length,
    descendantTabCount: 0,
  }
  loading.value = true
  try {
    // recursive=true 一次返回该组及整棵子树的标签页（按工作区分组），用于统计数量
    const res = await sendMessage<WorkspaceTabsGroupsData>({
      action: 'GET_WORKSPACE_TABS',
      payload: { workspaceId: ws.id, recursive: true },
    })
    if (res.success && res.data?.groups) {
      const own = res.data.groups.find((g) => g.workspaceId === ws.id)?.tabs.length ?? 0
      const total = res.data.groups.reduce((sum, g) => sum + g.tabs.length, 0)
      if (data.value) {
        data.value.tabCount = own
        // 总数含本组：自己这一层 + 全部子孙层
        data.value.descendantTabCount = total
      }
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.workspace] as const,
  ([v, ws]) => {
    if (v && ws) void load(ws)
  },
)
</script>

<style scoped>
.props-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.props-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.props-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 3px;
}

.props-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.props-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.props-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.props-path-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.props-path {
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}

.props-muted {
  color: #909399;
}
</style>
