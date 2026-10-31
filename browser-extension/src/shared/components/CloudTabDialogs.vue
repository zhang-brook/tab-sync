<template>
  <div>
    <!-- 编辑标题 -->
    <el-dialog v-model="renameOpen" title="重命名标签页" width="420px" destroy-on-close>
      <el-form label-width="80px" label-position="left">
        <el-form-item label="名称">
          <el-input
            v-model="renameValue"
            placeholder="输入新的显示名称（留空则恢复原始标题）"
            maxlength="500"
            show-word-limit
            clearable
            @keyup.enter="saveRename"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRename">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑链接 -->
    <el-dialog v-model="editUrlOpen" title="编辑链接" width="520px" destroy-on-close>
      <el-form label-width="70px" label-position="left">
        <el-form-item label="标题">{{ target?.tab.displayName || target?.tab.title }}</el-form-item>
        <el-form-item label="链接" required>
          <el-input v-model="editUrlValue" placeholder="https://example.com" clearable @keyup.enter="saveEditUrl">
            <template #prepend>
              <el-icon><Link /></el-icon>
            </template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!editUrlValue.trim()" @click="saveEditUrl">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑描述 -->
    <el-dialog v-model="editDescOpen" title="编辑描述" width="520px" destroy-on-close>
      <el-form label-width="70px" label-position="left">
        <el-form-item label="描述">
          <el-input
            v-model="editDescValue"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="可选，仅当你填写时才会保存；清空则移除描述"
            clearable
            @keyup.ctrl.enter="saveEditDesc"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEditDesc">保存</el-button>
      </template>
    </el-dialog>

    <!-- 修改添加时间 -->
    <el-dialog v-model="editTimeOpen" title="修改添加时间" width="450px" destroy-on-close>
      <el-form label-width="90px" label-position="left">
        <el-form-item label="添加时间">
          <div class="time-row">
            <el-date-picker
              v-model="timeValue"
              type="datetime"
              placeholder="选择日期时间"
              :clearable="false"
              style="flex: 1"
            />
            <el-link type="primary" underline="never" @click="timeValue = new Date()">设为当前时间</el-link>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEditTime">保存</el-button>
      </template>
    </el-dialog>

    <!-- 移动到其他工作组 -->
    <WorkspacePickerDialog
      v-model="moveOpen"
      title="移动到工作组"
      :disabled-ids="moveDisabledIds"
      @select="saveMove"
    />

    <!-- 设置标签页标签 -->
    <TagEditorDialog
      v-model="tagOpen"
      scope="tab"
      :selected-ids="tagSelectedIds"
      @confirm="saveTags"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Link } from '@element-plus/icons-vue'
import WorkspacePickerDialog from './WorkspacePickerDialog.vue'
import TagEditorDialog from './TagEditorDialog.vue'
import {
  addTabTag,
  listWorkspaceTabs,
  moveWorkspaceTab,
  removeTabTag,
  reportServiceError,
  updateWorkspaceTab,
} from '../services'
import type { TabReference } from '../types'
import type { WorkspaceTreeNode } from '../utils/workspace-tree'

export type CloudTabDialogMode = 'rename' | 'editUrl' | 'editDesc' | 'editTime' | 'move' | 'tag'

const props = defineProps<{
  /** 当前操作的标签页及其所属工作组 */
  target: { workspaceId: string; tab: TabReference } | null
  /** 打开哪个弹窗；null 表示全部关闭 */
  mode: CloudTabDialogMode | null
}>()

const emit = defineEmits<{
  'update:mode': [CloudTabDialogMode | null]
  /** 数据已写入后端，调用方按 workspaceId 刷新 */
  saved: [workspaceId: string]
}>()

const saving = ref(false)

const renameValue = ref('')
const editUrlValue = ref('')
const editDescValue = ref('')
const timeValue = ref<Date | null>(null)
const tagSelectedIds = ref<number[]>([])

const moveDisabledIds = computed(() => (props.target ? [props.target.workspaceId] : []))

function close(): void {
  emit('update:mode', null)
}

