<template>
  <div class="picker-page">
    <!-- 新建工作组并保存模式（多选/组保存 → 创建新工作组并保存） -->
    <CreateWorkspacePanel
      v-if="isCreateMode"
      :tabs="tabs"
      :default-name="createDefaultName"
      :color="createColor"
      @success="onSuccess"
      @cancel="onCancel"
    />
    <!-- 选择已有分组模式 -->
    <SelectWorkspacePanel
      v-else
      :tabs="tabs"
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import CreateWorkspacePanel from '@/shared/components/CreateWorkspacePanel.vue'
import SelectWorkspacePanel from '@/shared/components/SelectWorkspacePanel.vue'
import { DEFAULT_WORKSPACE_COLOR } from '@/shared/constants/theme'

// 入口：同步解析 URL 参数，决定渲染模式与各模式默认值
const params = new URLSearchParams(location.search)
const isCreateMode = params.get('mode') === 'create'
const createDefaultName = params.get('defaultName') ?? defaultWorkspaceName()
const createColor = params.get('color') ?? DEFAULT_WORKSPACE_COLOR
const tabIds = (params.get('tabIds') ?? '')
  .split(',')
  .map((s) => Number(s))
  .filter((n) => Number.isInteger(n) && n > 0)

/** 待保存的标签页信息（异步获取） */
const tabs = ref<chrome.tabs.Tab[]>([])

/** 默认工作组名称：未命名工作组-YYYYMMDD_HHMM（如 未命名工作组-20260821_0359） */
function defaultWorkspaceName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `未命名工作组-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

onMounted(async () => {
  if (tabIds.length === 0) {
    window.close()
    return
  }
  // 逐个获取标签页信息（可能已被关闭，失败的跳过）
  const results = await Promise.all(
    tabIds.map(async (id) => {
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

  // 本窗口本身是 popup 弹窗，失焦后无意义且容易在任务栏留下残留，直接关闭（两种模式都需要）
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    const win = await chrome.windows.getCurrent()
    if (win?.id == null) return
    // 焦点离开本弹窗（切换到其他窗口/应用，或最小化）即关闭，避免残留到系统任务栏
    if (windowId !== win.id) window.close()
  })
})

/** 保存成功：关闭选择器窗口（关闭原页面与桌面通知已由 background 处理） */
function onSuccess() {
  window.close()
}

/** 用户点击「取消」：不关闭原页面，关闭选择器窗口 */
function onCancel() {
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
