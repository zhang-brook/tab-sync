<template>
  <div class="devices-view">
    <div class="toolbar">
      <el-alert
        type="info"
        :closable="false"
        show-icon
      >
        设备列表将在后端服务连接后自动同步。当前仅显示本机设备信息。
      </el-alert>
    </div>

    <!-- 当前设备卡片 -->
    <el-card shadow="never" class="device-card device-card--current">
      <div class="device-header">
        <el-icon :size="32" class="device-icon"><Monitor /></el-icon>
        <div class="device-info">
          <div class="device-name">
            {{ currentDevice.name || '未命名设备' }}
            <el-tag type="success" size="small" class="device-tag">当前设备</el-tag>
          </div>
          <div class="device-meta">
            <span>{{ currentDevice.browser }}</span>
            <el-divider direction="vertical" />
            <span>{{ currentDevice.os }}</span>
          </div>
        </div>
      </div>

      <el-divider style="margin: 12px 0" />

      <el-descriptions :column="2" size="small" border>
        <el-descriptions-item label="设备 ID">
          <span class="mono-text">{{ currentDevice.id || '--' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="最后活跃">
          {{ formatTime(currentDevice.lastSeen) }}
        </el-descriptions-item>
        <el-descriptions-item label="打开标签页">
          {{ tabCount.open }} 个
        </el-descriptions-item>
        <el-descriptions-item label="已关闭标签页">
          {{ tabCount.closed }} 个
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 远端设备列表（后端连接后可用） -->
    <el-card v-if="remoteDevices.length > 0" shadow="never">
      <template #header>
        <span class="card-title">其他设备</span>
      </template>

      <div
        v-for="device in remoteDevices"
        :key="device.id"
        class="device-card device-card--remote"
      >
        <div class="device-header">
          <el-icon :size="24" class="device-icon"><Monitor /></el-icon>
          <div class="device-info">
            <div class="device-name">{{ device.name }}</div>
            <div class="device-meta">
              <span>{{ device.browser }}</span>
              <el-divider direction="vertical" />
              <span>{{ device.os }}</span>
              <el-divider direction="vertical" />
              <span>最后活跃: {{ formatTime(device.lastSeen) }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-empty
      v-else
      description="暂无其他设备，使用同一账号在其他电脑登录后将自动出现"
      :image-size="120"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Monitor } from '@element-plus/icons-vue'
import { sendMessage } from '../../shared/composables/useMessage'
import type { Device, DevicesData, StateData } from '../../shared/types'

const allDevices = ref<Device[]>([])
const tabCount = ref({ open: 0, closed: 0 })
const loading = ref(true)

/** 当前设备（列表中第一个） */
const currentDevice = computed(() => allDevices.value[0] ?? {
  id: '', name: '', browser: '', os: '', lastSeen: '',
})

/** 远端设备（列表中第一个以外的） */
const remoteDevices = computed(() => allDevices.value.slice(1))

onMounted(async () => {
  // 通过 GET_DEVICES 消息从 background 获取设备列表
  const devRes = await sendMessage<DevicesData>({ action: 'GET_DEVICES' })
  if (devRes.success && devRes.data) {
    allDevices.value = devRes.data.devices
  }

  // 获取标签页统计
  const stateRes = await sendMessage<StateData>({ action: 'GET_STATE' })
  if (stateRes.success && stateRes.data) {
    tabCount.value = stateRes.data.tabCount ?? { open: 0, closed: 0 }
  }

  loading.value = false
})

/** 格式化时间 */
function formatTime(iso: string): string {
  if (!iso) return '--'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.devices-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}

.card-title {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.device-card--current {
  border-left: 3px solid #67c23a;
}

.device-card--remote {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.device-card--remote:last-child {
  border-bottom: none;
}

.device-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.device-icon {
  color: #909399;
  flex-shrink: 0;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}

.device-tag {
  flex-shrink: 0;
}

.device-meta {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.mono-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #606266;
}
</style>
