/** 认证状态（v3: API Key 风格，无需账号密码） */
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
}
