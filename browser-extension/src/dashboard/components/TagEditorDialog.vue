<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="440px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="tag-editor">
      <el-checkbox-group v-model="selected">
        <el-checkbox v-for="t in tags" :key="t.id" :label="t.id">{{ t.name }}</el-checkbox>
      </el-checkbox-group>
      <el-empty v-if="tags.length === 0" description="暂无标签，可在下方新建" :image-size="60" />
      <el-divider />
      <div class="tag-create">
        <el-input v-model="newName" placeholder="新标签名称" size="small" style="flex: 1" />
        <el-color-picker v-model="newColor" size="small" />
        <el-button size="small" type="primary" @click="createAndSelect">新建</el-button>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="onConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { sendMessage } from '../../shared/composables/useMessage'
import type { TagsData, TagInfo } from '../../shared/types'

const props = defineProps<{
  modelValue: boolean
  scope: 'tab' | 'workspace'
  selectedIds: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  confirm: [number[]]
}>()

const tags = ref<TagInfo[]>([])
const selected = ref<number[]>([])
const newName = ref('')
const newColor = ref('')

const title = computed(() => (props.scope === 'workspace' ? '工作组标签' : '标签页标签'))

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selected.value = [...props.selectedIds]
      void loadTags()
    }
  },
)

async function loadTags() {
  const res = await sendMessage<TagsData>({ action: 'GET_TAGS', payload: { scope: props.scope } })
  if (res.success && res.data) {
    tags.value = res.data.tags
  } else if (res.error) {
    ElMessage.error(res.error)
  }
}

async function createAndSelect() {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning('请输入标签名称')
    return
  }
  const res = await sendMessage<TagInfo>({
    action: 'CREATE_TAG',
    payload: { name, color: newColor.value || undefined, scope: props.scope },
  })
  if (res.success && res.data) {
    tags.value.push(res.data)
    if (!selected.value.includes(res.data.id)) selected.value.push(res.data.id)
    newName.value = ''
    newColor.value = ''
  } else {
    ElMessage.error(res.error || '创建标签失败')
  }
}

function onConfirm() {
  emit('confirm', selected.value)
  emit('update:modelValue', false)
}
</script>

<style scoped>
.tag-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tag-create {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
