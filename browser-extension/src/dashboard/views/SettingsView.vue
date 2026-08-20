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

    <!-- 快捷键 -->
    <el-card shadow="never">
      <template #header>
        <span class="card-title">快捷键</span>
      </template>

      <el-form label-width="120px" label-position="left">
        <!-- 按键从 chrome.commands.getAll() 动态读取，反映用户手动绑定后的最新按键 -->
        <el-form-item v-for="sc in shortcuts" :key="sc.id" :label="sc.label" label-width="170px">
          <div class="shortcut-row">
            <span class="shortcut-key">
              <template v-if="sc.shortcut">{{ sc.shortcut }}</template>
              <template v-else>未设置按键</template>

              <span v-if="sc.modified" class="shortcut-text shortcut-modified">(已修改)</span>
              <span v-else class="shortcut-text shortcut-default">(默认)</span>

              <el-button link type="primary" size="small" @click="openShortcutsPage" style="margin-left: 5px">
                {{ sc.shortcut ? '前往修改' : '前往设置' }}
              </el-button>
            </span>
            <div class="form-tip">
              {{ sc.description }}<template v-if="sc.modified">（默认：{{ sc.default }}）</template>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="启用快捷键">
          <el-switch v-model="shortcutEnabled" @change="saveShortcutEnabled" />
          <div class="form-tip">关闭后「加入并关闭」快捷键将不再触发收藏</div>
        </el-form-item>
        <el-form-item label="默认工作组">
          <div class="ws-picker-row">
            <span class="ws-current">{{ defaultWorkspaceName }}</span>
            <el-button size="small" @click="defaultPickerVisible = true">修改</el-button>
          </div>
          <div class="form-tip">「加入并关闭」快捷键与右键菜单「保存到 默认分组」将标签页收藏到该工作组</div>
        </el-form-item>
        <el-form-item>
          <el-button size="small" @click="openShortcutsPage">打开 Chrome 快捷键设置页</el-button>
          <div class="form-tip">未显示按键的功能需在 Chrome 快捷键设置页手动绑定</div>
          <div class="form-tip" v-if="true/* Chrome 浏览器 */">
            Chrome 修改快捷键后，需重新加载扩展后生效
          </div>
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

    <!-- 选择默认工作组 -->
    <WorkspacePickerDialog
      v-model="defaultPickerVisible"
      title="选择默认工作组"
      @select="onSelectDefault"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sendMessage } from '@/shared/composables/useMessage'
import { storage, STORAGE_KEYS } from '@/shared/storage'
import { openTabAfterActive } from '@/shared/utils/tab-utils'
import type { StateData, WorkspacesData, Workspace } from '@/shared/types'
import WorkspacePickerDialog from '@/shared/components/WorkspacePickerDialog.vue'
import type { WorkspaceTreeNode as WsNode } from '@/shared/utils/workspace-tree'

const apiBaseUrl = ref('')
const deviceId = ref('')
const deviceName = ref('')
const tabCount = ref({ open: 0, frozen: 0 })
const tokenInput = ref('')
const tokenChecking = ref(false)
const versionChecking = ref(false)

// 快捷键「加入并关闭」默认工作组
const defaultWorkspaceId = ref('')
const workspaceOptions = ref<Workspace[]>([])
// 「未分组」系统工作组的固定标识（见 background/index.ts UNGROUPED_WORKSPACE_ID）
const UNGROUPED_WORKSPACE_ID = 'ungrouped'

// 是否启用「加入并关闭」快捷键
const shortcutEnabled = ref(true)

// 快捷键命令元信息：展示顺序与 manifest.config.ts 的 commands 保持一致；default 为其 suggested_key（无默认值的命令为空）
const SHORTCUT_ORDER = ['save-and-close', 'save-ungrouped', 'save-pick', 'open-sidepanel', 'open-settings']
const SHORTCUT_META: Record<string, { label: string; description: string; default: string }> = {
  'save-and-close': { label: '加入默认工作组并关闭', description: '将当前标签页加入默认工作组并关闭', default: 'Shift+Alt+S' },
  'save-ungrouped': { label: '保存到 [未分组]', description: '将当前标签页保存到 [未分组] 并关闭', default: 'Alt+Shift+U' },
  'save-pick': { label: '保存到选定分组', description: '选择分组后将当前标签页保存并关闭', default: 'Alt+Shift+G' },
  'open-sidepanel': { label: '打开侧栏', description: '打开 Tab Sync 侧边栏', default: '' },
  'open-settings': { label: '打开设置页', description: '打开 Tab Sync 设置页面', default: '' },
}

