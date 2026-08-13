<template>
  <div class="picker-page">
    <WorkspacePickerPanel
      ref="panelRef"
      confirmable
      fill-height
      v-model:close-tab="closeTab"
      :close-tab-label="closeTabLabel"
      @select="onSelect"
      @cancel="onCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import WorkspacePickerPanel from '@/shared/components/WorkspacePickerPanel.vue'
import { sendMessage } from '@/shared/composables/useMessage'
import type { WorkspaceTreeNode } from '@/shared/utils/workspace-tree'

const panelRef = ref<InstanceType<typeof WorkspacePickerPanel>>()
const tabIds = ref<number[]>([])
const tabs = ref<chrome.tabs.Tab[]>([])
/** 「加入后关闭当前页」开关（底部复选框），默认勾选 */
const closeTab = ref(true)
/** 复选框文案：标签组批量收藏时提示关闭对象不同 */
const closeTabLabel = computed(() => (tabs.value.length > 1 ? '加入后关闭这些标签页' : '加入后关闭当前页'))
// 标记是否处于「已选中、正在提交」状态，避免提交过程中被取消关闭
let selecting = false

onMounted(async () => {
  const params = new URLSearchParams(location.search)
  const ids = (params.get('tabIds') ?? '')
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (ids.length === 0) {
    window.close()
    return
  }
  tabIds.value = ids
  // 逐个获取标签页信息（可能已被关闭，失败的跳过）
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return await chrome.tabs.get(id)
      } catch {
        return null
      }
    }),
  )
  tabs.value = results.filter((t): t is chrome.tabs.Tab => t != null && !!t.url)
  if (tabs.value.length === 0) {
    ElMessage.error('无法获取标签页信息')
  }
  panelRef.value?.reload()

  // 本窗口本身是 popup 弹窗，最小化后无意义且容易在任务栏留下残留，直接关闭
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) return
    const win = await chrome.windows.getCurrent()
    if (win?.state === 'minimized') window.close()
  })
})

/** 用户选中某个分组：加入工作组，成功后再关闭原页面 */
async function onSelect(node: WorkspaceTreeNode) {
  if (tabs.value.length === 0 || tabIds.value.length === 0) {
    ElMessage.error('标签页信息缺失')
    return
  }
  selecting = true
  try {
    const res = await sendMessage<{ added: number; skipped: number }>({
      action: 'ADD_TABS_TO_WORKSPACE',
      payload: {
        workspaceId: node.id,
        tabs: tabs.value.map((tab) => ({
          chromeTabId: tab.id ?? 0,
          url: tab.url ?? '',
          title: tab.title ?? '',
          favIconUrl: tab.favIconUrl ?? '',
        })),
      },
    })

    if (res.success) {
      // 按「加入后关闭当前页」开关决定是否关闭原页面
      if (closeTab.value) {
        try {
          await chrome.tabs.remove(tabIds.value)
        } catch {
          /* 标签可能已关闭，忽略 */
        }
      }
      window.close()
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

/** 用户点击「取消」：不关闭原页面，关闭选择器窗口 */
function onCancel() {
  if (selecting) return
  window.close()
}
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
.picker-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}
</style>
