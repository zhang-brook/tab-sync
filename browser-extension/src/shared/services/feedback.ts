import { ElMessage } from 'element-plus'
import { toServiceError } from './message'

export interface ReportServiceErrorOptions {
  /** 兜底错误文案 */
  fallback?: string
  /** 未登录/后端不可达时的提示 */
  authMessage?: string
}

/** 统一展示服务层错误：认证错误用 warning，其余用 error */
export function reportServiceError(err: unknown, options: ReportServiceErrorOptions = {}): void {
  const { fallback = '操作失败', authMessage = '未连接到后端，请先登录' } = options
  const e = toServiceError(err, fallback)
  if (e.authError) ElMessage.warning(authMessage)
  else ElMessage.error(e.message || fallback)
}
