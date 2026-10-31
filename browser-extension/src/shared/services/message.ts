import { sendMessage } from '../composables/useMessage'
import type { ExtensionMessage } from '../types'

/**
 * 服务层统一错误：把 background 返回的 { success:false, error, authError }
 * 归一化成可抛出/可展示的错误对象，避免每个调用点重复判断。
 */
export class ServiceError extends Error {
  readonly authError: boolean

  constructor(message: string, authError = false) {
    super(message)
    this.name = 'ServiceError'
    this.authError = authError
  }
}

/** 调用 background 消息服务，失败时抛出 ServiceError，成功时直接返回 data */
export async function callService<T>(message: ExtensionMessage): Promise<T> {
  const res = await sendMessage<T>(message)
  if (!res.success) {
    throw new ServiceError(res.error || '操作失败', !!res.authError)
  }
  return res.data as T
}

/** 把任意异常归一化为 ServiceError */
export function toServiceError(err: unknown, fallback = '操作失败'): ServiceError {
  if (err instanceof ServiceError) return err
  const message = err instanceof Error ? err.message : ''
  return new ServiceError(message || fallback)
}
