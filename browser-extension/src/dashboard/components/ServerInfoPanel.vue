<template>
  <el-form label-width="120px" label-position="left">
    <el-form-item label="API 地址">
      <span class="mono-text">{{ apiBaseUrl || '--' }}</span>
    </el-form-item>
    <el-form-item label="服务器版本">
      <span>{{ versionInfo?.serverVersion ?? '--' }}</span>
    </el-form-item>
    <el-form-item label="兼容版本范围">
      <span>{{ versionInfo?.minExtVersion ?? '--' }} ~ {{ versionInfo?.maxExtVersion ?? '--' }}</span>
      <div class="form-tip" style="width: 100%">当前服务器支持的扩展版本区间，扩展版本落在此范围内才可用</div>
    </el-form-item>
    <el-form-item label="版本兼容性">
      <template v-if="versionInfo">
        <el-tag v-if="versionInfo.compatible" type="success">兼容</el-tag>
        <el-tag v-else type="danger">不兼容</el-tag>
        <span class="form-tip" style="margin-left: 8px">当前扩展版本 {{ extensionVersion }}</span>
        <span v-if="!versionInfo.compatible && versionInfo.reason" class="form-tip" style="margin-left: 8px">
          {{ versionInfo.reason }}
        </span>
      </template>
      <span v-else>--</span>
    </el-form-item>
    <el-divider />
    <el-form-item label="连接时延">
      <span>{{ versionInfo?.latencyMs != null ? `${versionInfo.latencyMs} ms` : '--' }}</span>
    </el-form-item>
    <el-form-item label="时间差">
      <span>{{ formatClockDiff(versionInfo?.clockDiffMs) }}</span>
      <div class="form-tip" style="width: 100%">服务端时间减去本地时间，正值表示服务端时间快于本地</div>
    </el-form-item>
    <el-form-item label="检测时间">
      <span>{{ formatCheckedAt(versionInfo?.checkedAt) }}</span>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import type { ServerCheckInfo } from '@/shared/types'

defineProps<{
  apiBaseUrl: string
  versionInfo: ServerCheckInfo | null
  extensionVersion: string
}>()

// 时间差展示：正负号 + 带单位的绝对值，避免出现 "0 ms" 这类难读写法
function formatClockDiff(ms?: number): string {
  if (ms == null) return '--'
  if (ms === 0) return '0'
  const abs = Math.abs(ms)
  const value = abs < 1000
    ? `${abs} 毫秒`
    : abs < 60000
      ? `${(abs / 1000).toFixed(1)} 秒`
      : `${(abs / 60000).toFixed(1)} 分钟`
  return `${ms > 0 ? '+' : '-'}${value}`
}

// 检测时间按本地时区展示，精确到秒
function formatCheckedAt(ts?: number): string {
  if (ts == null) return '--'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<style scoped>
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
