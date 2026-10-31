import { apiClient } from './client'
import type { VerifyTokenResponse, ServerVersionInfo } from '../types'

/** 验证 Token 有效性 */
export function verifyToken(token: string) {
  return apiClient.post<VerifyTokenResponse>('/v1/tab-sync/auth/verify-token', { token })
}

/** 获取服务器版本信息（用于版本协商）；传入 baseUrl 可临时检测该地址而不落盘 */
export function getServerVersion(baseUrl?: string) {
  return apiClient.get<ServerVersionInfo>('/v1/tab-sync/version', baseUrl)
}
