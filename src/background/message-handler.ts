import type { ExtensionMessage, MessageResponse, StateData, LoginData, TabsData, WorkspacesData, DevicesData } from '../shared/types'
import type { Workspace, TabReference } from '../shared/types'
import { generateUUID, nowISO } from '../shared/utils/tab-utils'
import { storage, STORAGE_KEYS } from '../shared/storage'
import { loginWithCredentials, verifyToken, logout as apiLogout } from '../shared/api/auth'
import { getDevices } from '../shared/api/devices'
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
  const { auth_token, auth_user, sync_state } = await storage.getMultiple([
    STORAGE_KEYS.AUTH_TOKEN,
    STORAGE_KEYS.AUTH_USER,
    STORAGE_KEYS.SYNC_STATE,
  ])

  const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const pendingEvents = await storage.get(STORAGE_KEYS.PENDING_EVENTS)
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

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, res.data.token)
  await storage.set(STORAGE_KEYS.AUTH_USER, res.data.user)
  logger.info('Credentials login success:', res.data.user.username)
  // 登录成功后启动定时同步和心跳
  await startAlarms()
  return { success: true, data: { user: res.data.user } }
}

/** 登出 */
async function handleLogout(): Promise<MessageResponse> {
  // 尝试通知后端，失败也没关系
  await apiLogout().catch(() => {})

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, null)
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

/** 获取标签页列表（支持筛选） */
async function handleGetTabs(
  filters?: { status?: string; search?: string; deviceId?: string; workspaceId?: string },
): Promise<MessageResponse<TabsData>> {
  const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  let tabs = Object.values(tabRecords)

  if (filters?.status) {
    tabs = tabs.filter(t => t.status === filters.status)
  }
  if (filters?.deviceId) {
    tabs = tabs.filter(t => t.deviceId === filters.deviceId)
  }
  if (filters?.workspaceId) {
    tabs = tabs.filter(t => t.workspaceIds.includes(filters.workspaceId!))
  }
  if (filters?.search) {
    const keyword = filters.search.toLowerCase()
    tabs = tabs.filter(
      t => t.title.toLowerCase().includes(keyword) || t.url.toLowerCase().includes(keyword),
    )
  }

  // 按最近访问时间倒序
  tabs.sort((a, b) => new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime())

  return { success: true, data: { tabs } }
}

/** 关闭本地标签页，保留远端记录 */
async function handleCloseTab(tabId: string): Promise<MessageResponse> {
  const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const record = records[tabId]
  if (!record) {
    return { success: false, error: '标签页不存在' }
  }

  if (record.status === 'open') {
    try {
      await chrome.tabs.remove(record.chromeTabId)
    } catch {
      // 标签页可能已经被用户手动关闭
    }
  }

  return { success: true }
}

