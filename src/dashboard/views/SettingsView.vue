<template>
  <div class="settings-view">
    <!-- 服务端配置 -->
    <el-card shadow="never">
      <template #header>
        <span class="card-title">服务端配置</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <el-form-item label="API 地址">
          <el-input
            v-model="apiBaseUrl"
            placeholder="例如: https://api.example.com"
            clearable
            @blur="saveApiBaseUrl"
          />
          <div class="form-tip">后端服务的 API 基础地址，留空则不与后端同步</div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 同步设置 -->
    <el-card shadow="never">
      <template #header>
        <span class="card-title">同步设置</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <el-form-item label="同步间隔">
          <el-input-number
            v-model="syncInterval"
            :min="1"
            :max="60"
            :step="1"
            @change="saveSyncInterval"
          />
          <span class="input-suffix">分钟</span>
          <div class="form-tip">自动同步标签页数据的时间间隔（1-60 分钟）</div>
        </el-form-item>

        <el-form-item label="同步状态">
          <div class="sync-status-row">
            <el-tag :type="syncTagType" size="small">{{ syncStatusText }}</el-tag>
            <span v-if="lastSyncAt" class="sync-time">上次同步: {{ formatTime(lastSyncAt) }}</span>
            <span v-else class="sync-time">尚未同步</span>
            <el-button size="small" :loading="syncing" @click="handleSyncNow">
              立即同步
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="待同步事件">
          <span>{{ pendingCount }} 条</span>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 设备信息 -->
    <el-card shadow="never">
      <template #header>
        <span class="card-title">当前设备</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <el-form-item label="设备 ID">
          <el-input :model-value="deviceId" readonly>
            <template #append>
              <el-button @click="copyDeviceId">复制</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="设备名称">
          <span>{{ deviceName || '--' }}</span>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据管理 -->
    <el-card shadow="never">
      <template #header>
        <span class="card-title">数据管理</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <el-form-item label="本地标签页">
          <span>{{ tabCount.open }} 个打开，{{ tabCount.closed }} 个已关闭</span>
        </el-form-item>

        <el-form-item label="清除数据">
          <el-button type="danger" @click="handleClearData">
            清除所有本地数据
          </el-button>
          <div class="form-tip">清除本地存储的所有标签页记录、同步状态等（不影响后端数据）</div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 关于 -->
    <el-card shadow="never">
      <template #header>
        <span class="card-title">关于</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <el-form-item label="扩展版本">
          <span>{{ extensionVersion }}</span>
        </el-form-item>
        <el-form-item label="扩展 ID">
          <span class="mono-text">{{ extensionId }}</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '../../shared/composables/useMessage'
import { storage, STORAGE_KEYS } from '../../shared/storage'
import type { StateData } from '../../shared/types'

const apiBaseUrl = ref('')
const syncInterval = ref(5)
const syncStatus = ref('idle')
const lastSyncAt = ref<string | null>(null)
const pendingCount = ref(0)
const syncing = ref(false)
const deviceId = ref('')
const deviceName = ref('')
const tabCount = ref({ open: 0, closed: 0 })

const extensionVersion = chrome.runtime.getManifest().version
const extensionId = chrome.runtime.id

const syncStatusMap: Record<string, string> = {
  idle: '空闲',
  syncing: '同步中',
  error: '异常',
}

const syncStatusText = computed(() => syncStatusMap[syncStatus.value] || '--')

const syncTagType = computed(() => {
  if (syncStatus.value === 'syncing') return 'warning'
  if (syncStatus.value === 'error') return 'danger'
  return 'info'
})

onMounted(async () => {
  // 从 storage 读取设置
  apiBaseUrl.value = await storage.get(STORAGE_KEYS.API_BASE_URL)
  syncInterval.value = await storage.get(STORAGE_KEYS.SYNC_INTERVAL)
  deviceId.value = (await storage.get(STORAGE_KEYS.DEVICE_ID)) || ''
  deviceName.value = (await storage.get(STORAGE_KEYS.DEVICE_NAME)) || ''

  // 从 background 获取运行时状态
  const res = await sendMessage<StateData>({ action: 'GET_STATE' })
  if (res.success && res.data) {
    syncStatus.value = res.data.syncStatus ?? 'idle'
    lastSyncAt.value = res.data.lastSyncAt ?? null
    pendingCount.value = res.data.pendingCount ?? 0
    tabCount.value = res.data.tabCount ?? { open: 0, closed: 0 }
  }
})

async function saveApiBaseUrl() {
  await storage.set(STORAGE_KEYS.API_BASE_URL, apiBaseUrl.value.trim())
  ElMessage.success('API 地址已保存')
}

async function saveSyncInterval() {
  await storage.set(STORAGE_KEYS.SYNC_INTERVAL, syncInterval.value)
  ElMessage.success('同步间隔已保存')
}

async function handleSyncNow() {
  syncing.value = true
  await sendMessage({ action: 'SYNC_NOW' })
  // 重新加载状态
  const res = await sendMessage<StateData>({ action: 'GET_STATE' })
  if (res.success && res.data) {
    syncStatus.value = res.data.syncStatus ?? 'idle'
    lastSyncAt.value = res.data.lastSyncAt ?? null
    pendingCount.value = res.data.pendingCount ?? 0
  }
  syncing.value = false
  ElMessage.success('同步完成')
}

function copyDeviceId() {
  navigator.clipboard.writeText(deviceId.value).then(() => {
    ElMessage.success('已复制到剪贴板')
  })
}

async function handleClearData() {
  try {
    await ElMessageBox.confirm(
      '确定要清除所有本地数据吗？此操作不可恢复。后端数据不受影响。',
      '清除数据',
      { type: 'warning' },
    )
  } catch {
    return // 用户取消
  }

  await storage.clear()
  ElMessage.success('本地数据已清除，请刷新页面')
}

/** 格式化时间 */
function formatTime(iso: string): string {
  if (!iso) return '--'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<style scoped>
.settings-view {
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

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.5;
}

.input-suffix {
  margin-left: 8px;
  font-size: 13px;
  color: #606266;
}

.sync-status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sync-time {
  font-size: 12px;
  color: #909399;
}

.mono-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #606266;
}
</style>
