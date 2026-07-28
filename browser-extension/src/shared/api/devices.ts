import { apiClient } from './client'
import type { Device } from '../types'

/** 注册设备 */
export function registerDevice(payload: { deviceId: string; name: string; browser: string; os: string }) {
  return apiClient.post<{ device: Device }>('/v1/tab-sync/devices/register', payload)
}

/** 获取已注册设备列表 */
export function getDevices() {
  return apiClient.get<{ devices: Device[] }>('/v1/tab-sync/devices')
}

/** 注销设备 - 登出时通知后端移除设备 */
export function deregisterDevice(deviceId: string) {
  return apiClient.delete<{ ok: true }>(`/v1/tab-sync/devices/${encodeURIComponent(deviceId)}`)
}
