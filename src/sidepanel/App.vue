<template>
  <div class="sidepanel-container">
    <div class="sidepanel-header">
      <h3>SpiderMemos Tab Sync</h3>
      <el-button type="primary" size="small" @click="openDashboard">
        管理面板
      </el-button>
    </div>
    <div class="sidepanel-body">
      <p class="placeholder-text">侧边栏面板（待实现）</p>
    </div>
  </div>
</template>

<script setup lang="ts">
function openDashboard() {
  chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD' })
}
</script>

<style scoped>
.sidepanel-container {
  padding: 16px;
  height: 100vh;
  box-sizing: border-box;
}

.sidepanel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.sidepanel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.placeholder-text {
  color: #909399;
  font-size: 13px;
}
</style>
