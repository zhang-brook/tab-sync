<template>
  <div class="popup-container">
    <div class="popup-header">
      <h3>SpiderMemos Tab Sync</h3>
    </div>

    <!-- 加载中：避免闪现登录页 -->
    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>

    <!-- 未登录：显示登录面板 -->
    <LoginPanel v-else-if="!authenticated" @login-success="loadState" />

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

      <!-- 标签页统计 -->
      <div class="stat-row">
        <div class="stat-item">
          <span class="stat-value">{{ tabCount.open }}</span>
          <span class="stat-label">打开</span>
        </div>
      </div>

      <el-divider style="margin: 8px 0" />

      <!-- 快捷操作 -->
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
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import LoginPanel from './components/LoginPanel.vue'
import { sendMessage } from '../shared/composables/useMessage'
import type { StateData } from '../shared/types'

const loading = ref(true)
const authenticated = ref(false)
const userName = ref('')
const tabCount = ref({ open: 0, closed: 0 })

onMounted(() => {
  loadState()
})

async function loadState() {
  try {
    const res = await sendMessage<StateData>({ action: 'GET_STATE' })
    if (res.success && res.data) {
      authenticated.value = res.data.auth?.authenticated ?? false
      userName.value = res.data.auth?.user?.username || ''
      tabCount.value = res.data.tabCount ?? { open: 0, closed: 0 }
    }
  } finally {
    loading.value = false
  }
}

async function handleLogout() {
  await sendMessage({ action: 'LOGOUT' })
  authenticated.value = false
  userName.value = ''
  ElMessage.success('已退出登录')
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

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60px;
  font-size: 24px;
  color: #409eff;
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

.sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sync-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-time {
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
