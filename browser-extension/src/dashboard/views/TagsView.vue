<template>
  <div class="tags-view">
    <!-- 左侧：标签列表 -->
    <div class="tags-left">
      <div class="left-header">
        <span class="left-title">标签</span>
        <div class="left-actions">
          <el-button
            size="small"
            text
            :icon="Refresh"
            :loading="tagsLoading"
            title="刷新"
            @click="refresh"
          />
          <el-button size="small" type="primary" :icon="Plus" @click="openCreate">新建</el-button>
        </div>
      </div>

      <div v-if="tagsLoading" class="left-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
      <el-empty v-else-if="tags.length === 0" description="还没有标签" :image-size="60" />
      <div v-else class="tag-list">
        <div
          v-for="tag in tags"
          :key="tag.id"
          class="tag-item"
          :class="{ active: selectedTag?.id === tag.id }"
          @click="selectTag(tag)"
        >
          <span class="tag-dot" :style="{ backgroundColor: tag.color || '#909399' }" />
          <span class="tag-name">{{ tag.name }}</span>
          <span v-if="tag.description" class="tag-desc" :title="tag.description">{{ tag.description }}</span>
          <div class="tag-meta">
            <span v-if="tag.scope === 'tab'" class="tag-count" title="包含的标签页数">
              {{ tag.tabCount ?? 0 }}
            </span>
            <div class="tag-actions">
              <el-button
                class="tag-action"
                text
                size="small"
                :icon="Edit"
                title="重命名"
                @click.stop="openEdit(tag)"
              />
              <el-button
                class="tag-del"
                text
                size="small"
                :icon="Delete"
                title="删除"
                @click.stop="deleteTag(tag)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧：含该标签的标签页 -->
    <div class="tags-right">
      <div v-if="!selectedTag" class="right-empty">
        <el-empty description="选择左侧标签查看包含的标签页" />
      </div>

      <template v-else>
        <div class="right-header">
          <span class="right-title">
            <span class="tag-dot" :style="{ backgroundColor: selectedTag.color || '#909399' }" />
            {{ selectedTag.name }}
          </span>
          <span class="right-count">{{ tabs.length }} 个标签页</span>
        </div>

        <div v-if="tabsLoading" class="right-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
        <el-empty v-else-if="tabs.length === 0" description="该标签下暂无标签页" :image-size="60" />
        <div v-else class="tab-list">
          <TabList
            :items="listItems"
            @click="(item: any) => openTab(item.source)"
          >
            <template #actions="{ item }">
              <el-button
                text
                :icon="Delete"
                title="移除该标签"
                @click="removeTagFromTab((item as any).source)"
              >移除</el-button>
            </template>
          </TabList>
        </div>
      </template>
    </div>

    <!-- 新建/编辑标签对话框 -->
    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新建标签' : '编辑标签'" width="380px">
      <el-form label-width="64px">
        <el-form-item label="名称">
          <el-input v-model="tagForm.name" placeholder="标签名称" maxlength="32" show-word-limit />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="tagForm.color" color-format="hex" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="tagForm.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可选，仅当你填写时才会保存"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!tagForm.name.trim()" @click="submitTag">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import TabList, { type TabListItem } from '@/shared/components/TabList.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Loading, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import { openTabAfterActive } from '@/shared/utils/tab-utils'
import type { TagInfo } from '@/shared/types/workspace'
import type { TagTabItem, TagsData, TagTabsData } from '@/shared/types/messages'

const tags = ref<TagInfo[]>([])
const tagsLoading = ref(false)
const selectedTag = ref<TagInfo | null>(null)
const tabs = ref<TagTabItem[]>([])
const tabsLoading = ref(false)

interface TagListItem extends TabListItem {
  source: TagTabItem
}

/** 标签下标签页 → 公共列表组件数据 */
const listItems = computed<TagListItem[]>(() =>
  tabs.value.map((t) => ({
    id: `${t.workspaceId}-${t.tabId}`,
    title: t.title || t.url,
    url: t.url,
    favIconUrl: t.favIconUrl,
    badgeText: t.workspaceName,
    source: t,
  })),
)

// 新建/编辑标签对话框
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingTag = ref<TagInfo | null>(null)
const tagForm = reactive({ name: '', color: '#409EFF', description: '' })

async function loadTags() {
  tagsLoading.value = true
  try {
    const res = await sendMessage<TagsData>({ action: 'GET_TAGS' })
    if (res.success && res.data) {
      tags.value = res.data.tags ?? []
    } else if (res.authError) {
      tags.value = []
    } else {
      ElMessage.error(res.error || '获取标签失败')
    }
  } finally {
    tagsLoading.value = false
  }
}

async function selectTag(tag: TagInfo) {
  selectedTag.value = tag
  await loadTagTabs(tag.id)
}

async function loadTagTabs(tagId: number) {
  tabsLoading.value = true
  tabs.value = []
  try {
    const res = await sendMessage<TagTabsData>({ action: 'GET_TAG_TABS', payload: { tagId } })
    if (res.success && res.data) {
      tabs.value = res.data.tabs ?? []
    } else if (!res.authError) {
      ElMessage.error(res.error || '获取标签页失败')
    }
  } finally {
    tabsLoading.value = false
  }
}

function openCreate() {
  dialogMode.value = 'create'
  editingTag.value = null
  tagForm.name = ''
  tagForm.color = '#409EFF'
  tagForm.description = ''
  dialogVisible.value = true
}

