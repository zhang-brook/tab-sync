import { storage, STORAGE_KEYS } from '../storage'
import { logger } from '../utils/logger'

/**
 * 基于 fetch 的 API 客户端封装
 * - 自动附加 Authorization header
 * - 自动附加 X-Device-Id header
 * - 自动解包 CommonReturn 响应 (取 data 字段)
 * - 统一错误处理
 */

export interface ApiResponse<T> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const deviceId = await storage.get(STORAGE_KEYS.DEVICE_ID)
  if (deviceId) {
    headers['X-Device-Id'] = deviceId
  }

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
      logger.warn('Token 无效或已过期，清除认证状态')
      await storage.set(STORAGE_KEYS.AUTH_TOKEN, null)
      await storage.set(STORAGE_KEYS.AUTH_USER, null)
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
