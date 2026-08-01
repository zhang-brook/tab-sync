<template>
  <el-dropdown-menu>
    <el-dropdown-item command="open" :icon="View">在新标签页中打开</el-dropdown-item>
    <el-dropdown-item command="copyTitle" :icon="DocumentCopy" divided>复制标题</el-dropdown-item>
    <el-dropdown-item command="copyLink" :icon="Link">复制链接</el-dropdown-item>
    <el-dropdown-item command="editTime" :icon="Clock" divided>修改添加时间</el-dropdown-item>
    <el-dropdown-item command="rename" :icon="Edit">重命名</el-dropdown-item>
    <el-dropdown-item command="tag" :icon="PriceTag">标签</el-dropdown-item>
    <el-dropdown-item command="move" :icon="Rank">移动到其他工作组</el-dropdown-item>
    <el-dropdown-item command="remove" :icon="Delete" divided class="danger-dropdown-item">从工作组中移除</el-dropdown-item>
  </el-dropdown-menu>
</template>

<script setup lang="ts">
import { View, DocumentCopy, Link, Clock, Edit, PriceTag, Rank, Delete } from '@element-plus/icons-vue'
</script>
