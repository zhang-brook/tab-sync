import { apiClient } from './client'
import type { LoginResponse, VerifyTokenResponse } from '../types'

/** Token 刷新响应 */
export interface RefreshTokenResponse {
  accessToken: string
  refreshToken: string
}

/** 账号密码登录 */
export function loginWithCredentials(username: string, password: string, platformCode: string) {
  return apiClient.post<LoginResponse>('/v1/tab-sync/auth/login', { username, password, platformCode })
}

/** 刷新 Token */
export function refreshToken(refreshToken: string) {
  return apiClient.post<RefreshTokenResponse>('/v1/tab-sync/auth/refresh', { refreshToken })
}

/** 验证 Token 有效性 */
export function verifyToken(token: string) {
  return apiClient.post<VerifyTokenResponse>('/v1/tab-sync/auth/verify-token', { token })
}

/** 登出 */
export function logout(refreshToken: string) {
  return apiClient.post('/v1/tab-sync/auth/logout', { refreshToken })
}
