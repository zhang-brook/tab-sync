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

/** 更新设备信息 */
export function updateDevice(deviceId: string, payload: { name?: string }) {
  return apiClient.patch<{ device: Device }>(`/v1/tab-sync/devices/${encodeURIComponent(deviceId)}`, payload)
}

/** 设备心跳 - 告知后端设备在线 */
export function deviceHeartbeat(deviceId: string) {
  return apiClient.post<{ ok: true }>(`/v1/tab-sync/devices/${encodeURIComponent(deviceId)}/heartbeat`)
}

/** 注销设备 - 登出时通知后端移除设备 */
export function deregisterDevice(deviceId: string) {
  return apiClient.delete<{ ok: true }>(`/v1/tab-sync/devices/${encodeURIComponent(deviceId)}`)
}
