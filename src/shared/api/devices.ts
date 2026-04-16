import { apiClient } from './client'
import type { Device } from '../types'

/** 注册设备 */
export function registerDevice(payload: { deviceId: string; name: string; browser: string; os: string }) {
  return apiClient.post<{ device: Device }>('/api/v1/devices/register', payload)
}

/** 获取已注册设备列表 */
export function getDevices() {
  return apiClient.get<{ devices: Device[] }>('/api/v1/devices')
}

/** 更新设备信息 */
export function updateDevice(deviceId: string, payload: { name?: string }) {
  return apiClient.patch<{ device: Device }>(`/api/v1/devices/${encodeURIComponent(deviceId)}`, payload)
}

/** 设备心跳 - 告知后端设备在线 */
export function deviceHeartbeat(deviceId: string) {
  return apiClient.post<{ ok: true }>(`/api/v1/devices/${encodeURIComponent(deviceId)}/heartbeat`)
}
