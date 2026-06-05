import type { ExtensionMessage, MessageResponse, StateData, LoginData, TabsData, WorkspacesData, DevicesData } from '../shared/types'
import type { TabReference } from '../shared/types'
import { storage, STORAGE_KEYS } from '../shared/storage'
import { loginWithCredentials, verifyToken, logout as apiLogout } from '../shared/api/auth'
import { getDevices } from '../shared/api/devices'
import { getTabs } from '../shared/api/tabs'
import { getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace } from '../shared/api/workspaces'
import { getBrowserInfo, getOSInfo } from '../shared/utils/device-fingerprint'
import { logger } from '../shared/utils/logger'
import { triggerSync } from './sync-engine'
import { startAlarms, stopAlarms } from './alarm-manager'
import { registerPendingReopen } from './tab-monitor'

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
      // 手动触发一次完整同步（增量上传 + 拉取远端变更）
      await triggerSync()
      return { success: true }

    case 'GET_TABS':
      return handleGetTabs(message.payload)

    case 'CLOSE_TAB':
      return handleCloseTab(message.payload.tabId)

    case 'CLOSE_TABS_BATCH':
      return handleCloseTabsBatch(message.payload.tabIds)

    case 'REOPEN_TAB':
      return handleReopenTab(message.payload.url)

    case 'GET_WORKSPACES':
      return handleGetWorkspaces()

    case 'CREATE_WORKSPACE':
      return handleCreateWorkspace(message.payload)

    case 'UPDATE_WORKSPACE':
      return handleUpdateWorkspace(message.payload)

    case 'DELETE_WORKSPACE':
      return handleDeleteWorkspace(message.payload.id)

    case 'OPEN_WORKSPACE':
      return handleOpenWorkspace(message.payload)

    case 'GET_DEVICES':
      return handleGetDevices()

    default:
      return { success: false, error: '未知的消息类型' }
  }
}

