<template>
  <div class="dashboard-view">
    <div class="dashboard-header-bar">
      <div>
        <h2 class="dashboard-title">概览</h2>
        <span class="dashboard-subtitle">同步服务运行状态与数据汇总</span>
      </div>
      <div class="dashboard-actions">
        <el-tag v-if="stats" size="small" :type="stats.authenticated ? 'success' : 'info'" effect="plain">
          {{ stats.authenticated ? '已连接同步服务' : '仅本地数据' }}
        </el-tag>
        <el-button :icon="Refresh" size="small" :loading="loading" @click="loadStats">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="stats && !stats.authenticated"
      type="info"
      :closable="false"
      show-icon
      title="尚未连接同步服务"
      description="当前数据仅来自本机浏览器，配置并登录同步服务后可查看跨设备汇总。"
      style="margin-bottom: 16px;"
    />

    <el-skeleton :rows="4" animated v-if="loading" />

    <template v-else>
      <el-row :gutter="16" class="stat-grid">
        <el-col :xs="24" :sm="12" :md="8" v-for="card in cards" :key="card.key">
          <el-card shadow="hover" class="stat-card" @click="goTo(card.to)">
            <div class="stat-card-body">
              <div class="stat-icon" :style="{ background: card.color }">
                <el-icon :size="22"><component :is="card.icon" /></el-icon>
              </div>
              <div class="stat-content">
                <div class="stat-value">{{ card.value }}</div>
                <div class="stat-label">{{ card.label }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="section-card" v-if="(stats?.openTabs ?? 0) + (stats?.frozenTabs ?? 0) > 0">
        <template #header>
          <span class="section-title">本地标签页构成</span>
        </template>
        <el-row :gutter="24">
          <el-col :span="8">
            <el-statistic title="打开中（总数）" :value="stats?.openTabs ?? 0" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="已冻结" :value="stats?.frozenTabs ?? 0" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="冻结占比" :value="frozenPercent" suffix="%" />
          </el-col>
        </el-row>
        <el-progress
          :percentage="frozenPercent"
          :stroke-width="10"
          color="#67c23a"
          :show-text="false"
          style="margin-top: 18px;"
        />
      </el-card>
    </template>

    <div class="dashboard-footer" v-if="updatedAt">
      最后更新：{{ updatedAt }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Monitor,
  FolderOpened,
  PriceTag,
  Document,
  Lock,
  Files,
  Refresh,
} from '@element-plus/icons-vue'
import { sendMessage } from '../../shared/composables/useMessage'
import type { StateData, DevicesData, WorkspacesData, TagsData } from '../../shared/types'

interface DashboardStats {
  devices: number
  workspaces: number
  tags: number
  openTabs: number
  frozenTabs: number
  workspaceTabs: number
  authenticated: boolean
}

const router = useRouter()

const loading = ref(true)
const stats = ref<DashboardStats | null>(null)
const updatedAt = ref('')

const cards = computed(() => [
  { key: 'devices', label: '设备数', value: stats.value?.devices ?? 0, icon: Monitor, color: '#e6f4ff', to: '/devices' },
  { key: 'workspaces', label: '工作组数', value: stats.value?.workspaces ?? 0, icon: FolderOpened, color: '#f6ffed', to: '/workspaces' },
  { key: 'tags', label: '标签数', value: stats.value?.tags ?? 0, icon: PriceTag, color: '#fff7e6', to: '/tags' },
  { key: 'openTabs', label: '本地打开标签', value: stats.value?.openTabs ?? 0, icon: Document, color: '#f9f0ff', to: '/tabs' },
  { key: 'frozenTabs', label: '已冻结标签', value: stats.value?.frozenTabs ?? 0, icon: Lock, color: '#fff1f0', to: '/tabs' },
  { key: 'workspaceTabs', label: '工作组内标签', value: stats.value?.workspaceTabs ?? 0, icon: Files, color: '#e6fffb', to: '/workspaces' },
])

const frozenPercent = computed(() => {
  const open = stats.value?.openTabs ?? 0
  return open > 0 ? Math.round(((stats.value?.frozenTabs ?? 0) / open) * 100) : 0
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadStats() {
  loading.value = true
  const [stateRes, devicesRes, workspacesRes, tagsRes] = await Promise.all([
    sendMessage<StateData>({ action: 'GET_STATE' }),
    sendMessage<DevicesData>({ action: 'GET_DEVICES' }),
    sendMessage<WorkspacesData>({ action: 'GET_WORKSPACES' }),
    sendMessage<TagsData>({ action: 'GET_TAGS' }),
  ])

  const devices = devicesRes.success ? devicesRes.data?.devices ?? [] : []
  const workspaces = workspacesRes.success ? workspacesRes.data?.workspaces ?? [] : []
  const tags = tagsRes.success ? tagsRes.data?.tags ?? [] : []
  const tabCount = stateRes.success ? stateRes.data?.tabCount ?? { open: 0, frozen: 0 } : { open: 0, frozen: 0 }
  const authenticated = stateRes.success ? stateRes.data?.auth?.authenticated ?? false : false

  stats.value = {
    devices: devices.length,
    workspaces: workspaces.length,
    tags: tags.length,
    openTabs: tabCount.open,
    frozenTabs: tabCount.frozen,
    workspaceTabs: workspaces.reduce((sum, w) => sum + (w.tabs?.length ?? 0), 0),
    authenticated,
  }
  updatedAt.value = formatTime(new Date().toISOString())
  loading.value = false
}

function goTo(path: string) {
  router.push(path)
}

onMounted(loadStats)
</script>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 960px;
}

.dashboard-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dashboard-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.dashboard-subtitle {
  font-size: 13px;
  color: #909399;
  margin-left: 10px;
}

.dashboard-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-grid {
  margin-bottom: 4px;
}

.stat-card {
  cursor: pointer;
  transition: transform 0.15s ease;
  margin-bottom: 16px;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-card-body {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #303133;
  flex-shrink: 0;
}

.stat-content {
  min-width: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  color: #303133;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 2px;
}

.section-card {
  border-radius: 8px;
}

.section-title {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.dashboard-footer {
  font-size: 12px;
  color: #c0c4cc;
  text-align: right;
}
</style>
