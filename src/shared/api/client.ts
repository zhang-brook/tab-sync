import { storage, STORAGE_KEYS } from '../storage'
import { logger } from '../utils/logger'
import { getOrCreateDeviceId } from '../utils/device-fingerprint'

/**
 * 基于 fetch 的 API 客户端封装
 * - 自动附加 Authorization header
 * - 自动附加 X-Device-Id header
 * - 自动解包 CommonReturn 响应 (取 data 字段)
 * - 统一错误处理
 * - Token 过期自动续签（防并发重复刷新）
 */

export interface ApiResponse<T> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

/** 刷新中 Promise，用于合并并发 401 请求的刷新调用 */
let refreshPromise: Promise<boolean> | null = null

/**
 * 执行 Token 刷新（绕过 request 避免递归）
 * @returns true 表示刷新成功
 */
async function doRefreshToken(refreshToken: string): Promise<boolean> {
  const baseUrl = await getBaseUrl()
  if (!baseUrl) {
    logger.warn('Token 续签失败：未配置后端地址')
    return false
  }

  try {
    const res = await fetch(`${baseUrl}/v1/tab-sync/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    logger.info(`Token 续签响应: HTTP ${res.status}`)

    const json = await res.json().catch(() => null)

    if (!json) {
      logger.warn('Token 续签失败：响应体解析失败')
      return false
    }

    if (res.status === 401) {
      logger.warn('Token 续签失败：服务端返回 401')
      return false
    }

    // CommonReturn 解包: { code, success, data, ... }
    if (json.success === false) {
      logger.warn('Token 续签失败：', json.message || 'refresh_token 无效或已过期')
      return false
    }

    const data = json?.data
    if (data?.accessToken) {
      await storage.set(STORAGE_KEYS.AUTH_TOKEN, data.accessToken)
      await storage.set(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken)
      logger.info('Token 续签成功')
      return true
    }

    logger.warn('Token 续签失败：响应中缺少 accessToken', json)
    return false
  } catch (err) {
    logger.error('Token 刷新请求异常:', err)
    return false
  }
}

function clearAuth(): Promise<void> {
  return storage.setMultiple({
    [STORAGE_KEYS.AUTH_TOKEN]: null,
    [STORAGE_KEYS.REFRESH_TOKEN]: null,
    [STORAGE_KEYS.AUTH_USER]: null,
  }) as Promise<void>
}

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const deviceId = await getOrCreateDeviceId()
  headers['X-Device-Id'] = deviceId

  return headers
}

async function getBaseUrl(): Promise<string> {
  const url = await storage.get(STORAGE_KEYS.API_BASE_URL)
  return url || ''
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const baseUrl = await getBaseUrl()
  if (!baseUrl) {
    return { ok: false, status: 0, error: '未配置后端地址' }
  }

  const url = `${baseUrl}${path}`
  const headers = await getHeaders()

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })

    const json = await res.json().catch(() => null)

    if (res.status === 401) {
      // 如果当前请求就是 refresh 自身，不再重试，直接清除认证
      if (path === '/v1/tab-sync/auth/refresh') {
        logger.warn('Token 刷新失败，清除认证状态')
        await clearAuth()
        return { ok: false, status: 401, error: 'Token 无效或已过期' }
      }

      // 尝试使用 refresh_token 续签
      const storedRefreshToken = await storage.get(STORAGE_KEYS.REFRESH_TOKEN)
      if (storedRefreshToken) {
        logger.info('Token 过期，尝试续签...')

        // 合并并发刷新请求，防止多次重复刷新
        if (!refreshPromise) {
          refreshPromise = doRefreshToken(storedRefreshToken).finally(() => {
            refreshPromise = null
          })
        }
        const refreshed = await refreshPromise

        if (refreshed) {
          logger.info('Token 续签成功，重试原请求')
          return request<T>(method, path, body)
        }
        logger.warn('Token 续签失败，清除认证状态')
      } else {
        logger.warn('没有 refresh_token，无法续签')
      }

      // 刷新失败或无可用的 refresh_token，清除认证
      logger.warn('Token 无效或已过期，清除认证状态')
      await clearAuth()
      return { ok: false, status: 401, error: 'Token 无效或已过期' }
    }

    // 解包 CommonReturn 响应: { code, success, data, message, developerMessage, traceId }
    if (json && typeof json === 'object' && 'success' in json) {
      if (!json.success) {
        const errorMsg = json.message || json.developerMessage || `请求失败 (${res.status})`
        return { ok: false, status: res.status, error: errorMsg }
      }
      // 成功时取 data 字段作为实际数据
      return { ok: true, status: res.status, data: json.data as T }
    }

    // 非 CommonReturn 格式的响应 (兼容)
    if (!res.ok) {
      const errorMsg = json?.error?.message || `请求失败 (${res.status})`
      return { ok: false, status: res.status, error: errorMsg }
    }

    return { ok: true, status: res.status, data: json as T }
  } catch (err) {
    const message = err instanceof Error ? err.message : '网络请求失败'
    logger.error('API request failed:', method, path, message)
    return { ok: false, status: 0, error: message }
  }
}

export const apiClient = {
  get<T>(path: string): Promise<ApiResponse<T>> {
    return request<T>('GET', path)
  },
  post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('POST', path, body)
  },
  put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, body)
  },
  patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('PATCH', path, body)
  },
  delete<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path, body)
  },
}
