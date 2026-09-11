<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="480px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="tag-editor">
      <!-- 输入：回车创建新标签，已选标签以彩色 chip 展示；
           原生 input 事件冒泡到外层 div，借此驱动下拉建议 -->
      <div class="input-wrap" @input="onDraft">
        <el-input-tag
          :model-value="selectedNames"
          clearable
          :maxlength="20"
          :save-on-blur="true"
          placeholder="输入以创建新标签，或从下拉/列表中选择"
          @update:model-value="onTagsUpdate"
          @add-tag="onAddTag"
        />

        <!-- 自定义下拉：随输入实时过滤已有标签，点击即选中（避免重复输入） -->
        <div v-if="showSuggestions" class="suggestions">
          <div
            v-for="t in suggestions"
            :key="t.id"
            class="suggestion-item"
            @mousedown.prevent="addExisting(t)"
          >
            <span class="tag-dot" :style="{ backgroundColor: t.color || '#909399' }" />
            <span class="suggestion-name">{{ t.name }}</span>
          </div>
          <div v-if="suggestions.length === 0" class="suggestion-empty">
            回车创建标签「{{ draft.trim() }}」
          </div>
        </div>
      </div>

      <!-- 搜索已有标签 -->
      <el-input
        v-model="filterKeyword"
        placeholder="搜索已有标签…"
        size="small"
        clearable
        :prefix-icon="Search"
        style="margin-top: 15px"
      />

      <!-- 标签列表：点击切换选中，已选高亮并置顶 -->
      <div class="tag-list">
        <div
          v-for="t in sortedTags"
          :key="t.id"
          class="tag-item"
          :class="{ selected: isSelected(t) }"
          @click="toggleTag(t)"
        >
          <span class="tag-dot" :style="{ backgroundColor: t.color || '#909399' }" />
          <span class="tag-name">{{ t.name }}</span>
          <el-icon class="tag-del" title="删除标签" @click.stop="deleteTag(t)">
            <Close />
          </el-icon>
        </div>
        <el-empty v-if="sortedTags.length === 0" description="没有匹配的标签" :image-size="40" />
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Close } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import type { TagInfo, TagsData } from '@/shared/types'

const props = defineProps<{
  modelValue: boolean
  scope: 'tab' | 'workspace'
  selectedIds: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: [number[]]
}>()

// 全部标签（用于列表/下拉展示与名称→ID 解析）
const allTags = ref<TagInfo[]>([])

// 选中的标签名称：el-input-tag 与下方列表共享的唯一直观真相
const selectedNames = ref<string[]>([])

// 输入框实时草稿（由外层 div 捕获的原生 input 事件驱动，用于下拉过滤）
const draft = ref('')
// 选中建议后临时收起下拉，避免残留
const suppress = ref(false)

// 列表筛选关键字
const filterKeyword = ref('')

const saving = ref(false)

const title = computed(() => (props.scope === 'workspace' ? '工作组标签' : '标签页标签'))

// 名称是否已被选中（不区分大小写）
function isSelected(tag: TagInfo): boolean {
  const arr = selectedNames.value
  if (!Array.isArray(arr)) return false
  const low = tag.name.toLowerCase()
  return arr.some((n) => n.toLowerCase() === low)
}

// el-input-tag 清除/清空可能回传非数组值，统一规整为数组
function onTagsUpdate(v: unknown) {
  selectedNames.value = Array.isArray(v) ? v : []
}

// 点击列表项切换选中
function toggleTag(tag: TagInfo) {
  const low = tag.name.toLowerCase()
  const idx = selectedNames.value.findIndex((n) => n.toLowerCase() === low)
  if (idx === -1) selectedNames.value.push(tag.name)
  else selectedNames.value.splice(idx, 1)
}

// 外层 div 的原生 input 事件（冒泡）捕获实时输入文本
function onDraft(e: Event) {
  draft.value = (e.target as HTMLInputElement)?.value ?? ''
  suppress.value = false
}

// 回车/失焦新增标签时去重：已存在同名（不区分大小写）则移除刚加入的重复项
function onAddTag(value: string | string[]) {
  const vals = Array.isArray(value) ? value : [value]
  for (const v of vals) {
    const low = v.toLowerCase()
    const indices = selectedNames.value
      .map((n, i) => (n.toLowerCase() === low ? i : -1))
      .filter((i) => i !== -1)
    if (indices.length > 1) {
      selectedNames.value.splice(indices[indices.length - 1], 1)
    }
  }
}

