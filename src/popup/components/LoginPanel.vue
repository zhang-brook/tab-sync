<template>
  <div class="login-panel">
    <!-- Tab 切换：Token / 账号密码 -->
    <el-tabs v-model="loginMode" class="login-tabs">
      <el-tab-pane label="账号密码" name="credentials">
        <el-form @submit.prevent="handleCredentialsLogin">
          <el-form-item>
            <el-input
              v-model="username"
              placeholder="用户名"
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="password"
              placeholder="密码"
              type="password"
              show-password
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="loading"
              style="width: 100%"
              @click="handleCredentialsLogin"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="Token 登录" name="token">
        <el-form @submit.prevent="handleTokenLogin">
          <el-form-item>
            <el-input
              v-model="tokenInput"
              placeholder="粘贴 Token"
              type="password"
              show-password
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="loading"
              style="width: 100%"
              @click="handleTokenLogin"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <!-- 后端地址配置 -->
    <div class="server-config">
      <el-input
        v-model="serverUrl"
        placeholder="后端地址，如 https://api.example.com"
        size="small"
        @change="handleServerUrlChange"
      >
        <template #prepend>服务器</template>
      </el-input>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sendMessage } from '../../shared/composables/useMessage'
import { storage, STORAGE_KEYS } from '../../shared/storage'
import type { LoginData } from '../../shared/types'

const emit = defineEmits<{
  (e: 'login-success'): void
}>()

const loginMode = ref<'credentials' | 'token'>('credentials')
const tokenInput = ref('')
const username = ref(process.env.NODE_ENV === 'production' ? '' : 'admin')
const password = ref(process.env.NODE_ENV === 'production' ? '' : 'password')
const serverUrl = ref('')
const loading = ref(false)
const errorMsg = ref('')

const defaultServerUrl = process.env.NODE_ENV === 'production'
  ? 'https://api.spidermemos.com'
  : 'http://localhost:9998'

onMounted(async () => {
  const storedUrl = await storage.get(STORAGE_KEYS.API_BASE_URL)
  serverUrl.value = storedUrl || defaultServerUrl
})

async function handleServerUrlChange() {
  // 去除末尾斜杠
  const url = serverUrl.value.replace(/\/+$/, '')
  serverUrl.value = url
  await storage.set(STORAGE_KEYS.API_BASE_URL, url)
}

async function handleTokenLogin() {
  if (!tokenInput.value.trim()) {
    errorMsg.value = '请输入 Token'
    return
  }
  await ensureServerUrl()
  if (errorMsg.value) return

  loading.value = true
  errorMsg.value = ''

  const res = await sendMessage<LoginData>({
    action: 'LOGIN_WITH_TOKEN',
    payload: { token: tokenInput.value.trim() },
  })

  loading.value = false

  if (res.success) {
    emit('login-success')
  } else {
    errorMsg.value = res.error || '登录失败'
  }
}

async function handleCredentialsLogin() {
  if (!username.value.trim() || !password.value.trim()) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  await ensureServerUrl()
  if (errorMsg.value) return

  loading.value = true
  errorMsg.value = ''

  const res = await sendMessage<LoginData>({
    action: 'LOGIN_WITH_CREDENTIALS',
    payload: { username: username.value.trim(), password: password.value },
  })

  loading.value = false

  if (res.success) {
    emit('login-success')
  } else {
    errorMsg.value = res.error || '登录失败'
  }
}

async function ensureServerUrl() {
  if (!serverUrl.value.trim()) {
    errorMsg.value = '请先配置后端地址'
    return
  }
  await handleServerUrlChange()
}
</script>

<style scoped>
.login-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.login-tabs {
  margin-bottom: 0;
}

.login-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.server-config {
  margin-top: 4px;
}

.error-msg {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #f56c6c;
}
</style>
