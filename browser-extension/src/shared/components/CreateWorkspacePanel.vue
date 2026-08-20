<template>
  <div class="create-panel">
    <div class="create-title">创建新工作组并保存</div>
    <el-input
      v-model="name"
      placeholder="工作组名称"
      size="default"
      clearable
      @keyup.enter="onConfirm"
    />
    <div class="create-footer">
      <el-checkbox v-model="closeTab">{{ closeTabLabel }}</el-checkbox>
      <div class="create-actions">
        <el-button :disabled="submitting" @click="emit('cancel')">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!name.trim()"
          @click="onConfirm"
        >
          确认
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { sendMessage } from '../composables/useMessage'
import { DEFAULT_WORKSPACE_COLOR } from '../constants/theme'

const props = withDefaults(defineProps<{
  /** 要保存的标签页（已过滤可收藏协议） */
  tabs: chrome.tabs.Tab[]
  /** 默认工作组名称 */
  defaultName?: string
  /** 工作组标识色，默认使用主题默认色 */
  color?: string
  /** 底部复选框文案，默认「添加后关闭这些标签页」 */
  closeTabLabel?: string
}>(), {
  defaultName: '',
  color: DEFAULT_WORKSPACE_COLOR,
  closeTabLabel: '添加后关闭这些标签页',
})

const emit = defineEmits<{
  (e: 'success'): void
  (e: 'cancel'): void
}>()

const name = ref(props.defaultName)
/** 「添加后关闭」开关（底部复选框），默认勾选 */
const closeTab = ref(true)
const submitting = ref(false)

/** 创建新工作组并加入选中标签页；关闭原页面与桌面通知由 background 统一处理 */
async function onConfirm() {
  const wsName = name.value.trim()
  if (!wsName) {
    ElMessage.error('请输入工作组名称')
    return
  }
  if (props.tabs.length === 0) {
    ElMessage.error('标签页信息缺失')
    return
  }
  submitting.value = true
  try {
    // 先创建新工作组
    const createRes = await sendMessage<{ workspace: { id: string } }>({
      action: 'CREATE_WORKSPACE',
      payload: { name: wsName, color: props.color },
    })
    if (!createRes.success || !createRes.data) {
      ElMessage.error(createRes.authError ? '未登录或连接已失效，请先在侧边栏登录' : createRes.error || '创建工作组失败')
      submitting.value = false
      return
    }
    // 再按「添加后关闭」开关加入选中标签页（background 统一负责关闭原页面和弹通知）
    const addRes = await sendMessage<{ added: number; skipped: number }>({
      action: 'ADD_TABS_TO_WORKSPACE',
      payload: {
        workspaceId: createRes.data.workspace.id,
        tabs: props.tabs.map((tab) => ({
          chromeTabId: tab.id ?? 0,
          url: tab.url ?? '',
          title: tab.title ?? '',
          favIconUrl: tab.favIconUrl ?? '',
        })),
        closeAfterAdd: closeTab.value,
      },
    })
    if (addRes.success) {
      emit('success')
    } else {
      ElMessage.error(addRes.authError ? '未登录或连接已失效，请先在侧边栏登录' : addRes.error || '保存失败')
      submitting.value = false
    }
  } catch {
    ElMessage.error('保存失败，请重试')
    submitting.value = false
  }
}
</script>

<style scoped>
.create-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.create-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}
.create-footer {
  display: flex;
  align-items: center;
  margin-top: auto;
  padding-top: 16px;
}
.create-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
</style>