const shortcuts = ref<{ id: string; label: string; description: string; shortcut: string; default: string; modified: boolean }[]>([])

// Chrome 会按修饰键字母顺序规范化按键（如 Shift+Alt+S → Alt+Shift+S），比较前先统一排序避免误判
function normalizeShortcut(key: string): string {
  const parts = key.split('+')
  const mods = parts.slice(0, -1).sort((a, b) => ['Ctrl', 'Alt', 'Shift'].indexOf(a) - ['Ctrl', 'Alt', 'Shift'].indexOf(b))
  return [...mods, parts[parts.length - 1]].join('+')
}

async function loadShortcuts() {
  const commands = await chrome.commands.getAll()
  const byName = new Map(commands.map((c) => [c.name, c.shortcut ?? '']))
  shortcuts.value = SHORTCUT_ORDER.map((name) => {
    const meta = SHORTCUT_META[name]
    const shortcut = byName.get(name) ?? ''
    return {
      id: name,
      ...meta,
      shortcut,
      // 已绑定且与默认键不同视为用户修改过
      modified: !!shortcut && !!meta.default && normalizeShortcut(shortcut) !== normalizeShortcut(meta.default),
    }
  })
}

function openShortcutsPage() {
  // chrome://extensions/shortcuts 无法在扩展页内直接跳转，通过新标签页打开
  void openTabAfterActive('chrome://extensions/shortcuts')
}

// 默认收藏工作组（通过公共分组选择器选择，支持树状展示与禁用）
const defaultPickerVisible = ref(false)
const defaultWorkspaceName = computed(() => {
  // 初始/未设置时默认「未分组」；用户自定义组按 ID 查名称，查不到（后端未连接）时回退展示「未分组」
  const id = defaultWorkspaceId.value || UNGROUPED_WORKSPACE_ID
  if (id === UNGROUPED_WORKSPACE_ID) return '未分组'
  return workspaceOptions.value.find((w) => w.id === id)?.name ?? '未分组'
})
function onSelectDefault(node: WsNode) {
  defaultWorkspaceId.value = node.id
  saveDefaultWorkspace()
  defaultPickerVisible.value = false
}

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

  // 默认收藏工作组：空值（历史数据）回退到初始默认「未分组」
  defaultWorkspaceId.value = (await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)) || UNGROUPED_WORKSPACE_ID
  await loadWorkspaces()
  shortcutEnabled.value = await storage.get(STORAGE_KEYS.SHORTCUT_ENABLED)
  await loadShortcuts()
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

async function loadWorkspaces() {
  // includeSystem: 默认工作组可能是「未分组」系统工作组，需包含以便展示名称
  const res = await sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES', payload: { includeSystem: true } })
  if (res.success && res.data) {
    workspaceOptions.value = res.data.workspaces
  }
}

function saveDefaultWorkspace() {
  storage.set(STORAGE_KEYS.DEFAULT_WORKSPACE_ID, defaultWorkspaceId.value || '')
}

function saveShortcutEnabled() {
  storage.set(STORAGE_KEYS.SHORTCUT_ENABLED, shortcutEnabled.value)
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

/* 快捷键按键：第一行黑字展示按键，描述放第二行小字 */
.shortcut-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shortcut-key {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.shortcut-text {
  font-size: 12px;
  font-weight: 400;
  margin-left: 4px;
}

/* 已修改标记：与第二行默认提示同为小字，用警示色突出状态 */
.shortcut-modified {
  color: #e6a23c;
}

.shortcut-default {
  color: #909399;
}

.ws-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-current {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.mono-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #606266;
}
</style>
