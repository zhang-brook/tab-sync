<template>
  <div class="popup-container">
    <div class="popup-header">
      <h3>SpiderMemos Tab Sync</h3>
    </div>

    <!-- 未登录：显示登录面板 -->
    <LoginPanel v-if="!authenticated" @login-success="loadState" />

    <!-- 已登录：显示状态和操作 -->
    <div v-else class="popup-body">
      <div class="user-info">
        <el-tag type="success" size="small">已登录</el-tag>
        <span class="username">{{ userName }}</span>
        <el-button type="danger" size="small" text @click="handleLogout">
          退出
        </el-button>
      </div>

      <el-divider style="margin: 8px 0" />

      <div class="stat-row">
        <div class="stat-item">
          <span class="stat-value">{{ tabCount.open }}</span>
          <span class="stat-label">打开</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ tabCount.closed }}</span>
          <span class="stat-label">已关闭</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ syncStatusText }}</span>
          <span class="stat-label">同步</span>
        </div>
      </div>

      <el-divider style="margin: 8px 0" />

      <div class="actions">
        <el-button size="small" @click="openSidePanel">
          打开侧边栏
        </el-button>
        <el-button type="primary" size="small" @click="openDashboard">
          管理面板
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LoginPanel from './components/LoginPanel.vue'
import { sendMessage } from '../shared/composables/useMessage'
import type { StateData } from '../shared/types'

const authenticated = ref(false)
const userName = ref('')
const tabCount = ref({ open: 0, closed: 0 })
const syncStatusText = ref('--')

const syncStatusMap: Record<string, string> = {
  idle: '空闲',
  syncing: '同步中',
  error: '异常',
}

onMounted(() => {
  loadState()
})

async function loadState() {
  const res = await sendMessage<StateData>({ action: 'GET_STATE' })
  if (res.success && res.data) {
    authenticated.value = res.data.auth.authenticated
    userName.value = res.data.auth.user?.username || ''
    tabCount.value = res.data.tabCount
    syncStatusText.value = syncStatusMap[res.data.syncStatus] || '--'
  }
}

async function handleLogout() {
  await sendMessage({ action: 'LOGOUT' })
  authenticated.value = false
  userName.value = ''
}

function openDashboard() {
  sendMessage({ action: 'OPEN_DASHBOARD' })
}

function openSidePanel() {
  chrome.windows.getCurrent((win) => {
    if (win.id != null) {
      chrome.sidePanel.open({ windowId: win.id }).catch(() => {})
    }
  })
  window.close()
}
</script>

<style scoped>
.popup-container {
  width: 320px;
  padding: 16px;
}

.popup-header {
  margin-bottom: 12px;
}

.popup-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.username {
  font-size: 13px;
  color: #606266;
  flex: 1;
}

.stat-row {
  display: flex;
  justify-content: space-around;
  text-align: center;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 11px;
  color: #909399;
}

.actions {
  display: flex;
  gap: 8px;
}

.actions .el-button {
  flex: 1;
}
</style>
