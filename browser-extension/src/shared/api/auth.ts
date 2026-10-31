import { apiClient } from './client'
import type { ServerVersionInfo } from '../types'

/** 获取服务器版本信息（用于版本协商）；传入 baseUrl 可临时检测该地址而不落盘 */
export function getServerVersion(baseUrl?: string) {
  return apiClient.get<ServerVersionInfo>('/v1/tab-sync/version', baseUrl)
}
