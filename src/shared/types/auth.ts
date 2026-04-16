/** 认证状态 */
export interface AuthState {
  /** 是否已认证 */
  authenticated: boolean
  /** Bearer Token */
  token: string | null
  /** 当前用户信息 */
  user: AuthUser | null
}

export interface AuthUser {
  id: string
  username: string
  email: string
}

/** 账号密码登录请求 */
export interface LoginRequest {
  username: string
  password: string
}

/** 登录响应 */
export interface LoginResponse {
  token: string
  user: AuthUser
}

/** Token 验证响应 */
export interface VerifyTokenResponse {
  valid: boolean
  user: AuthUser
}
