<template>
  <div class="picker-page">
    <WorkspacePickerDialog
      :model-value="true"
      title="选择分组（加入后关闭当前页）"
      width="520px"
      @select="onSelect"
      @update:model-value="onCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'
import { sendMessage } from '@/shared/composables/useMessage'
import type { WorkspaceTreeNode } from '@/shared/utils/workspace-tree'

const tabId = ref<number | null>(null)
const currentTab = ref<chrome.tabs.Tab | null>(null)
// 标记是否处于「已选中、正在提交」状态，避免提交过程中被取消关闭
let selecting = false

onMounted(async () => {
  const params = new URLSearchParams(location.search)
  const id = Number(params.get('tabId'))
  if (!id) {
    window.close()
    return
  }
  tabId.value = id
  try {
    currentTab.value = await chrome.tabs.get(id)
  } catch {
    currentTab.value = null
  }
  if (!currentTab.value?.url) {
    ElMessage.error('无法获取当前标签页信息')
  }
})

/** 用户选中某个分组：加入工作组，成功后再关闭原页面 */
async function onSelect(node: WorkspaceTreeNode) {
  if (!currentTab.value || tabId.value == null) {
    ElMessage.error('标签页信息缺失')
    return
  }
  const tab = currentTab.value
  selecting = true
  try {
    const res = await sendMessage<{ added: number; skipped: number }>({
      action: 'ADD_TABS_TO_WORKSPACE',
      payload: {
        workspaceId: node.id,
        tabs: [
          {
            chromeTabId: tab.id ?? 0,
            url: tab.url ?? '',
            title: tab.title ?? '',
            favIconUrl: tab.favIconUrl ?? '',
          },
        ],
      },
    })

    if (res.success) {
      // 确保成功添加后再关闭当前页面
      try {
        await chrome.tabs.remove(tabId.value)
      } catch {
        /* 标签可能已关闭，忽略 */
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
  padding: 0;
}
/* 弹窗宽度随窗口自适应：即使窗口实际宽度小于预设值，也不会溢出产生横向滚动条
   （append-to-body 后 el-dialog 被挂到 body 下，需用全局选择器） */
.el-dialog {
  max-width: calc(100vw - 24px);
}
</style>
