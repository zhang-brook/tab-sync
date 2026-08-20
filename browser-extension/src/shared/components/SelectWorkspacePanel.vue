<template>
  <WorkspacePickerPanel
    ref="panelRef"
    confirmable
    fill-height
    v-model:close-tab="closeTab"
    :close-tab-label="closeTabLabel"
    @select="onSelect"
    @cancel="onCancel"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import WorkspacePickerPanel from './WorkspacePickerPanel.vue'
import { sendMessage } from '../composables/useMessage'
import type { WorkspaceTreeNode } from '../utils/workspace-tree'

const props = defineProps<{
  /** 要保存的标签页（已过滤可收藏协议） */
  tabs: chrome.tabs.Tab[]
}>()

const emit = defineEmits<{
  (e: 'success'): void
  (e: 'cancel'): void
}>()

const panelRef = ref<InstanceType<typeof WorkspacePickerPanel>>()
/** 「加入后关闭该页面」开关（底部复选框），默认勾选 */
const closeTab = ref(true)
/** 复选框文案：标签组批量收藏时提示关闭对象不同 */
const closeTabLabel = computed(() => (props.tabs.length > 1 ? '加入后关闭这些标签页' : '加入后关闭该页面'))
// 标记是否处于「已选中、正在提交」状态，避免提交过程中被取消关闭
let selecting = false

onMounted(() => {
  panelRef.value?.reload()
})

/** 用户选中某个分组：加入工作组；关闭原页面与桌面通知由 background 统一处理 */
async function onSelect(node: WorkspaceTreeNode) {
  if (props.tabs.length === 0) {
    ElMessage.error('标签页信息缺失')
    return
  }
  selecting = true
  try {
    const res = await sendMessage<{ added: number; skipped: number }>({
      action: 'ADD_TABS_TO_WORKSPACE',
      payload: {
        workspaceId: node.id,
        tabs: props.tabs.map((tab) => ({
          chromeTabId: tab.id ?? 0,
          url: tab.url ?? '',
          title: tab.title ?? '',
          favIconUrl: tab.favIconUrl ?? '',
        })),
        // 按「加入后关闭该页面」开关告诉 background 是否关闭原页面（background 同时负责弹通知）
        closeAfterAdd: closeTab.value,
      },
    })

    // 注意，当前页面中没有 chrome 对象，所以要借助 background 处理关闭原页面和弹通知的逻辑
    if (res.success) {
      emit('success')
    } else if (res.authError) {
      ElMessage.error('未登录或连接已失效，请先在侧边栏登录')
      selecting = false
    } else {
      ElMessage.error(res.error || '加入工作组失败')
      selecting = false
    }
  } catch {
    ElMessage.error('加入工作组失败，请重试')
    selecting = false
  }
}

/** 提交中禁止取消关闭（选择模式下取消按钮未禁用，靠此标志拦截） */
function onCancel() {
  if (selecting) return
  emit('cancel')
}
</script>
