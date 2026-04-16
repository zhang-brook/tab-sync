<template>
  <el-container class="dashboard-layout">
    <el-aside width="200px" class="dashboard-aside">
      <div class="aside-logo">
        <h3>SpiderMemos</h3>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
      >
        <el-menu-item index="/tabs">
          <el-icon><Collection /></el-icon>
          <span>标签页</span>
        </el-menu-item>
        <el-menu-item index="/workspaces">
          <el-icon><FolderOpened /></el-icon>
          <span>工作组</span>
        </el-menu-item>
        <el-menu-item index="/history">
          <el-icon><Clock /></el-icon>
          <span>历史记录</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <el-icon><Monitor /></el-icon>
          <span>设备</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="dashboard-header">
        <span class="header-title">{{ pageTitle }}</span>
      </el-header>
      <el-main class="dashboard-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Collection, FolderOpened, Clock, Monitor, Setting } from '@element-plus/icons-vue'

const route = useRoute()

const pageTitleMap: Record<string, string> = {
  '/tabs': '标签页管理',
  '/workspaces': '工作组',
  '/history': '历史记录',
  '/devices': '设备管理',
  '/settings': '设置',
}

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => pageTitleMap[route.path] || '标签页管理')
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
</style>

<style scoped>
.dashboard-layout {
  height: 100vh;
}

.dashboard-aside {
  background-color: #001529;
  overflow-y: auto;
}

.aside-logo {
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.aside-logo h3 {
  color: #fff;
  font-size: 16px;
  margin: 0;
}

.dashboard-aside .el-menu {
  border-right: none;
  background-color: #001529;
}

.dashboard-aside .el-menu-item {
  color: rgba(255, 255, 255, 0.65);
}

.dashboard-aside .el-menu-item:hover,
.dashboard-aside .el-menu-item.is-active {
  color: #fff;
  background-color: #1890ff;
}

.dashboard-header {
  display: flex;
  align-items: center;
  background-color: #fff;
  border-bottom: 1px solid #f0f0f0;
  padding: 0 24px;
}

.header-title {
  font-size: 18px;
  font-weight: 500;
  color: #303133;
}

.dashboard-main {
  background-color: #f5f7fa;
}
</style>