const renameOpen = computed({ get: () => props.mode === 'rename', set: (v: boolean) => { if (!v) close() } })
const editUrlOpen = computed({ get: () => props.mode === 'editUrl', set: (v: boolean) => { if (!v) close() } })
const editDescOpen = computed({ get: () => props.mode === 'editDesc', set: (v: boolean) => { if (!v) close() } })
const editTimeOpen = computed({ get: () => props.mode === 'editTime', set: (v: boolean) => { if (!v) close() } })
const moveOpen = computed({ get: () => props.mode === 'move', set: (v: boolean) => { if (!v) close() } })
const tagOpen = computed({ get: () => props.mode === 'tag', set: (v: boolean) => { if (!v) close() } })

watch(
  () => [props.mode, props.target] as const,
  ([mode, target]) => {
    if (!mode || !target) return
    const tab = target.tab
    if (mode === 'rename') renameValue.value = tab.displayName || tab.title || ''
    if (mode === 'editUrl') editUrlValue.value = tab.url
    if (mode === 'editDesc') editDescValue.value = tab.description || ''
    if (mode === 'editTime') {
      const d = new Date(tab.addedAt)
      timeValue.value = Number.isNaN(d.getTime()) ? new Date() : d
    }
    if (mode === 'tag') tagSelectedIds.value = (tab.tags ?? []).map((t) => t.id)
  },
)

function done(message: string): void {
  ElMessage.success(message)
  close()
}

async function saveRename(): Promise<void> {
  const target = props.target
  if (!target) return
  const name = renameValue.value.trim()
  saving.value = true
  try {
    await updateWorkspaceTab(target.workspaceId, target.tab.tabId, { displayName: name })
    done(name ? '已重命名' : '已恢复原始标题')
    emit('saved', target.workspaceId)
  } catch (err) {
    reportServiceError(err, { fallback: '更新失败' })
  } finally {
    saving.value = false
  }
}

async function saveEditUrl(): Promise<void> {
  const target = props.target
  const url = editUrlValue.value.trim()
  if (!target) return
  if (!url) {
    ElMessage.warning('请输入链接地址')
    return
  }
  saving.value = true
  try {
    await updateWorkspaceTab(target.workspaceId, target.tab.tabId, { url })
    done('链接已更新')
    emit('saved', target.workspaceId)
  } catch (err) {
    reportServiceError(err, { fallback: '更新失败' })
  } finally {
    saving.value = false
  }
}

async function saveEditDesc(): Promise<void> {
  const target = props.target
  if (!target) return
  saving.value = true
  try {
    await updateWorkspaceTab(target.workspaceId, target.tab.tabId, { description: editDescValue.value })
    done('描述已更新')
    emit('saved', target.workspaceId)
  } catch (err) {
    reportServiceError(err, { fallback: '更新失败' })
  } finally {
    saving.value = false
  }
}

async function saveEditTime(): Promise<void> {
  const target = props.target
  if (!target || !timeValue.value) return
  saving.value = true
  try {
    await updateWorkspaceTab(target.workspaceId, target.tab.tabId, {
      addedAt: timeValue.value.toISOString(),
    })
    done('添加时间已更新')
    emit('saved', target.workspaceId)
  } catch (err) {
    reportServiceError(err, { fallback: '更新失败' })
  } finally {
    saving.value = false
  }
}

async function saveMove(node: WorkspaceTreeNode): Promise<void> {
  const target = props.target
  if (!target) return
  try {
    // 追加到目标工作组末尾
    const tabs = await listWorkspaceTabs(node.id)
    await moveWorkspaceTab(node.id, target.tab.tabId, tabs.length)
    done(`已移动到「${node.name}」`)
    emit('saved', target.workspaceId)
    emit('saved', node.id)
  } catch (err) {
    reportServiceError(err, { fallback: '移动失败' })
  }
}

async function saveTags(ids: number[]): Promise<void> {
  const target = props.target
  if (!target) return
  const existing = (target.tab.tags ?? []).map((t) => t.id)
  const toAdd = ids.filter((id) => !existing.includes(id))
  const toRemove = existing.filter((id) => !ids.includes(id))
  saving.value = true
  try {
    for (const id of toAdd) await addTabTag(target.workspaceId, target.tab.tabId, id)
    for (const id of toRemove) await removeTabTag(target.workspaceId, target.tab.tabId, id)
    done('标签已更新')
    emit('saved', target.workspaceId)
  } catch (err) {
    reportServiceError(err, { fallback: '更新标签失败' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.time-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
</style>