// 点击下拉建议项：选中已有标签，收起下拉
function addExisting(tag: TagInfo) {
  if (!isSelected(tag)) selectedNames.value.push(tag.name)
  suppress.value = true
  draft.value = ''
}

// 随输入过滤出尚未选中的已有标签
const suggestions = computed(() => {
  const kw = draft.value.trim().toLowerCase()
  if (!kw) return []
  return allTags.value
    .filter((t) => t.name.toLowerCase().includes(kw))
    .filter((t) => !isSelected(t))
    .slice(0, 8)
})

const showSuggestions = computed(() => draft.value.trim() !== '' && !suppress.value)

// 按关键字筛选；已选中的标签始终排在最前，便于对照
const sortedTags = computed(() => {
  const kw = filterKeyword.value.trim().toLowerCase()
  const list = kw
    ? allTags.value.filter((t) => t.name.toLowerCase().includes(kw))
    : [...allTags.value]
  return list.sort((a, b) => {
    const sa = isSelected(a) ? 0 : 1
    const sb = isSelected(b) ? 0 : 1
    return sa - sb
  })
})

// 打开弹窗时初始化
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedNames.value = props.selectedIds
        .map((id) => allTags.value.find((t) => t.id === id)?.name)
        .filter((n): n is string => n != null)
      filterKeyword.value = ''
      draft.value = ''
      suppress.value = false
      void loadTags()
    }
  },
)

async function loadTags() {
  const res = await sendMessage<TagsData>({ action: 'GET_TAGS', payload: { scope: props.scope } })
  if (res.success && res.data) {
    allTags.value = res.data.tags
    // 弹窗可能在 tags 返回前已用 props 初始化，这里补一次名称映射
    selectedNames.value = props.selectedIds
      .map((id) => res.data!.tags.find((t) => t.id === id)?.name)
      .filter((n): n is string => n != null)
  } else if (res.error) {
    ElMessage.error(res.error)
  }
}

/** 从列表中删除标签（二次确认，避免误删全局标签） */
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
    selectedNames.value = selectedNames.value.filter((n) => n.toLowerCase() !== tag.name.toLowerCase())
  } else if (res.authError) {
    ElMessage.warning('未连接到后端')
  } else {
    ElMessage.error(res.error || '删除标签失败')
  }
}

async function onConfirm() {
  saving.value = true
  try {
    // 去重（名称，不区分大小写）
    const lowerSeen = new Set<string>()
    const names: string[] = []
    for (const n of selectedNames.value.map((x) => x.trim()).filter(Boolean)) {
      const low = n.toLowerCase()
      if (lowerSeen.has(low)) continue
      lowerSeen.add(low)
      names.push(n)
    }
    const ids: number[] = []
    for (const name of names) {
      const existing = allTags.value.find((t) => t.name.toLowerCase() === name.toLowerCase())
      let id = existing?.id
      if (!id) {
        // 后端会按 名称+scope 去重：若已存在同名则复用其 ID，不会落库重复
        const res = await sendMessage<TagInfo>({
          action: 'CREATE_TAG',
          payload: { name, scope: props.scope },
        })
        if (res.success && res.data) {
          allTags.value.push(res.data)
          id = res.data.id
        } else if (res.authError) {
          ElMessage.warning('未连接到后端')
          return
        } else {
          ElMessage.error(res.error || '创建标签失败')
          return
        }
      }
      if (id) ids.push(id)
    }
    emit('confirm', ids)
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tag-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.input-wrap {
  position: relative;
}
.suggestions {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  box-shadow: var(--el-box-shadow-light);
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
}
.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}
.suggestion-item:hover {
  background: var(--el-fill-color-light);
}
.tag-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.suggestion-empty {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.tag-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 4px 0;
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  border-radius: 4px;
}
.tag-item:hover {
  background: var(--el-fill-color-light);
}
.tag-item.selected {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}
.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-del {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}
.tag-item:hover .tag-del {
  opacity: 1;
}
.tag-del:hover {
  color: var(--el-color-danger);
}
</style>
