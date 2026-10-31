import { storage, STORAGE_KEYS } from '../storage'
import { logger } from '../utils/logger'
import { getOrCreateDeviceId } from '../utils/device-fingerprint'
import type { VerifyTokenResponse } from '../types'

export interface TokenVerifyResult {
  ok: boolean
  status: number
  data?: VerifyTokenResponse
  error?: string
}

/**
 * 候选 Token 校验客户端。
 * 与业务 apiClient 完全独立：使用传入的 Token 作为 Authorization，不读写本地认证；
 * 401 仅表示候选 Token 无效，不会清除当前登录态。
 */
export async function verifyTokenCandidate(token: string): Promise<TokenVerifyResult> {
  const baseUrl = (await storage.get(STORAGE_KEYS.API_BASE_URL)) || ''
  if (!baseUrl) {
    return { ok: false, status: 0, error: '未配置后端地址' }
  }

  try {
    const deviceId = await getOrCreateDeviceId()
    const res = await fetch(`${baseUrl}/v1/tab-sync/auth/verify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify({ token }),
    })

    const json = await res.json().catch(() => null)

    if (res.status === 401) {
      return { ok: false, status: 401, error: 'Token 无效或已过期' }
    }

    if (json && typeof json === 'object' && 'success' in json) {
      if (!json.success) {
        return { ok: false, status: res.status, error: json.message || `请求失败 (${res.status})` }
      }
      return { ok: true, status: res.status, data: json.data as VerifyTokenResponse }
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: `请求失败 (${res.status})` }
    }

    return { ok: true, status: res.status, data: json as VerifyTokenResponse }
  } catch (err) {
    const message = err instanceof Error ? err.message : '网络请求失败'
    logger.error('Token verify request failed:', message)
    return { ok: false, status: 0, error: message }
  }
}
