<template>
  <el-container class="dashboard-layout">
    <el-aside width="220px" class="dashboard-aside">
      <div class="aside-logo">
        <img class="aside-logo-img" src="/icons/icon.svg" alt="Tab Sync" />
        <div class="aside-logo-text">
          <span class="aside-logo-title">Tab Sync</span>
          <span class="aside-logo-sub">多端标签页同步</span>
        </div>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="aside-menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-divider class="aside-divider" />
        <el-menu-item index="/local-tabs">
          <el-icon><Collection /></el-icon>
          <span>本地标签页</span>
        </el-menu-item>
        <!-- <el-divider class="aside-divider" /> -->
        <el-menu-item index="/tabs">
          <el-icon><Files /></el-icon>
          <span>标签页</span>
          <span class="cloud-badge">云端</span>
        </el-menu-item>
        <el-menu-item index="/workspaces">
          <el-icon><FolderOpened /></el-icon>
          <span>工作组</span>
          <span class="cloud-badge">云端</span>
        </el-menu-item>
        <el-menu-item index="/tags">
          <el-icon><PriceTag /></el-icon>
          <span>标签</span>
          <span class="cloud-badge">云端</span>
        </el-menu-item>
        <el-menu-item index="/recyclebin">
          <el-icon><Delete /></el-icon>
          <span>回收站</span>
          <span class="cloud-badge">云端</span>
        </el-menu-item>
        <el-divider class="aside-divider" />
        <el-menu-item index="/devices">
          <el-icon><Monitor /></el-icon>
          <span>已登录设备</span>
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
          <el-divider direction="vertical" class="header-divider" />
          <template v-if="dataSource">
            <el-tag size="small" effect="plain" :type="dataSource.type" class="header-source-tag">
              {{ dataSource.label }}
            </el-tag>
            <el-text size="small" v-if="dataSource.desc" class="header-source-desc">
              {{ dataSource.desc }}
            </el-text>
          </template>
        </div>
        <div class="header-right">
          <el-button v-if="authenticated" type="danger" size="small" text @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            退出登录
          </el-button>
          <el-button v-else type="primary" size="small" text @click="loginVisible = true">
            <el-icon><Key /></el-icon>
            登录
          </el-button>
        </div>
      </el-header>
      <el-main class="dashboard-main" :class="{ 'dashboard-main--gated': authBlocked }">
        <router-view v-if="!authBlocked" />
        <!-- 未登录时仅放行设置页（Token 输入即面板内的登录入口），其他板块在主内容区提示 -->
        <div v-else class="auth-gate-card">
          <el-icon :size="48" color="#f56c6c"><WarningFilled /></el-icon>
          <h2>需要登录</h2>
          <p>未登录或登录已过期，该板块需连接同步服务后使用</p>
          <el-button @click="goToSettings">前往设置</el-button>
          <el-button type="primary" @click="loginVisible = true">立即登录</el-button>
        </div>
      </el-main>
    </el-container>
  </el-container>

  <!-- 登录弹窗：与侧边栏复用同一组件 -->
  <LoginDialog v-model="loginVisible" @login-success="onLoginSuccess" />

  <EntityTooltipHost />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Collection, FolderOpened, Monitor, Setting, WarningFilled, SwitchButton, PriceTag, Files, Odometer, Delete, Key } from '@element-plus/icons-vue'
import { sendMessage } from '@/shared/composables/useMessage'
import { ENTITY_NAVIGATION } from '@/shared/composables/entity-navigation'
import EntityTooltipHost from '@/shared/components/EntityTooltipHost.vue'
import LoginDialog from '@/shared/components/LoginDialog.vue'
import { dashboardTargetRoute } from '@/shared/utils/dashboard-links'
import { STORAGE_KEYS } from '@/shared/storage'
import type { StateData } from '@/shared/types'

const route = useRoute()
const router = useRouter()

/** 实体芯片在本页面内直接路由跳转，避免再开一个管理面板 */
provide(ENTITY_NAVIGATION, (target) => {
  void router.push(dashboardTargetRoute(target))
})

const authenticated = ref(true) // 默认假定已登录，避免首帧闪现未登录提示

/** 管理面板内的登录弹窗（与侧边栏复用） */
const loginVisible = ref(false)

const pageTitleMap: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/local-tabs': '本地标签页',
  '/tabs': '已同步标签页',
  '/workspaces': '工作组',
  '/tags': '标签',
  '/recyclebin': '回收站',
  '/devices': '登录设备管理',
  '/settings': '设置',
}

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => pageTitleMap[route.path] || '本地标签页')

