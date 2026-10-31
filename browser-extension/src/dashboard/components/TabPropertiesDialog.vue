<template>
  <el-dialog v-model="visible" title="标签页属性" width="520px" destroy-on-close>
    <div v-if="tab" class="props-body">
      <div class="props-header">
        <LazyFavicon :fav-icon-url="tab.favIconUrl" :size="20" class="props-favicon" />
        <div class="props-title">
          <div class="props-title-row">
            <span class="props-name">{{ title }}</span>
          </div>
          <div v-if="tab.displayName && tab.title" class="props-path-row">
            <span class="props-path">原标题：{{ tab.title }}</span>
          </div>
          <div class="props-path-row">
            <span class="props-path">ID：{{ tab.tabId }}</span>
          </div>
          <div class="props-path-row">
            <span class="props-path">链接：{{ tab.url }}</span>
            <el-button link type="info" size="small" :icon="CopyDocument" @click="copyUrl">复制</el-button>
          </div>
        </div>
      </div>
      <el-descriptions :column="1" border label-width="calc((1 - 0.618) * 100%)">
        <el-descriptions-item label="所在工作组">{{ workspacePath || '—' }}</el-descriptions-item>
        <el-descriptions-item label="标签">
          <span v-if="tab.tags?.length" class="props-tags">
            <el-tag v-for="tg in tab.tags" :key="tg.id" size="small" effect="plain"
              :style="tg.color ? { color: tg.color, borderColor: tg.color } : {}">{{ tg.name }}</el-tag>
          </span>
          <span v-else class="props-muted">—</span>
        </el-descriptions-item>
        <el-descriptions-item label="描述">
          <span :class="{ 'props-muted': !tab.description }">{{ tab.description || '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="添加时间">{{ formatDateTime(tab.addedAt) }}</el-descriptions-item>
      </el-descriptions>
    </div>
    <template #footer>
      <el-button type="primary" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LazyFavicon from '@/shared/components/LazyFavicon.vue'
import { copyText } from '@/shared/utils/clipboard'
import { formatDateTime } from '@/shared/utils/format'
import type { TabReference } from '@/shared/types'

const props = defineProps<{
  modelValue: boolean
  /** 要展示属性的标签页 */
  tab: TabReference | null
  /** 标签页所在工作组的完整路径，如 /分组1/子分组2 */
  workspacePath: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** 重命名时优先展示显示名 */
const title = computed(() => props.tab?.displayName || props.tab?.title || '')

async function copyUrl() {
  if (!props.tab) return
  const ok = await copyText(props.tab.url)
  if (ok) ElMessage.success('链接已复制')
  else ElMessage.error('复制失败')
}
</script>

<style scoped>
.props-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.props-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.props-favicon {
  margin-top: 3px;
}

.props-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.props-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.props-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.props-path-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.props-path {
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}

.props-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.props-muted {
  color: #909399;
}
</style>
