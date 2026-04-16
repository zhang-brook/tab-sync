import type { ExtensionMessage, MessageResponse, StateData, LoginData } from '../shared/types'
import { storage, STORAGE_KEYS } from '../shared/storage'
import { loginWithCredentials, verifyToken, logout as apiLogout } from '../shared/api/auth'
import { logger } from '../shared/utils/logger'

/**
 * 统一消息处理分发器
 */
export async function handleMessage(message: ExtensionMessage): Promise<MessageResponse> {
  switch (message.action) {
    case 'GET_STATE':
      return handleGetState()

    case 'LOGIN_WITH_TOKEN':
      return handleLoginWithToken(message.payload.token)

    case 'LOGIN_WITH_CREDENTIALS':
      return handleLoginWithCredentials(message.payload.username, message.payload.password)

    case 'LOGOUT':
      return handleLogout()

    case 'OPEN_DASHBOARD':
      return handleOpenDashboard()

    case 'SYNC_NOW':
      // 同步引擎尚未实现，先返回成功
      return { success: true }

    case 'GET_TABS':
    case 'CLOSE_TAB':
    case 'CLOSE_TABS_BATCH':
    case 'REOPEN_TAB':
    case 'GET_WORKSPACES':
    case 'CREATE_WORKSPACE':
    case 'UPDATE_WORKSPACE':
    case 'DELETE_WORKSPACE':
    case 'OPEN_WORKSPACE':
      // 后续阶段实现
      return { success: false, error: `${message.action} 尚未实现` }

    default:
      return { success: false, error: '未知的消息类型' }
  }
}

/** 获取扩展当前状态 */
async function handleGetState(): Promise<MessageResponse<StateData>> {
  const { auth_token, auth_user, sync_state } = await storage.getMultiple([
    STORAGE_KEYS.AUTH_TOKEN,
    STORAGE_KEYS.AUTH_USER,
    STORAGE_KEYS.SYNC_STATE,
  ])

  const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const tabs = Object.values(tabRecords)
  const openCount = tabs.filter(t => t.status === 'open').length
  const closedCount = tabs.filter(t => t.status === 'closed').length

  return {
    success: true,
    data: {
      auth: {
        authenticated: !!auth_token,
        token: auth_token,
        user: auth_user,
      },
      syncStatus: sync_state.status,
      lastSyncAt: sync_state.lastSyncAt,
      tabCount: { open: openCount, closed: closedCount },
    },
  }
}

/** Token 登录 */
async function handleLoginWithToken(token: string): Promise<MessageResponse<LoginData>> {
  // 先保存 token，这样 verifyToken 发请求时 apiClient 能读到
  await storage.set(STORAGE_KEYS.AUTH_TOKEN, token)

  const res = await verifyToken(token)

  if (!res.ok || !res.data) {
    // 验证失败，清除 token
    await storage.set(STORAGE_KEYS.AUTH_TOKEN, null)
    // 如果是因为未配置后端地址导致的，给出明确提示
    const error = res.error || 'Token 验证失败'
    logger.warn('Token login failed:', error)
    return { success: false, error }
  }

  await storage.set(STORAGE_KEYS.AUTH_USER, res.data.user)
  logger.info('Token login success:', res.data.user.username)
  return { success: true, data: { user: res.data.user } }
}

/** 账号密码登录 */
async function handleLoginWithCredentials(
  username: string,
  password: string,
): Promise<MessageResponse<LoginData>> {
  const res = await loginWithCredentials(username, password)

  if (!res.ok || !res.data) {
    const error = res.error || '登录失败'
    logger.warn('Credentials login failed:', error)
    return { success: false, error }
  }

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, res.data.token)
  await storage.set(STORAGE_KEYS.AUTH_USER, res.data.user)
  logger.info('Credentials login success:', res.data.user.username)
  return { success: true, data: { user: res.data.user } }
}

/** 登出 */
async function handleLogout(): Promise<MessageResponse> {
  // 尝试通知后端，失败也没关系
  await apiLogout().catch(() => {})

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, null)
  await storage.set(STORAGE_KEYS.AUTH_USER, null)
  logger.info('Logged out')
  return { success: true }
}

/** 打开 Dashboard 管理面板 */
async function handleOpenDashboard(): Promise<MessageResponse> {
  const dashboardUrl = chrome.runtime.getURL('src/dashboard/index.html')

  // 检查是否已经有打开的 Dashboard 标签页，避免重复打开
  const tabs = await chrome.tabs.query({ url: dashboardUrl })
  if (tabs.length > 0 && tabs[0].id != null) {
    // 已经打开了，切换到该标签页
    await chrome.tabs.update(tabs[0].id, { active: true })
    if (tabs[0].windowId != null) {
      await chrome.windows.update(tabs[0].windowId, { focused: true })
    }
  } else {
    await chrome.tabs.create({ url: dashboardUrl })
  }

  return { success: true }
}
