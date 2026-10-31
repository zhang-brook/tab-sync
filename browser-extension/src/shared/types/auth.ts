/** 认证状态（API Key 风格，无需账号密码） */
export interface AuthState {
  /** 是否已认证 */
  authenticated: boolean
  /** Bearer Token（API Key 风格） */
  token: string | null
}

/** Token 验证响应 */
export interface VerifyTokenResponse {
  valid: boolean
}

/** 服务器版本信息 */
export interface ServerVersionInfo {
  serverVersion: string
  minExtVersion: string
  maxExtVersion: string
  apiVersion: string
  /** 服务端时间（Unix 毫秒），旧版服务端可能不返回 */
  serverTime?: number
}

/** 服务端检测结果：版本兼容性 + 连通性诊断 */
export interface ServerCheckInfo {
  compatible?: boolean
  serverVersion?: string
  minExtVersion?: string
  maxExtVersion?: string
  reason?: string
  /** 请求往返时延（毫秒） */
  latencyMs?: number
  /** 服务端时间减本地时间（毫秒），正值表示服务端更快 */
  clockDiffMs?: number
  /** 本次检测完成时间（Unix 毫秒） */
  checkedAt?: number
}