/** 获取扩展当前状态 */
async function handleGetState(): Promise<MessageResponse<StateData>> {
  const { auth_token, auth_user } = await storage.getMultiple([
    STORAGE_KEYS.AUTH_TOKEN,
    STORAGE_KEYS.AUTH_USER,
  ])

  const lastSyncAt = await storage.get(STORAGE_KEYS.LAST_SYNC_AT)

  // 从 session storage 获取待同步事件数
  const sessionData = await chrome.storage.session.get('pending_events')
  const pendingEvents: unknown[] = (sessionData['pending_events'] as unknown[]) || []

  // 尝试从后端获取标签页计数（后端不可用时降级为 0）
  let openCount = 0
  let closedCount = 0
  if (auth_token) {
    try {
      const openRes = await getTabs({ status: 'open', limit: 1 })
      if (openRes.ok && openRes.data) openCount = openRes.data.total
      const closedRes = await getTabs({ status: 'closed', limit: 1 })
      if (closedRes.ok && closedRes.data) closedCount = closedRes.data.total
    } catch {
      // 后端不可用，降级处理
    }
  }

  return {
    success: true,
    data: {
      auth: {
        authenticated: !!auth_token,
        token: auth_token,
        user: auth_user,
      },
      syncStatus: pendingEvents.length > 0 ? 'syncing' : 'idle',
      lastSyncAt: lastSyncAt || null,
      pendingCount: pendingEvents.length,
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
  // 登录成功后启动定时同步和心跳
  await startAlarms()
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

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, res.data.accessToken)
  await storage.set(STORAGE_KEYS.REFRESH_TOKEN, res.data.refreshToken)
  await storage.set(STORAGE_KEYS.AUTH_USER, res.data.user)
  logger.info('Credentials login success:', res.data.user.username)
  // 登录成功后启动定时同步和心跳
  await startAlarms()
  return { success: true, data: { user: res.data.user } }
}

/** 登出 */
async function handleLogout(): Promise<MessageResponse> {
  // 尝试通知后端，失败也没关系
  const refreshToken = await storage.get(STORAGE_KEYS.REFRESH_TOKEN)
  if (refreshToken) {
    await apiLogout(refreshToken).catch(() => {})
  }

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, null)
  await storage.set(STORAGE_KEYS.REFRESH_TOKEN, null)
  await storage.set(STORAGE_KEYS.AUTH_USER, null)
  // 登出后停止定时同步和心跳
  await stopAlarms()
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

// ============ 标签页操作 ============

/** 获取标签页列表（支持筛选，从后端 API 获取） */
async function handleGetTabs(
  filters?: { status?: string; search?: string; deviceId?: string; workspaceId?: string },
): Promise<MessageResponse<TabsData>> {
  const res = await getTabs({ ...filters })
  if (res.ok && res.data) {
    return { success: true, data: { tabs: res.data.tabs } }
  }
  // 后端不可用时返回空列表
  logger.warn('getTabs API failed:', res.error)
  return { success: true, data: { tabs: [] } }
}

/** 关闭本地标签页（通过 session storage 查找 chromeTabId） */
async function handleCloseTab(tabId: string): Promise<MessageResponse> {
  // 从 session storage 查找对应的 chromeTabId（反向映射：UUID → chromeTabId）
  const { tab_id_mappings } = await chrome.storage.session.get('tab_id_mappings')
  const mappings: Record<string, string> = (tab_id_mappings as Record<string, string>) || {}
  const chromeTabIdStr = Object.keys(mappings).find(key => mappings[key] === tabId)
  if (!chromeTabIdStr) {
    return { success: false, error: '标签页不在当前会话中' }
  }

  try {
    await chrome.tabs.remove(Number(chromeTabIdStr))
  } catch {
    // 标签页可能已经被用户手动关闭
  }

  return { success: true }
}

/** 批量关闭标签页（通过 session storage 查找 chromeTabId） */
async function handleCloseTabsBatch(tabIds: string[]): Promise<MessageResponse> {
  const { tab_id_mappings } = await chrome.storage.session.get('tab_id_mappings')
  const mappings: Record<string, string> = (tab_id_mappings as Record<string, string>) || {}
  const uuidSet = new Set(tabIds)
  const chromeTabIds: number[] = []

  for (const [chromeTabIdStr, uuid] of Object.entries(mappings)) {
    if (uuidSet.has(uuid)) {
      chromeTabIds.push(Number(chromeTabIdStr))
    }
  }

  if (chromeTabIds.length > 0) {
    try {
      await chrome.tabs.remove(chromeTabIds)
    } catch {
      // 部分标签页可能已经关闭
    }
  }

  return { success: true }
}

/** 重新打开标签页 */
async function handleReopenTab(url: string): Promise<MessageResponse> {
  await chrome.tabs.create({ url })
  logger.info('Reopened tab:', url)
  return { success: true }
}

// ============ 工作组操作 ============

/** 获取所有工作组（从后端 API 获取） */
async function handleGetWorkspaces(): Promise<MessageResponse<WorkspacesData>> {
  const res = await getWorkspaces()
  if (res.ok && res.data) {
    return { success: true, data: { workspaces: res.data.workspaces } }
  }
  logger.warn('getWorkspaces API failed:', res.error)
  return { success: false, error: res.error || '获取工作组失败' }
}

/** 创建工作组（通过后端 API） */
async function handleCreateWorkspace(
  payload: { name: string; color: string; icon?: string; tabIds: string[] },
): Promise<MessageResponse> {
  const res = await createWorkspace(payload)
  if (res.ok && res.data) {
    logger.info('Workspace created:', payload.name)
    return { success: true, data: { workspace: res.data.workspace } }
  }
  logger.warn('createWorkspace API failed:', res.error)
  return { success: false, error: res.error || '创建工作组失败' }
}

/** 更新工作组（通过后端 API） */
async function handleUpdateWorkspace(
  payload: { id: string; name?: string; color?: string; icon?: string; tabIds?: string[] },
): Promise<MessageResponse> {
  const { id, ...updatePayload } = payload
  const res = await updateWorkspace(id, updatePayload)
  if (res.ok) {
    logger.info('Workspace updated:', id)
    return { success: true }
  }
  logger.warn('updateWorkspace API failed:', res.error)
  return { success: false, error: res.error || '更新工作组失败' }
}

/** 删除工作组（通过后端 API） */
async function handleDeleteWorkspace(id: string): Promise<MessageResponse> {
  const res = await deleteWorkspace(id)
  if (res.ok) {
    logger.info('Workspace deleted:', id)
    return { success: true }
  }
  logger.warn('deleteWorkspace API failed:', res.error)
  return { success: false, error: res.error || '删除工作组失败' }
}

/** 打开工作组中的标签页（带去重：已打开的直接激活，已关闭的复用原记录） */
async function handleOpenWorkspace(
  payload: { id: string; tabIds?: string[]; newWindow?: boolean },
): Promise<MessageResponse> {
  // 从后端获取工作组数据
  const res = await getWorkspaces()
  if (!res.ok || !res.data) {
    return { success: false, error: res.error || '获取工作组失败' }
  }

  const workspace = res.data.workspaces.find((w) => w.id === payload.id)
  if (!workspace) {
    return { success: false, error: '工作组不存在' }
  }

  // 确定要打开的标签页
  const tabsToOpen = payload.tabIds
    ? workspace.tabs.filter((t) => payload.tabIds!.includes(t.tabId))
    : workspace.tabs

  if (tabsToOpen.length === 0) {
    return { success: false, error: '没有可打开的标签页' }
  }

  // 从 session storage 获取当前打开的标签页映射
  const { tab_id_mappings } = await chrome.storage.session.get('tab_id_mappings')
  const mappings: Record<string, string> = (tab_id_mappings as Record<string, string>) || {}
  // 构建反向映射: UUID → chromeTabId
  const uuidToChromeTabId: Record<string, number> = {}
  for (const [chromeTabIdStr, uuid] of Object.entries(mappings)) {
    uuidToChromeTabId[uuid] = Number(chromeTabIdStr)
  }

  let opened = 0
  let alreadyOpen = 0

  // 分类: 已打开的标签页 vs 需要重新打开的标签页
  const toActivate: { chromeTabId: number; windowId?: number }[] = []
  const toReopen: TabReference[] = []

  for (const tabRef of tabsToOpen) {
    const chromeTabId = uuidToChromeTabId[tabRef.tabId]
    if (chromeTabId != null) {
      // 尝试确认 Chrome 标签页是否真的还存在
      try {
        const tab = await chrome.tabs.get(chromeTabId)
        toActivate.push({ chromeTabId, windowId: tab.windowId })
        continue
      } catch {
        // Chrome 标签页已不存在（可能被用户关闭但事件未捕获），转入重新打开
      }
    }
    toReopen.push(tabRef)
  }

  // 1) 激活已打开的标签页（当前窗口模式下才激活，新窗口模式下跳过）
  if (!payload.newWindow) {
    for (const item of toActivate) {
      try {
        await chrome.tabs.update(item.chromeTabId, { active: true })
        if (item.windowId != null) {
          await chrome.windows.update(item.windowId, { focused: true })
        }
      } catch {
        // 忽略激活失败
      }
    }
  }
  alreadyOpen = toActivate.length

  // 2) 重新打开已关闭/不存在的标签页
  if (toReopen.length > 0) {
    if (payload.newWindow) {
      // 新窗口模式: 逐个创建以确保每个标签页都能正确预注册
      // 先创建窗口
      const firstTab = toReopen[0]
      registerPendingReopen(firstTab.url, firstTab.tabId)
      const win = await chrome.windows.create({ url: firstTab.url })
      opened++

      // 剩余标签页在该窗口中创建
      for (let i = 1; i < toReopen.length; i++) {
        registerPendingReopen(toReopen[i].url, toReopen[i].tabId)
        await chrome.tabs.create({ url: toReopen[i].url, windowId: win?.id })
        opened++
      }
    } else {
      // 当前窗口模式
      for (const tabRef of toReopen) {
        registerPendingReopen(tabRef.url, tabRef.tabId)
        await chrome.tabs.create({ url: tabRef.url })
        opened++
      }
    }
  }

  logger.info(
    `Workspace "${workspace.name}": opened=${opened}, alreadyOpen=${alreadyOpen}`,
  )
  return {
    success: true,
    data: { opened, alreadyOpen },
  }
}

// ============ 设备操作 ============

/** 获取设备列表（当前设备 + 远端设备） */
async function handleGetDevices(): Promise<MessageResponse<DevicesData>> {
  const deviceId = (await storage.get(STORAGE_KEYS.DEVICE_ID)) || ''
  const deviceName = (await storage.get(STORAGE_KEYS.DEVICE_NAME)) || ''

  // 当前设备信息
  const currentDevice = {
    id: deviceId,
    name: deviceName,
    browser: getBrowserInfo(),
    os: getOSInfo(),
    lastSeen: new Date().toISOString(),
  }

  // 尝试从后端获取设备列表
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (token) {
    const res = await getDevices()
    if (res.ok && res.data) {
      // 后端返回的列表中可能已包含当前设备，确保当前设备排在最前面
      const remoteDevices = res.data.devices.filter((d) => d.id !== deviceId)
      return {
        success: true,
        data: { devices: [currentDevice, ...remoteDevices] },
      }
    }
  }

  // 未登录或后端不可用，仅返回当前设备
  return {
    success: true,
    data: { devices: [currentDevice] },
  }
}
