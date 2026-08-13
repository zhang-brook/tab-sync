<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="dialogWidth"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <el-input
      v-model="keyword"
      placeholder="搜索工作组..."
      size="default"
      clearable
      :prefix-icon="Search"
    />

    <div class="picker-tree">
      <div v-if="loading" class="picker-hint">加载中...</div>
      <div v-else-if="treeData.length === 0" class="picker-hint">暂无工作组</div>
      <el-tree
        v-else
        ref="treeRef"
        :data="treeData"
        node-key="id"
        :props="treeProps"
        :filter-node-method="filterNode"
        :expand-on-click-node="false"
        default-expand-all
        highlight-current
        @node-click="onNodeClick"
      >
        <template #default="{ data }">
          <span
            class="picker-node"
            :class="{ 'is-disabled': disabledSet.has(data.id) }"
            :title="disabledSet.has(data.id) ? '当前不可选择' : ''"
          >
            <span class="picker-dot" :style="{ backgroundColor: data.color }" />
            <span class="picker-name">{{ data.name }}</span>
            <span v-if="data.tabCount" class="picker-count">{{ data.tabCount }}</span>
          </span>
        </template>
      </el-tree>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { sendMessage } from '../composables/useMessage'
import { buildWorkspaceTree, type WorkspaceTreeNode } from '../utils/workspace-tree'
import type { WorkspacesData } from '../types'

const props = defineProps<{
  modelValue: boolean
  title?: string
  /** 弹窗宽度（CSS 宽度值，如 '420px'、'90%'），默认 '420px' */
  width?: string
  /** 需要禁用（可见但不可选）的工作组 id，例如标签页当前所在工作组 */
  disabledIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'select', node: WorkspaceTreeNode): void
}>()

const title = props.title ?? '选择工作组'
const dialogWidth = props.width ?? '420px'

const loading = ref(false)
const keyword = ref('')
const treeData = ref<WorkspaceTreeNode[]>([])
const treeRef = ref()

const treeProps = { label: 'name', children: 'children' }

watch(keyword, (val) => {
  treeRef.value?.filter(val)
})

function filterNode(value: string, data: Record<string, unknown>) {
  if (!value) return true
  return String((data as unknown as WorkspaceTreeNode).name).toLowerCase().includes(value.toLowerCase())
}

const disabledSet = computed(() => new Set(props.disabledIds || []))

async function onOpen() {
  keyword.value = ''
  loading.value = true
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES', payload: { includeSystem: true } })
  if (res.success && res.data) {
    treeData.value = buildWorkspaceTree(res.data.workspaces)
  } else {
    treeData.value = []
  }
  loading.value = false
  await nextTick()
}

// 注意：初始即以 modelValue=true 挂载时（如 picker 独立弹窗页），Element Plus 不会触发 @open 事件，
// 需要在此主动加载一次，否则列表会一直显示空占位
onMounted(() => {
  if (props.modelValue) onOpen()
})

function onNodeClick(node: WorkspaceTreeNode) {
  if (disabledSet.value.has(node.id)) return
  emit('select', node)
  emit('update:modelValue', false)
}
</script>

<style scoped>
.picker-tree {
  margin-top: 12px;
  max-height: 320px;
  overflow-y: auto;
}

.picker-hint {
  padding: 24px;
  text-align: center;
  color: #909399;
  font-size: 13px;
}

.picker-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.picker-node.is-disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.picker-node.is-disabled .picker-dot {
  opacity: 0.4;
}

.picker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.picker-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-count {
  font-size: 11px;
  color: #909399;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 0 6px;
}
</style>
