<template>
  <div class="login-panel">
    <!-- Token 登录 -->
    <el-form @submit.prevent="handleTokenLogin">
      <el-form-item>
        <el-input
          v-model="tokenInput"
          placeholder="粘贴 API Token"
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

    <!-- 后端地址配置 -->
    <div class="server-config">
      <el-input
        v-model="serverUrl"
        placeholder="后端地址，如 http://localhost:8080"
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
import { sendMessage } from '../composables/useMessage'
import { storage, STORAGE_KEYS } from '../storage'

const emit = defineEmits<{
  (e: 'login-success'): void
}>()

const tokenInput = ref('')
const serverUrl = ref('')
const loading = ref(false)
const errorMsg = ref('')

const defaultServerUrl = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:8080'

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

  const res = await sendMessage({
    action: 'LOGIN_WITH_TOKEN',
    payload: { token: tokenInput.value.trim() },
  })

  loading.value = false

  if (res.success) {
    emit('login-success')
  } else {
    errorMsg.value = res.error || 'Token 验证失败'
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

.server-config {
  margin-top: 4px;
}

.error-msg {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #f56c6c;
}
</style>
