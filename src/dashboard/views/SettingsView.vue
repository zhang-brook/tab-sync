<template>
  <div class="settings-view">
    <!-- 认证状态 -->
    <el-card shadow="never">
      <template #header>
        <span class="card-title">认证管理</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <!-- 连接模式 -->
        <el-form-item label="连接模式">
          <el-radio-group v-model="connectionMode" @change="handleModeChange">
            <el-radio value="lightweight">轻量后端 (tab-sync-server)</el-radio>
            <el-radio value="zhige">织个网 (预留)</el-radio>
          </el-radio-group>
          <div class="form-tip">
            {{ connectionMode === 'lightweight'
              ? '连接自建轻量后端，手动输入 API Token 认证'
              : '连接织个网云端服务（暂未开放）' }}
          </div>
        </el-form-item>

        <!-- API 地址（仅轻量后端模式） -->
        <el-form-item v-if="connectionMode === 'lightweight'" label="API 地址">
          <el-input v-model="apiBaseUrl" placeholder="例如: http://localhost:8080" clearable @blur="saveApiBaseUrl" />
          <div class="form-tip">
            轻量后端的 API 地址，通常为 http://localhost:8080
            <el-button v-if="connectionMode === 'lightweight' && apiBaseUrl" size="small" @click="checkVersion" :loading="versionChecking" style="margin-left: 8px">
              检测版本
            </el-button>
          </div>
        </el-form-item>

        <!-- Token 管理 -->
        <el-form-item label="API Token">
          <el-input
            v-model="tokenInput"
            placeholder="粘贴从管理后台获取的 API Token"
            type="password"
            show-password
            clearable
          >
            <template #append>
              <el-button @click="handleSetToken" :loading="tokenChecking">
                {{ authStatus === 'authenticated' ? '更换' : '设置' }}
              </el-button>
            </template>
          </el-input>
          <div class="form-tip">
            Token 在轻量后端管理后台生成（首次运行后访问 /setup 初始化）
          </div>
        </el-form-item>

        <!-- 认证状态 -->
        <el-form-item label="连接状态">
          <el-tag v-if="authStatus === 'authenticated'" type="success">已认证</el-tag>
          <el-tag v-else-if="authStatus === 'checking'" type="warning">验证中...</el-tag>
          <el-tag v-else type="info">未认证</el-tag>
          <el-button v-if="authStatus === 'authenticated'" size="small" type="danger" @click="handleLogout" style="margin-left: 8px">
            注销
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 版本协商 -->
    <el-card v-if="versionInfo" shadow="never">
      <template #header>
        <span class="card-title">服务端信息</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <el-form-item label="服务器版本">
          <span>{{ versionInfo.serverVersion ?? '--' }}</span>
        </el-form-item>
        <el-form-item label="兼容版本范围">
          <span>{{ versionInfo.minExtVersion ?? '--' }} ~ {{ versionInfo.maxExtVersion ?? '--' }}</span>
        </el-form-item>
        <el-form-item label="版本兼容性">
          <el-tag v-if="versionInfo.compatible" type="success">兼容</el-tag>
          <el-tag v-else type="danger">不兼容</el-tag>
          <span v-if="!versionInfo.compatible && versionInfo.reason" class="form-tip" style="margin-left: 8px">
            {{ versionInfo.reason }}
          </span>
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
          <span>{{ tabCount.open }} 个打开，其中 {{ tabCount.frozen }} 个已冻结</span>
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '../../shared/composables/useMessage'
import { storage, STORAGE_KEYS } from '../../shared/storage'
import type { StateData } from '../../shared/types'

const apiBaseUrl = ref('')
const deviceId = ref('')
const deviceName = ref('')
const tabCount = ref({ open: 0, frozen: 0 })
const tokenInput = ref('')
const tokenChecking = ref(false)
const versionChecking = ref(false)

const extensionVersion = chrome.runtime.getManifest().version
const extensionId = chrome.runtime.id

const connectionMode = ref<'lightweight' | 'zhige'>('lightweight')
const authStatus = ref<'unknown' | 'authenticated' | 'checking'>('unknown')
const versionInfo = ref<{
  compatible?: boolean
  serverVersion?: string
  minExtVersion?: string
  maxExtVersion?: string
  reason?: string
} | null>(null)

onMounted(async () => {
  // 从 storage 读取设置
  apiBaseUrl.value = await storage.get(STORAGE_KEYS.API_BASE_URL)
  deviceId.value = (await storage.get(STORAGE_KEYS.DEVICE_ID)) || ''
  deviceName.value = (await storage.get(STORAGE_KEYS.DEVICE_NAME)) || ''

  const mode = await storage.get(STORAGE_KEYS.CONNECTION_MODE)
  connectionMode.value = (mode as 'lightweight' | 'zhige') || 'lightweight'

  // 检查当前认证状态
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  authStatus.value = token ? 'authenticated' : 'unknown'

  // 从 background 获取运行时状态
  const res = await sendMessage<StateData>({ action: 'GET_STATE' })
  if (res.success && res.data) {
    tabCount.value = res.data.tabCount ?? { open: 0, frozen: 0 }
  }
})

async function handleModeChange() {
  await sendMessage({
    action: 'SET_CONNECTION_MODE',
    payload: {
      mode: connectionMode.value,
      apiBaseUrl: connectionMode.value === 'lightweight' ? apiBaseUrl.value : undefined,
    },
  })
  ElMessage.success(`连接模式已切换为: ${connectionMode.value === 'lightweight' ? '轻量后端' : '织个网'}`)
}

function saveApiBaseUrl() {
  storage.set(STORAGE_KEYS.API_BASE_URL, apiBaseUrl.value.trim())
  // 同时更新连接模式中的地址
  if (connectionMode.value === 'lightweight') {
    sendMessage({
      action: 'SET_CONNECTION_MODE',
      payload: { mode: 'lightweight', apiBaseUrl: apiBaseUrl.value.trim() },
    }).catch(() => {})
  }
}

async function handleSetToken() {
  if (!tokenInput.value.trim()) {
    ElMessage.warning('请输入 Token')
    return
  }

  tokenChecking.value = true
  authStatus.value = 'checking'

  const res = await sendMessage({
    action: 'LOGIN_WITH_TOKEN',
    payload: { token: tokenInput.value.trim() },
  })

  tokenChecking.value = false

  if (res.success) {
    authStatus.value = 'authenticated'
    ElMessage.success('Token 验证成功')
    tokenInput.value = ''
  } else {
    authStatus.value = 'unknown'
    ElMessage.error(res.error || 'Token 验证失败')
  }
}

async function handleLogout() {
  await sendMessage({ action: 'LOGOUT' })
  authStatus.value = 'unknown'
  ElMessage.success('已注销')
}

async function checkVersion() {
  versionChecking.value = true
  const res = await sendMessage<{
    compatible: boolean
    serverVersion: string
    minExtVersion: string
    maxExtVersion: string
    reason?: string
  }>({ action: 'CHECK_VERSION' })

  versionChecking.value = false

  if (res.success && res.data) {
    versionInfo.value = res.data
    if (res.data.compatible) {
      ElMessage.success(`服务器版本 ${res.data.serverVersion}，版本兼容`)
    } else {
      ElMessage.warning(res.data.reason || '版本不兼容')
    }
  } else {
    ElMessage.error(res.error || '版本检测失败')
  }
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

.mono-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #606266;
}
</style>
