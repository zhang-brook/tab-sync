import { apiClient } from './client'
import type { LoginResponse, VerifyTokenResponse } from '../types'

/** 账号密码登录 */
export function loginWithCredentials(username: string, password: string) {
  return apiClient.post<LoginResponse>('/api/v1/auth/login', { username, password })
}

/** 验证 Token 有效性 */
export function verifyToken(token: string) {
  return apiClient.post<VerifyTokenResponse>('/api/v1/auth/verify-token', { token })
}

/** 登出 */
export function logout() {
  return apiClient.post('/api/v1/auth/logout')
}
