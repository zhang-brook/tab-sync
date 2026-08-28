<template>
  <el-container class="dashboard-layout">
    <el-aside width="200px" class="dashboard-aside">
      <div class="aside-logo">
        <h3>Tab Sync</h3>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-divider style="margin: 0; opacity: 0.4;" />
        <el-menu-item index="/tabs">
          <el-icon><Collection /></el-icon>
          <span>本地标签页</span>
        </el-menu-item>
        <!-- <el-divider style="margin: 0; opacity: 0.4;" /> -->
        <el-menu-item index="/synced">
          <el-icon><Files /></el-icon>
          <span>标签页</span>
          <el-tag size="small" effect="plain" type="success" style="transform: scale(0.8); opacity: 0.9;">
            云端
          </el-tag>
        </el-menu-item>
        <el-menu-item index="/workspaces">
          <el-icon><FolderOpened /></el-icon>
          <span>工作组</span>
          <el-tag size="small" effect="plain" type="success" style="transform: scale(0.8); opacity: 0.9;">
            云端
          </el-tag>
        </el-menu-item>
        <el-menu-item index="/tags">
          <el-icon><PriceTag /></el-icon>
          <span>标签</span>
          <el-tag size="small" effect="plain" type="success" style="transform: scale(0.8); opacity: 0.9;">
            云端
          </el-tag>
        </el-menu-item>
        <el-menu-item index="/recyclebin">
          <el-icon><Delete /></el-icon>
          <span>回收站</span>
          <el-tag size="small" effect="plain" type="success" style="transform: scale(0.8); opacity: 0.9;">
            云端
          </el-tag>
        </el-menu-item>
        <el-divider style="margin: 0; opacity: 0.4;" />
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
        <div class="header-left">
          <span class="header-title">{{ pageTitle }}</span>
          <template v-if="dataSource">
            <el-tag size="small" effect="plain" :type="dataSource.type">
              {{ dataSource.label }}
            </el-tag>
            <el-text size="small" v-if="dataSource.desc">
              {{ dataSource.desc }}
            </el-text>
          </template>
        </div>
        <div v-if="authenticated" class="header-right">
          <el-button type="danger" size="small" text @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            退出登录
          </el-button>
        </div>
      </el-header>
      <el-main class="dashboard-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>

  <!-- 登录过期遮罩 -->
  <div v-if="!authenticated" class="auth-overlay">
    <div class="auth-overlay-card">
      <el-icon :size="48" color="#f56c6c"><WarningFilled /></el-icon>
      <h2>登录已过期</h2>
      <p>请通过扩展侧边栏重新登录后再继续使用</p>
      <el-button type="primary" @click="openSidePanel">重新登录</el-button>
      <el-button text @click="retryCheckAuth">我已登录</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Collection, FolderOpened, Monitor, Setting, WarningFilled, SwitchButton, PriceTag, Files, Odometer, Delete } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import { STORAGE_KEYS } from '@/shared/storage'
import type { StateData } from '@/shared/types'

const route = useRoute()

const authenticated = ref(true) // 默认假定已登录，避免闪现遮罩

const pageTitleMap: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/tabs': '本地标签页',
  '/workspaces': '工作组',
  '/tags': '标签',
  '/synced': '已同步标签页',
  '/recyclebin': '回收站',
  '/devices': '设备管理',
  '/settings': '设置',
}

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => pageTitleMap[route.path] || '本地标签页')

/** 从路由 meta 中读取当前页面的数据来源标识 */
const dataSource = computed(() => route.meta.dataSource ?? null)

// 监听 storage 变化，检测 token 被清除
function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
  if (changes[STORAGE_KEYS.AUTH_TOKEN] && !changes[STORAGE_KEYS.AUTH_TOKEN].newValue) {
    authenticated.value = false
  }
}

async function retryCheckAuth() {
  const res = await sendMessage<StateData>({ action: 'GET_STATE' })
  if (res.success && res.data) {
    authenticated.value = res.data.auth?.authenticated ?? false
  }
}

/** 退出登录 */
async function handleLogout() {
  try {
    // 全局已配置 zh-CN 语言包，默认 确定/取消 按钮即为中文，无需手动指定
    await ElMessageBox.confirm('确定要退出登录吗？', '退出登录', { type: 'warning' })
  } catch {
    return // 用户取消
  }
  await sendMessage({ action: 'LOGOUT' })
  // 页面将被关闭，所以短期内暂不更新状态，避免页面闪现登录态过期弹窗
  setTimeout(() => {
    authenticated.value = false
  }, 1000)
  ElMessage.success('已退出登录')

  // 关闭当前后台管理页面，用户可通过侧边栏重新登录
  window.close()
}

/** 打开侧边栏以便重新登录（扩展未配置 popup，登录入口在侧边栏） */
async function openSidePanel() {
  try {
    const win = await chrome.windows.getCurrent()
    await chrome.sidePanel.open({ windowId: win.id! })
  } catch {
    ElMessage.info('请点击浏览器工具栏中的扩展图标打开侧边栏登录')
  }
}

onMounted(() => {
  retryCheckAuth()
  chrome.storage.onChanged.addListener(handleStorageChange)
})

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(handleStorageChange)
})
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
  padding-left: 0px;
  padding-right: 0px;
}

.dashboard-aside .el-menu-item:hover,
.dashboard-aside .el-menu-item.is-active {
  color: #fff;
  background-color: #1890ff;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fff;
  border-bottom: 1px solid #f0f0f0;
  padding: 0 24px;
}

.header-title {
  font-size: 18px;
  font-weight: 500;
  color: #303133;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-main {
  background-color: #f5f7fa;
}

/* 登录过期遮罩 */
.auth-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.auth-overlay-card {
  background: #fff;
  border-radius: 12px;
  padding: 48px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.auth-overlay-card h2 {
  margin: 16px 0 8px;
  font-size: 20px;
  color: #303133;
}

.auth-overlay-card p {
  margin: 0 0 24px;
  font-size: 14px;
  color: #909399;
}

.auth-overlay-card .el-button {
  margin: 0 8px;
}
</style>
