<template>
  <div class="popup-container">
    <div class="popup-header">
      <h3>SpiderMemos Tab Sync</h3>
    </div>
    <div class="popup-body">
      <p class="status-text">扩展已加载</p>
      <el-button type="primary" size="small" @click="openSidePanel">
        打开侧边栏
      </el-button>
      <el-button type="primary" size="small" @click="openDashboard">
        打开管理面板
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
function openDashboard() {
  chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD' })
}

function openSidePanel() {
  chrome.sidePanel.open({ windowId: undefined as unknown as number }).then(() => {
    window.close()
  }).catch(() => {
    // 如果 sidePanel.open 不可用，则获取当前窗口 ID 后打开
    chrome.windows.getCurrent((win) => {
      if (win.id != null) {
        chrome.sidePanel.open({ windowId: win.id })
      }
    })
  })
}
</script>

<style scoped>
.popup-container {
  width: 300px;
  padding: 16px;
}

.popup-header h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #303133;
}

.popup-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-text {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #909399;
}
</style>