async function createTag() {
  const name = tagForm.name.trim()
  if (!name) return
  try {
    const res = await sendMessage({
      action: 'CREATE_TAG',
      payload: { name, color: tagForm.color, scope: 'tab', description: tagForm.description },
    })
    if (res.success) {
      ElMessage.success('已创建标签')
      dialogVisible.value = false
      await loadTags()
    } else if (res.authError) {
      ElMessage.warning('未连接到后端')
    } else {
      ElMessage.error(res.error || '创建标签失败')
    }
  } catch (e) {
    ElMessage.error('创建标签失败：' + (e as Error).message)
  }
}

async function deleteTag(tag: TagInfo) {
  try {
    await ElMessageBox.confirm(
      `确定删除标签「${tag.name}」吗？该标签将从相关标签页与工作组上移除，对应的记录不会被删除。`,
      '删除标签',
      {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    const res = await sendMessage({ action: 'DELETE_TAG', payload: { tagId: tag.id } })
    if (res.success) {
      ElMessage.success('已删除')
      if (selectedTag.value?.id === tag.id) {
        selectedTag.value = null
        tabs.value = []
      }
      await loadTags()
    } else if (res.authError) {
      ElMessage.warning('未连接到后端')
    } else {
      ElMessage.error(res.error || '删除标签失败')
    }
  } catch (e) {
    ElMessage.error('删除标签失败：' + (e as Error).message)
  }
}

function openEdit(tag: TagInfo) {
  dialogMode.value = 'edit'
  editingTag.value = tag
  tagForm.name = tag.name
  tagForm.color = tag.color || '#409EFF'
  tagForm.description = tag.description || ''
  dialogVisible.value = true
}

async function saveTag() {
  const name = tagForm.name.trim()
  if (!name || !editingTag.value) return
  // 清空颜色时 picker 值为 undefined，归一化为空字符串以告知后端清除颜色
  const color = tagForm.color || ''
  try {
    const res = await sendMessage({
      action: 'UPDATE_TAG',
      payload: { tagId: editingTag.value.id, name, color, description: tagForm.description },
    })
    if (res.success) {
      ElMessage.success('已更新标签')
      dialogVisible.value = false
      // 更新本地列表中的标签信息
      const idx = tags.value.findIndex(t => t.id === editingTag.value!.id)
      if (idx !== -1) {
        tags.value[idx] = { ...tags.value[idx], name, color, description: tagForm.description }
      }
      // 更新右侧选中的标签信息
      if (selectedTag.value?.id === editingTag.value!.id) {
        selectedTag.value = { ...selectedTag.value, name, color, description: tagForm.description }
      }
    } else if (res.authError) {
      ElMessage.warning('未连接到后端')
    } else {
      ElMessage.error(res.error || '更新标签失败')
    }
  } catch (e) {
    ElMessage.error('更新标签失败：' + (e as Error).message)
  }
}

async function submitTag() {
  if (dialogMode.value === 'create') {
    await createTag()
  } else {
    await saveTag()
  }
}

async function openTab(tab: TagTabItem) {
  if (tab.url) await openTabAfterActive(tab.url)
}

async function removeTagFromTab(tab: TagTabItem) {
  if (!selectedTag.value) return
  try {
    const res = await sendMessage({ action: 'REMOVE_TAB_TAG', payload: {
      workspaceId: tab.workspaceId,
      tabId: String(tab.tabId),
      tagId: selectedTag.value.id,
    } })
    if (res.success) {
      ElMessage.success('已移除标签')
      await loadTagTabs(selectedTag.value.id)
    } else if (res.authError) {
      ElMessage.warning('未连接到后端')
    } else {
      ElMessage.error(res.error || '移除标签失败')
    }
  } catch (e) {
    ElMessage.error('移除标签失败：' + (e as Error).message)
  }
}

async function refresh() {
  await loadTags()
  if (selectedTag.value) {
    await loadTagTabs(selectedTag.value.id)
  }
  ElMessage.success('已刷新')
}

onMounted(loadTags)
</script>

<style scoped>
.tags-view {
  display: flex;
  height: 100%;
  box-sizing: border-box;
}
.tags-left {
  width: 240px;
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  box-sizing: border-box;
}
.left-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.left-title {
  font-weight: 600;
  font-size: 14px;
}
.left-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.left-loading,
.right-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}
.tag-list {
  flex: 1;
  overflow-y: auto;
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.tag-item:hover {
  background: var(--el-fill-color-light);
}
.tag-item.active {
  background: var(--el-color-primary-light-9);
}
.tag-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.tag-count {
  display: inline-block;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  overflow: hidden;
  transition: opacity 0.15s, max-width 0.15s, padding 0.15s;
}
.tag-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 0.15s, opacity 0.15s;
}
.tag-actions .el-button {
  margin-left: 0;
  padding: 4px;
  color: var(--el-text-color-regular);
}
.tag-actions .el-button:hover {
  color: var(--el-color-primary);
}
.tag-actions .tag-del:hover {
  color: var(--el-color-danger);
}
.tag-item:hover .tag-count {
  min-width: 0;
  max-width: 0;
  padding: 0;
  opacity: 0;
}
.tag-item:hover .tag-actions {
  max-width: 60px;
  opacity: 1;
}
.tags-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}
.right-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.right-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.right-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}
.right-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tab-list {
  flex: 1;
  overflow-y: auto;
}
</style>
