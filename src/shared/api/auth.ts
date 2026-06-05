import { apiClient } from './client'
import type { LoginResponse, VerifyTokenResponse } from '../types'

/** 账号密码登录 */
export function loginWithCredentials(username: string, password: string) {
  return apiClient.post<LoginResponse>('/v1/tab-sync/auth/login', { username, password })
}

/** 验证 Token 有效性 */
export function verifyToken(token: string) {
  return apiClient.post<VerifyTokenResponse>('/v1/tab-sync/auth/verify-token', { token })
}

/** 登出 */
export function logout(refreshToken: string) {
  return apiClient.post('/v1/tab-sync/auth/logout', { refreshToken })
}
