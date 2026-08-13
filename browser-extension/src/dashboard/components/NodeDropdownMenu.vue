<template>
  <el-dropdown-menu>
    <el-dropdown-item :command="'open'" :icon="FolderOpened" :disabled="data.tabCount === 0">
      打开所有标签页
      <el-text type="info" style="margin-left: 6.18px;" v-if="data.tabCount > 0">
        ({{ data.tabCount }}个标签页)
      </el-text>
    </el-dropdown-item>
    <el-dropdown-item :command="'openNewWindow'" :icon="CopyDocument" :disabled="data.tabCount === 0">
      打开所有标签页（新窗口）
    </el-dropdown-item>
    <el-dropdown-item :command="'openAsGroup'" :icon="Collection" :disabled="data.tabCount === 0">
      打开所有标签页（打开为标签组）
    </el-dropdown-item>
    <el-dropdown-item :command="'createChild'" :icon="FolderAdd" divided>
      新建子工作组
    </el-dropdown-item>
    <el-dropdown-item :command="'setDefault'" :icon="Star" :disabled="data.id === defaultWorkspaceId">
      设置为默认分组
    </el-dropdown-item>
    <el-dropdown-item :command="'edit'" :icon="Edit" :disabled="data.workspace?.isSystem">
      编辑
    </el-dropdown-item>
    <el-dropdown-item :command="'delete'" :icon="Delete" divided class="danger-dropdown-item" :disabled="data.workspace?.isSystem">
      删除
    </el-dropdown-item>
  </el-dropdown-menu>
</template>

<script setup lang="ts">
import { FolderOpened, CopyDocument, Collection, FolderAdd, Edit, Delete, Star } from '@element-plus/icons-vue'
import type { WorkspaceTreeNode } from '@/shared/utils/workspace-tree'

defineProps<{
  data: WorkspaceTreeNode
  /** 当前默认分组 ID，与节点 ID 一致时「设置为默认分组」置灰 */
  defaultWorkspaceId?: string
}>()
</script>
