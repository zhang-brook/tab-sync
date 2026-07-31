<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="480px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="tag-editor">
      <!-- Input-tag: 搜索/选中已有标签，输入新名称创建 -->
      <el-input-tag
        v-model="selectedNames"
        :options="tagOptions"
        placeholder="搜索或输入标签名称..."
        clearable
        filterable
        allow-create
        @change="onInputTagChange"
      />

      <el-divider />

      <!-- 标签列表筛选 -->
      <el-input
        v-model="filterKeyword"
        placeholder="筛选标签..."
        size="small"
        clearable
        :prefix-icon="Search"
      />

      <!-- 全部标签列表（带复选框，与 input-tag 同步） -->
      <div class="tag-list">
        <el-checkbox-group v-model="selectedIds" @change="onCheckboxChange">
          <div v-for="t in filteredTags" :key="t.id" class="tag-item">
            <el-checkbox :value="t.id">
              <span class="tag-dot" :style="{ backgroundColor: t.color || '#909399' }" />
              {{ t.name }}
            </el-checkbox>
            <el-button
              class="tag-item-del"
              text
              size="small"
              :icon="Close"
              @click.stop="deleteTag(t)"
            />
          </div>
        </el-checkbox-group>
        <el-empty v-if="filteredTags.length === 0" description="没有匹配的标签" :image-size="40" />
      </div>

      <!-- 从列表新建标签 -->
      <div class="tag-create">
        <el-input v-model="newName" placeholder="新标签名称" size="small" style="flex: 1" maxlength="20" show-word-limit />
        <el-color-picker v-model="newColor" size="small" />
        <el-button size="small" type="primary" :disabled="!newName.trim()" @click="createTagFromList">新建</el-button>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Close } from '@element-plus/icons-vue'
import { sendMessage } from '../../shared/composables/useMessage'
import type { TagInfo, TagsData } from '../../shared/types'

const props = defineProps<{
  modelValue: boolean
  scope: 'tab' | 'workspace'
  selectedIds: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: [number[]]
}>()

// 全部标签
const allTags = ref<TagInfo[]>([])

// 选中的标签 ID（与 checkbox-group 绑定）
const selectedIds = ref<number[]>([])

// 选中的标签名称（与 input-tag 绑定）
const selectedNames = ref<string[]>([])

// 列表筛选关键字
const filterKeyword = ref('')

// 列表新建标签
const newName = ref('')
const newColor = ref('')

// 防循环同步标志
let syncingInput = false
let syncingCheckbox = false

const title = computed(() => (props.scope === 'workspace' ? '工作组标签' : '标签页标签'))

// input-tag 下拉选项
const tagOptions = computed(() =>
  allTags.value.map((t) => ({ label: t.name, value: t.name })),
)

// 按关键字筛选后的标签
const filteredTags = computed(() => {
  const kw = filterKeyword.value.trim().toLowerCase()
  if (!kw) return allTags.value
  return allTags.value.filter((t) => t.name.toLowerCase().includes(kw))
})

// 打开弹窗时初始化
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedIds.value = [...props.selectedIds]
      // 同步到 selectedNames
      syncingCheckbox = true
      selectedNames.value = props.selectedIds
        .map((id) => allTags.value.find((t) => t.id === id)?.name)
        .filter((n): n is string => n != null)
      syncingCheckbox = false
      filterKeyword.value = ''
      newName.value = ''
      newColor.value = ''
      void loadTags()
    }
  },
)

// 监听 selectedIds 变化（checkbox 点击）→ 同步到 selectedNames
watch(selectedIds, (ids) => {
  if (syncingInput) return
  syncingCheckbox = true
  selectedNames.value = ids
    .map((id) => allTags.value.find((t) => t.id === id)?.name)
    .filter((n): n is string => n != null)
  syncingCheckbox = false
})

async function loadTags() {
  const res = await sendMessage<TagsData>({ action: 'GET_TAGS', payload: { scope: props.scope } })
  if (res.success && res.data) {
    allTags.value = res.data.tags
  } else if (res.error) {
    ElMessage.error(res.error)
  }
}

/** input-tag 值变化：创建新标签，同步到 selectedIds */
async function onInputTagChange() {
  if (syncingCheckbox) return
  syncingInput = true

  // 检测并创建新标签
  for (const name of selectedNames.value) {
    if (!allTags.value.find((t) => t.name === name)) {
      const res = await sendMessage<TagInfo>({
        action: 'CREATE_TAG',
        payload: { name, scope: props.scope },
      })
      if (res.success && res.data) {
        allTags.value.push(res.data)
      } else {
        ElMessage.error(res.error || '创建标签失败')
      }
    }
  }

  // 同步到 selectedIds
  selectedIds.value = allTags.value
    .filter((t) => selectedNames.value.includes(t.name))
    .map((t) => t.id)

  syncingInput = false
}

/** checkbox 点击同步（由 watch 自动处理） */
function onCheckboxChange() {
  // 不需要额外逻辑，watch(selectedIds) 会同步
}

/** 从列表底部新建标签 */
async function createTagFromList() {
  const name = newName.value.trim()
  if (!name) return
  const res = await sendMessage<TagInfo>({
    action: 'CREATE_TAG',
    payload: { name, color: newColor.value || undefined, scope: props.scope },
  })
  if (res.success && res.data) {
    allTags.value.push(res.data)
    // 自动选中
    selectedIds.value = [...selectedIds.value, res.data.id]
    newName.value = ''
    newColor.value = ''
  } else {
    ElMessage.error(res.error || '创建标签失败')
  }
}

/** 从列表中删除标签 */
async function deleteTag(tag: TagInfo) {
  try {
    await ElMessageBox.confirm(
      `确定删除标签「${tag.name}」吗？该标签将从相关标签页与工作组上移除。`,
      '删除标签',
      { type: 'warning' },
    )
  } catch {
    return
  }
  const res = await sendMessage({ action: 'DELETE_TAG', payload: { tagId: tag.id } })
  if (res.success) {
    allTags.value = allTags.value.filter((t) => t.id !== tag.id)
    selectedIds.value = selectedIds.value.filter((id) => id !== tag.id)
  } else if (res.authError) {
    ElMessage.warning('未连接到后端')
  } else {
    ElMessage.error(res.error || '删除标签失败')
  }
}

function onConfirm() {
  emit('confirm', [...selectedIds.value])
  emit('update:modelValue', false)
}
</script>

<style scoped>
.tag-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 4px 0;
}
.tag-item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
}
.tag-item:hover {
  background: var(--el-fill-color-light);
}
.tag-item :deep(.el-checkbox) {
  flex: 1;
  height: 32px;
}
.tag-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.tag-item-del {
  opacity: 0;
  flex-shrink: 0;
}
.tag-item:hover .tag-item-del {
  opacity: 1;
}
.tag-create {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>