/** 不依赖登录态、未登录也可访问的板块 */
const AUTH_FREE_ROUTES = new Set(['/settings', '/local-tabs'])

/** 未登录时仅设置与本地标签页可用，其余板块由主内容区提示替代渲染 */
const authBlocked = computed(() => !authenticated.value && !AUTH_FREE_ROUTES.has(route.path))

// 登录态失效后自动落到设置页，避免用户被锁在受限板块；本身免登录的板块保持原地址
watch(authenticated, (value) => {
  if (!value && !AUTH_FREE_ROUTES.has(route.path)) {
    void router.replace('/settings')
  }
})

/** 从路由 meta 中读取当前页面的数据来源标识 */
const dataSource = computed(() => route.meta.dataSource ?? null)

// 登录（侧边栏或设置页）与注销都会写入 Token，统一按新值刷新登录态
function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }) {
  const tokenChange = changes[STORAGE_KEYS.AUTH_TOKEN]
  if (tokenChange) {
    authenticated.value = !!tokenChange.newValue
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
  // 登录态由 storage 监听自动刷新，失效后会落到设置页，无需关闭管理面板
  ElMessage.success('已退出登录')
}

/** 登录入口：直达设置页的云端设置（API 地址与 Token 输入即面板内的登录表单） */
function goToSettings() {
  void router.push({ path: '/settings', query: { tab: 'cloud' } })
}

/** 面板内登录成功：先本地置位，storage 监听随后同步最新 Token 状态 */
function onLoginSuccess() {
  authenticated.value = true
  ElMessage.success('登录成功')
}

onMounted(async () => {
  chrome.storage.onChanged.addListener(handleStorageChange)
  // 先等路由就绪再检查登录态：初始 route.path 尚未解析时会被误判为受限页面，导致当前地址被重定向掉
  await router.isReady()
  retryCheckAuth()
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

/* ===== 侧边栏 ===== */
.dashboard-aside {
  background: linear-gradient(180deg, #1f2a44 0%, #141b2e 100%);
  overflow-y: auto;
  box-shadow: 2px 0 12px rgba(20, 27, 46, 0.18);
}

.aside-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.aside-logo-img {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  user-select: none;
}

.aside-logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  overflow: hidden;
}

.aside-logo-title {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.aside-logo-sub {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.aside-menu {
  border-right: none;
  background-color: transparent !important;
  padding: 8px;
}

.aside-menu :deep(.el-menu-item) {
  position: relative;
  height: 46px;
  margin: 4px 0;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.62);
  transition: color 0.2s ease, background-color 0.2s ease;
}

.aside-menu :deep(.el-menu-item .el-icon) {
  color: inherit;
  transition: transform 0.2s ease;
}

.aside-menu :deep(.el-menu-item:hover) {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.08);
}

.aside-menu :deep(.el-menu-item:hover .el-icon) {
  transform: scale(1.1);
}

.aside-menu :deep(.el-menu-item.is-active) {
  color: #6aa6ff;
  background-color: rgba(91, 155, 255, 0.18);
  font-weight: 600;
}

.aside-menu :deep(.el-menu-item.is-active .el-icon) {
  color: #6aa6ff;
}

.aside-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3.5px;
  height: 24px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #4c8dff 0%, #6a5cff 100%);
}

.aside-divider {
  margin: 6px 4px !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.cloud-badge {
  margin-left: auto;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 18px;
  border-radius: 9px;
  color: #7ee0a8;
  background: rgba(126, 224, 168, 0.14);
  border: 1px solid rgba(126, 224, 168, 0.3);
}

/* ===== 顶部 header ===== */
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  background-color: #fff;
  border-bottom: 1px solid #eef0f4;
  box-shadow: 0 2px 8px rgba(31, 42, 68, 0.05);
  padding: 0 28px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2a44;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-divider {
  height: 18px;
  border-color: #e4e7ed;
}

.header-source-tag {
  font-weight: 500;
}

.header-source-desc {
  color: #909399;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-main {
  background-color: #f5f7fa;
}

/* 登录过期提示：只占主内容区，侧边栏保持可操作 */
.dashboard-main--gated {
  display: flex;
  justify-content: center;
  align-items: center;
}

.auth-gate-card {
  background: #fff;
  border-radius: 16px;
  padding: 48px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 12px 40px rgba(20, 27, 46, 0.12);
}

.auth-gate-card h2 {
  margin: 16px 0 8px;
  font-size: 20px;
  color: #1f2a44;
}

.auth-gate-card p {
  margin: 0 0 24px;
  font-size: 14px;
  color: #909399;
}

.auth-gate-card .el-button {
  margin: 0 8px;
}
</style>