/** 批量关闭标签页 */
async function handleCloseTabsBatch(tabIds: string[]): Promise<MessageResponse> {
  const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const chromeTabIds: number[] = []

  for (const tabId of tabIds) {
    const record = records[tabId]
    if (record && record.status === 'open') {
      chromeTabIds.push(record.chromeTabId)
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

/** 获取所有工作组 */
async function handleGetWorkspaces(): Promise<MessageResponse<WorkspacesData>> {
  const workspaces = await storage.get(STORAGE_KEYS.WORKSPACES)
  return { success: true, data: { workspaces } }
}

/** 创建工作组 */
async function handleCreateWorkspace(
  payload: { name: string; color: string; icon?: string; tabIds: string[] },
): Promise<MessageResponse> {
  const workspaces = await storage.get(STORAGE_KEYS.WORKSPACES)
  const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const now = nowISO()

  // 根据 tabIds 构建 TabReference 快照
  const tabs: TabReference[] = payload.tabIds
    .map((id) => {
      const record = tabRecords[id]
      if (!record) return null
      return {
        tabId: id,
        url: record.url,
        title: record.title,
        favIconUrl: record.favIconUrl,
        addedAt: now,
      }
    })
    .filter((t): t is TabReference => t !== null)

  const workspace: Workspace = {
    id: generateUUID(),
    name: payload.name,
    color: payload.color,
    icon: payload.icon,
    tabs,
    createdAt: now,
    updatedAt: now,
  }

  workspaces.push(workspace)
  await storage.set(STORAGE_KEYS.WORKSPACES, workspaces)

  // 更新关联标签页的 workspaceIds
  for (const tabRef of tabs) {
    const record = tabRecords[tabRef.tabId]
    if (record && !record.workspaceIds.includes(workspace.id)) {
      record.workspaceIds.push(workspace.id)
    }
  }
  await storage.set(STORAGE_KEYS.TAB_RECORDS, tabRecords)

  logger.info('Workspace created:', workspace.name)
  return { success: true, data: { workspace } }
}

/** 更新工作组 */
async function handleUpdateWorkspace(
  payload: { id: string; name?: string; color?: string; icon?: string; tabIds?: string[] },
): Promise<MessageResponse> {
  const workspaces = await storage.get(STORAGE_KEYS.WORKSPACES)
  const idx = workspaces.findIndex((w) => w.id === payload.id)
  if (idx === -1) {
    return { success: false, error: '工作组不存在' }
  }

  const workspace = workspaces[idx]
  const now = nowISO()

  if (payload.name !== undefined) workspace.name = payload.name
  if (payload.color !== undefined) workspace.color = payload.color
  if (payload.icon !== undefined) workspace.icon = payload.icon

  // 如果更新了标签页列表
  if (payload.tabIds !== undefined) {
    const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)

    // 移除旧关联
    for (const oldRef of workspace.tabs) {
      const record = tabRecords[oldRef.tabId]
      if (record) {
        record.workspaceIds = record.workspaceIds.filter((id) => id !== workspace.id)
      }
    }

    // 构建新的 TabReference 列表
    workspace.tabs = payload.tabIds
      .map((id) => {
        const record = tabRecords[id]
        if (!record) return null
        return {
          tabId: id,
          url: record.url,
          title: record.title,
          favIconUrl: record.favIconUrl,
          addedAt: now,
        }
      })
      .filter((t): t is TabReference => t !== null)

    // 添加新关联
    for (const tabRef of workspace.tabs) {
      const record = tabRecords[tabRef.tabId]
      if (record && !record.workspaceIds.includes(workspace.id)) {
        record.workspaceIds.push(workspace.id)
      }
    }

    await storage.set(STORAGE_KEYS.TAB_RECORDS, tabRecords)
  }

  workspace.updatedAt = now
  workspaces[idx] = workspace
  await storage.set(STORAGE_KEYS.WORKSPACES, workspaces)

  logger.info('Workspace updated:', workspace.name)
  return { success: true }
}

/** 删除工作组 */
async function handleDeleteWorkspace(id: string): Promise<MessageResponse> {
  const workspaces = await storage.get(STORAGE_KEYS.WORKSPACES)
  const idx = workspaces.findIndex((w) => w.id === id)
  if (idx === -1) {
    return { success: false, error: '工作组不存在' }
  }

  const workspace = workspaces[idx]

  // 清除关联标签页的 workspaceIds
  const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  for (const tabRef of workspace.tabs) {
    const record = tabRecords[tabRef.tabId]
    if (record) {
      record.workspaceIds = record.workspaceIds.filter((wid) => wid !== id)
    }
  }
  await storage.set(STORAGE_KEYS.TAB_RECORDS, tabRecords)

  workspaces.splice(idx, 1)
  await storage.set(STORAGE_KEYS.WORKSPACES, workspaces)

  logger.info('Workspace deleted:', workspace.name)
  return { success: true }
}

/** 打开工作组中的标签页（带去重：已打开的直接激活，已关闭的复用原记录） */
async function handleOpenWorkspace(
  payload: { id: string; tabIds?: string[]; newWindow?: boolean },
): Promise<MessageResponse> {
  const workspaces = await storage.get(STORAGE_KEYS.WORKSPACES)
  const workspace = workspaces.find((w) => w.id === payload.id)
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

  const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  let opened = 0
  let alreadyOpen = 0

  // 分类: 已打开的标签页 vs 需要重新打开的标签页
  const toActivate: { chromeTabId: number; windowId: number }[] = []
  const toReopen: TabReference[] = []

  for (const tabRef of tabsToOpen) {
    const record = tabRecords[tabRef.tabId]
    if (record && record.status === 'open') {
      // 尝试确认 Chrome 标签页是否真的还存在
      try {
        await chrome.tabs.get(record.chromeTabId)
        toActivate.push({ chromeTabId: record.chromeTabId, windowId: record.windowId })
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
