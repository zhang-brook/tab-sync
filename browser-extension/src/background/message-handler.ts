import type { ExtensionMessage, MessageResponse, StateData, WorkspacesData, DevicesData, TagsData, TagInfo, TagTabsData, RecycleBinData } from '../shared/types'
import type { TabReference } from '../shared/types'
import { storage, STORAGE_KEYS } from '../shared/storage'
import { verifyToken, getServerVersion } from '../shared/api/auth'
import { getDevices, registerDevice, deregisterDevice } from '../shared/api/devices'
import { getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, getWorkspaceTabsSummary, moveWorkspaceTab, updateWorkspaceTab, addWorkspaceTabByUrl } from '../shared/api/workspaces'
import { getTags, createTag, updateTag, deleteTag, addTabTag, removeTabTag, addWorkspaceTag, removeWorkspaceTag, getTagTabs } from '../shared/api/tags'
import { getRecycleBin, restoreRecycleBinTab, deleteRecycleBinTab, emptyRecycleBin } from '../shared/api/recyclebin'
import { getBrowserInfo, getOSInfo, getOrCreateDeviceId, getDeviceName } from '../shared/utils/device-fingerprint'
import { openTabAfterActive, openTabsAfterActive } from '../shared/utils/tab-utils'
import { DASHBOARD_URL } from '../shared/utils/pages'
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

    case 'LOGOUT':
      return handleLogout()

    case 'CHECK_VERSION':
      return handleCheckVersion()

    case 'SET_CONNECTION_MODE':
      return handleSetConnectionMode(message.payload)

    case 'OPEN_DASHBOARD':
      return handleOpenDashboard()

    case 'GET_WORKSPACE_TABS_SUMMARY':
      return handleGetWorkspaceTabsSummary()

    case 'GET_WORKSPACES':
      return handleGetWorkspaces(message.payload)

    case 'CREATE_WORKSPACE':
      return handleCreateWorkspace(message.payload)

    case 'UPDATE_WORKSPACE':
      return handleUpdateWorkspace(message.payload)

    case 'DELETE_WORKSPACE':
      return handleDeleteWorkspace(message.payload.id)

    case 'OPEN_WORKSPACE':
      return handleOpenWorkspace(message.payload)

    case 'ADD_TABS_TO_WORKSPACE':
      return handleAddTabsToWorkspace(message.payload)

    case 'ADD_WORKSPACE_TAB_BY_URL':
      return handleAddWorkspaceTabByUrl(message.payload)

    case 'MOVE_WORKSPACE_TAB':
      return handleMoveWorkspaceTab(message.payload)

    case 'UPDATE_WORKSPACE_TAB':
      return handleUpdateWorkspaceTab(message.payload)

    case 'REMOVE_WORKSPACE_TAB':
      return handleRemoveWorkspaceTab(message.payload.workspaceId, message.payload.tabId)

    case 'GET_RECYCLE_BIN':
      return handleGetRecycleBin()

    case 'RESTORE_RECYCLE_BIN_TAB':
      return handleRestoreRecycleBinTab(message.payload)

    case 'DELETE_RECYCLE_BIN_TAB':
      return handleDeleteRecycleBinTab(message.payload)

    case 'EMPTY_RECYCLE_BIN':
      return handleEmptyRecycleBin()

    case 'GET_DEVICES':
      return handleGetDevices()

    case 'DEREGISTER_DEVICE':
      return handleDeregisterDevice(message.payload.deviceId)

    case 'GET_TAGS':
      return handleGetTags(message.payload)

    case 'CREATE_TAG':
      return handleCreateTag(message.payload)

    case 'UPDATE_TAG':
      return handleUpdateTag(message.payload)

    case 'DELETE_TAG':
      return handleDeleteTag(message.payload.tagId)

    case 'ADD_TAB_TAG':
      return handleAddTabTag(message.payload)

    case 'REMOVE_TAB_TAG':
      return handleRemoveTabTag(message.payload)

    case 'ADD_WORKSPACE_TAG':
      return handleAddWorkspaceTag(message.payload)

    case 'REMOVE_WORKSPACE_TAG':
      return handleRemoveWorkspaceTag(message.payload)

    case 'GET_TAG_TABS':
      return handleGetTagTabs(message.payload.tagId)

    default:
      return { success: false, error: '未知的消息类型' }
  }
}

/** 获取扩展当前状态 */
async function handleGetState(): Promise<MessageResponse<StateData>> {
  const { auth_token, connection_mode } = await storage.getMultiple([
    STORAGE_KEYS.AUTH_TOKEN,
    STORAGE_KEYS.CONNECTION_MODE,
  ])

  // 从浏览器获取当前打开的标签页数量
  const chromeTabs = await chrome.tabs.query({})
  const openCount = chromeTabs.length

  // 以 status 'unloaded' 统计已休眠/未加载的标签页（frozen 查询条件需要更新的 Chrome 类型定义支持）
  const unloadedTabs = await chrome.tabs.query({ status: 'unloaded' })
  const frozenCount = unloadedTabs.length

  return {
    success: true,
    data: {
      auth: {
        authenticated: !!auth_token,
        token: auth_token,
      },
      tabCount: { open: openCount, frozen: frozenCount },
      connectionMode: connection_mode ?? null,
    },
  }
}

/** Token 登录 */
async function handleLoginWithToken(token: string): Promise<MessageResponse> {
  // 先保存 token，这样 verifyToken 发请求时 apiClient 能读到
  await storage.set(STORAGE_KEYS.AUTH_TOKEN, token)

  const res = await verifyToken(token)

  if (!res.ok || !res.data?.valid) {
    // 验证失败，清除 token
    await storage.set(STORAGE_KEYS.AUTH_TOKEN, null)
    const error = res.error || 'Token 验证失败'
    logger.warn('Token login failed:', error)
    return { success: false, error }
  }

  logger.info('Token login success')

  // 登录成功后向后端注册当前设备
  const deviceId = await getOrCreateDeviceId()
  const deviceName = await getDeviceName()
  registerDevice({ deviceId, name: deviceName, browser: getBrowserInfo(), os: getOSInfo() })
    .then(res => {
      if (res.ok) logger.info('Device registered on server after login')
      else logger.debug('Device registration skipped (server unavailable):', res.error)
    })
    .catch(() => { })

  return { success: true }
}

/** 登出（API Key 风格：仅清除本地 Token） */
async function handleLogout(): Promise<MessageResponse> {
  // 尝试通知后端注销设备，失败也没关系
  const deviceId = await storage.get(STORAGE_KEYS.DEVICE_ID)
  if (deviceId) {
    deregisterDevice(deviceId).catch(() => { })
  }

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, null)
  logger.info('Logged out')
  return { success: true }
}

/** 版本协商：检查客户端与服务端版本兼容性 */
async function handleCheckVersion(): Promise<MessageResponse> {
  const res = await getServerVersion()

  if (!res.ok || !res.data) {
    return {
      success: true,
      data: {
        compatible: false,
        serverVersion: '未知',
        reason: res.error || '无法连接服务器',
      },
    }
  }

  const { serverVersion, minExtVersion, maxExtVersion } = res.data
  const extVersion = chrome.runtime.getManifest().version

  const compatible =
    compareVersions(extVersion, minExtVersion) >= 0 &&
    compareVersions(extVersion, maxExtVersion) <= 0

  return {
    success: true,
    data: {
      compatible,
      serverVersion,
      minExtVersion,
      maxExtVersion,
      extVersion,
      reason: compatible ? undefined : `扩展版本 ${extVersion} 不在服务器兼容范围 [${minExtVersion}, ${maxExtVersion}]`,
    },
  }
}

/** 设置连接模式与后端地址 */
async function handleSetConnectionMode(
  payload: { mode: 'lightweight' | 'zhige'; apiBaseUrl?: string },
): Promise<MessageResponse> {
  await storage.set(STORAGE_KEYS.CONNECTION_MODE, payload.mode)

  if (payload.mode === 'lightweight' && payload.apiBaseUrl) {
    await storage.set(STORAGE_KEYS.API_BASE_URL, payload.apiBaseUrl)
  }

  logger.info(`Connection mode set to: ${payload.mode}`, payload.apiBaseUrl ? `url=${payload.apiBaseUrl}` : '')
  return { success: true }
}

/** 打开 Dashboard 管理面板 */
async function handleOpenDashboard(): Promise<MessageResponse> {
  const dashboardUrl = DASHBOARD_URL

  // 检查是否已经有打开的 Dashboard 标签页，避免重复打开
  const tabs = await chrome.tabs.query({ url: dashboardUrl })
  if (tabs.length > 0 && tabs[0].id != null) {
    // 已经打开了，切换到该标签页
    await chrome.tabs.update(tabs[0].id, { active: true })
    if (tabs[0].windowId != null) {
      await chrome.windows.update(tabs[0].windowId, { focused: true })
    }
  } else {
    // 在当前窗口的激活标签页之后打开（而非追加到末尾）
    await openTabAfterActive(dashboardUrl)
  }

  return { success: true }
}

/** 比较两个 x.y.z 格式的版本号，返回 -1（a<b）/ 0（相等）/ 1（a>b） */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na < nb ? -1 : 1
  }
  return 0
}

// ============ 工作组操作 ============

/** 获取所有工作组（从后端 API 获取） */
async function handleGetWorkspaces(payload?: { includeSystem?: boolean }): Promise<MessageResponse<WorkspacesData>> {
  const res = await getWorkspaces(payload?.includeSystem ?? false)
  if (res.ok && res.data) {
    return { success: true, data: { workspaces: res.data.workspaces } }
  }
  logger.warn('getWorkspaces API failed:', res.error)
  return { success: false, error: res.error || '获取工作组失败', authError: res.status === 401 }
}

/** 创建工作组（通过后端 API，不含标签页） */
async function handleCreateWorkspace(
  payload: { name: string; color: string; icon?: string; description?: string; parentId?: string },
): Promise<MessageResponse> {
  const res = await createWorkspace(payload)
  if (res.ok && res.data) {
    logger.info('Workspace created:', payload.name)
    return { success: true, data: { workspace: res.data.workspace } }
  }
  logger.warn('createWorkspace API failed:', res.error)
  return { success: false, error: res.error || '创建工作组失败', authError: res.status === 401 }
}

/** 更新工作组（通过后端 API） */
async function handleUpdateWorkspace(
  payload: { id: string; name?: string; color?: string; icon?: string; description?: string; parentId?: string; tabs?: Array<{ url: string; title: string; favIconUrl: string; chromeTabId: number }> },
): Promise<MessageResponse> {
  const { id, ...updatePayload } = payload
  const res = await updateWorkspace(id, updatePayload)
  if (res.ok) {
    logger.info('Workspace updated:', id)
    return { success: true }
  }
  logger.warn('updateWorkspace API failed:', res.error)
  return { success: false, error: res.error || '更新工作组失败', authError: res.status === 401 }
}

/** 删除工作组（通过后端 API） */
async function handleDeleteWorkspace(id: string): Promise<MessageResponse> {
  const res = await deleteWorkspace(id)
  if (res.ok) {
    logger.info('Workspace deleted:', id)
    return { success: true }
  }
  logger.warn('deleteWorkspace API failed:', res.error)
  return { success: false, error: res.error || '删除工作组失败', authError: res.status === 401 }
}

/** 将选中的标签页加入现有工作组（去重后合并） */
async function handleAddTabsToWorkspace(
  payload: { workspaceId: string; tabs: Array<{ url: string; title: string; favIconUrl: string; chromeTabId: number }> },
): Promise<MessageResponse> {
  // 1. 获取所有工作组（含系统工作组「未分组」，否则右键菜单「保存到未分组」无法定位目标）
  const res = await getWorkspaces(true)
  if (!res.ok || !res.data) {
    logger.warn('addTabsToWorkspace: getWorkspaces failed:', res.error)
    return { success: false, error: res.error || '获取工作组列表失败', authError: res.status === 401 }
  }

  // 2. 找到目标工作组
  const workspace = res.data.workspaces.find(w => w.id === payload.workspaceId)
  if (!workspace) {
    return { success: false, error: '工作组不存在' }
  }

  // 3. 获取已有标签页 URL 集合（用于去重）
  const existingUrls = new Set(workspace.tabs.map(t => t.url))

  // 4. 过滤新标签页，只保留不在工作组中的
  const newTabs = payload.tabs.filter(t => !existingUrls.has(t.url))
  if (newTabs.length === 0) {
    // 所有标签页已存在
    return { success: true, data: { added: 0, skipped: payload.tabs.length } }
  }

  // 5. 将已有 TabReference 转为 WorkspaceTabPayload（chromeTabId=0 表示未知，保留 tabId）
  const existingTabPayloads = workspace.tabs.map(t => ({
    tabId: t.tabId,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    chromeTabId: 0,
  }))

  // 6. 合并后调用更新 API
  const allTabs = [...existingTabPayloads, ...newTabs]
  const updateRes = await updateWorkspace(payload.workspaceId, { tabs: allTabs })
  if (updateRes.ok) {
    logger.info(`Added ${newTabs.length} tabs to workspace "${workspace.name}"`)
    return { success: true, data: { added: newTabs.length, skipped: payload.tabs.length - newTabs.length } }
  }
  logger.warn('addTabsToWorkspace: updateWorkspace failed:', updateRes.error)
  return { success: false, error: updateRes.error || '更新工作组失败', authError: updateRes.status === 401 }
}

/** 通过 URL 向工作组添加标签页 */
async function handleAddWorkspaceTabByUrl(
  payload: { workspaceId: string; url: string; title?: string },
): Promise<MessageResponse> {
  const res = await addWorkspaceTabByUrl(payload.workspaceId, payload.url, payload.title)
  if (res.ok && res.data) {
    logger.info(`Tab added by URL to workspace "${payload.workspaceId}": ${payload.url}`)
    return { success: true, data: res.data }
  }
  logger.warn('addWorkspaceTabByUrl API failed:', res.error)
  return { success: false, error: res.error || '添加标签页失败', authError: res.status === 401 }
}

/** 将 hex 颜色映射为 Chrome 标签组颜色名称 */
function mapHexToTabGroupColor(hex: string): chrome.tabGroups.Color {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // 计算与各 Chrome 预设颜色 (近似值) 的欧氏距离，取最接近的
  const presetColors: Array<{ name: chrome.tabGroups.Color; r: number; g: number; b: number }> = [
    { name: chrome.tabGroups.Color.GREY, r: 128, g: 128, b: 128 },
    { name: chrome.tabGroups.Color.BLUE, r: 66, g: 133, b: 244 },
    { name: chrome.tabGroups.Color.RED, r: 219, g: 68, b: 55 },
    { name: chrome.tabGroups.Color.YELLOW, r: 244, g: 180, b: 0 },
    { name: chrome.tabGroups.Color.GREEN, r: 15, g: 157, b: 88 },
    { name: chrome.tabGroups.Color.PINK, r: 233, g: 30, b: 99 },
    { name: chrome.tabGroups.Color.PURPLE, r: 154, g: 50, b: 211 },
    { name: chrome.tabGroups.Color.CYAN, r: 82, g: 196, b: 196 },
    { name: chrome.tabGroups.Color.ORANGE, r: 251, g: 140, b: 0 },
  ]

  let minDist = Infinity
  let closest: chrome.tabGroups.Color = chrome.tabGroups.Color.BLUE
  for (const preset of presetColors) {
    const dr = r - preset.r
    const dg = g - preset.g
    const db = b - preset.b
    const dist = dr * dr + dg * dg + db * db
    if (dist < minDist) {
      minDist = dist
      closest = preset.name
    }
  }
  return closest
}

/** 打开工作组中的标签页（带去重：已打开的直接激活，已关闭的复用原记录） */
async function handleOpenWorkspace(
  payload: { id: string; tabIds?: string[]; newWindow?: boolean; asTabGroup?: boolean },
): Promise<MessageResponse> {
  const { id, tabIds, newWindow, asTabGroup } = payload

  // 从后端获取工作组数据
  const res = await getWorkspaces()
  if (!res.ok || !res.data) {
    return { success: false, error: res.error || '获取工作组失败', authError: res.status === 401 }
  }

  const workspace = res.data.workspaces.find((w) => w.id === id)
  if (!workspace) {
    return { success: false, error: '工作组不存在' }
  }

  // 确定要打开的标签页
  const tabsToOpen = tabIds
    ? workspace.tabs.filter((t) => tabIds!.includes(t.tabId))
    : workspace.tabs

  if (tabsToOpen.length === 0) {
    return { success: false, error: '没有可打开的标签页' }
  }

  let opened = 0

  // 收集所有要归入标签组的 Chrome tabId（用于 asTabGroup 模式）
  const allChromeTabIds: number[] = []

  // 工作组 tab 以后端主键标识，不与本地 chromeTabId 绑定，因此统一按"重新打开"处理
  const toReopen: TabReference[] = tabsToOpen

  // 确定标签组目标窗口 ID
  let targetWindowId: number | undefined
  if (asTabGroup) {
    if (newWindow) {
      // 新窗口模式：稍后在创建窗口后设置
    } else {
      // 当前窗口模式：获取当前聚焦窗口
      try {
        const currentWin = await chrome.windows.getLastFocused()
        targetWindowId = currentWin.id
      } catch {
        // 忽略，后续分组时不指定 windowId
      }
    }
  }

  // 重新打开标签页
  if (toReopen.length > 0) {
    if (newWindow) {
      // 新窗口模式：先用第一个标签页创建窗口，其余在该窗口中依次创建
      const firstTab = toReopen[0]
      const win = await chrome.windows.create({ url: firstTab.url })
      opened++
      if (win?.tabs?.[0]?.id != null) {
        allChromeTabIds.push(win.tabs[0].id)
      }
      targetWindowId = win?.id

      // 剩余标签页在该窗口中创建
      for (let i = 1; i < toReopen.length; i++) {
        const tab = await chrome.tabs.create({ url: toReopen[i].url, windowId: win?.id })
        opened++
        if (tab?.id != null) {
          allChromeTabIds.push(tab.id)
        }
      }
    } else {
      // 当前窗口模式：批量在激活标签之后打开，内部只查询一次索引避免漂移
      const urls = toReopen.map((t) => t.url)
      const tabs = await openTabsAfterActive(urls)
      for (const tab of tabs) {
        opened++
        if (tab?.id != null) {
          allChromeTabIds.push(tab.id)
        }
      }
    }
  }

  // 3) 创建标签组
  if (asTabGroup && allChromeTabIds.length > 1) {
    try {
      const groupOptions: chrome.tabs.GroupOptions = { tabIds: allChromeTabIds as [number, ...number[]] }
      if (targetWindowId != null) {
        groupOptions.createProperties = { windowId: targetWindowId }
      }
      const groupId = await chrome.tabs.group(groupOptions)
      await chrome.tabGroups.update(groupId, {
        title: workspace.name,
        color: mapHexToTabGroupColor(workspace.color),
        collapsed: false,
      })
      logger.info(`Tab group created for workspace "${workspace.name}": groupId=${groupId}, tabs=${allChromeTabIds.length}`)
    } catch (e) {
      logger.warn('Failed to create tab group:', e)
      // 分组失败不影响整体操作
    }
  }

  logger.info(
    `Workspace "${workspace.name}": opened=${opened}${asTabGroup ? ', grouped=' + allChromeTabIds.length : ''}`,
  )
  return {
    success: true,
    data: { opened },
  }
}

/** 移动标签页到目标工作组指定位置（支持同组排序和跨组移动） */
async function handleMoveWorkspaceTab(
  payload: { workspaceId: string; tabId: string; newIndex: number },
): Promise<MessageResponse> {
  try {
    const res = await moveWorkspaceTab(payload.workspaceId, payload.tabId, payload.newIndex)
    if (res.ok) {
      logger.info(`Tab moved: ${payload.tabId} → workspace=${payload.workspaceId}, index=${payload.newIndex}`)
      return { success: true }
    }
    logger.warn('moveWorkspaceTab API failed:', res.error)
    return { success: false, error: res.error || '移动标签页失败', authError: res.status === 401 }
  } catch (err) {
    logger.warn('moveWorkspaceTab error:', err)
    return { success: false, error: '移动标签页失败: ' + String(err) }
  }
}

/** 更新工作组内单个标签页属性（支持手动设置添加时间 addedAt、重命名 displayName、编辑链接 url/title/favIconUrl、描述 description） */
async function handleUpdateWorkspaceTab(
  payload: {
    workspaceId: string
    tabId: string
    addedAt?: string
    displayName?: string
    url?: string
    title?: string
    favIconUrl?: string
    description?: string
  },
): Promise<MessageResponse> {
  try {
    const res = await updateWorkspaceTab(payload.workspaceId, payload.tabId, {
      addedAt: payload.addedAt,
      displayName: payload.displayName,
      url: payload.url,
      title: payload.title,
      favIconUrl: payload.favIconUrl,
    })
    if (res.ok) {
      logger.info(`Tab updated: ${payload.tabId} in workspace=${payload.workspaceId}`)
      return { success: true }
    }
    logger.warn('updateWorkspaceTab API failed:', res.error)
    return { success: false, error: res.error || '更新标签页失败', authError: res.status === 401 }
  } catch (err) {
    logger.warn('updateWorkspaceTab error:', err)
    return { success: false, error: '更新标签页失败: ' + String(err) }
  }
}

/** 从工作组中移除指定标签页 */
async function handleRemoveWorkspaceTab(workspaceId: string, tabId: string): Promise<MessageResponse> {
  try {
    // 1. 获取所有工作组（含系统工作组「未分组」，否则其下的标签页无法定位）
    const res = await getWorkspaces(true)
    if (!res.ok || !res.data) {
      return { success: false, error: res.error || '获取工作组列表失败', authError: res.status === 401 }
    }

    // 2. 找到目标工作组
    const workspace = res.data.workspaces.find(w => w.id === workspaceId)
    if (!workspace) {
      return { success: false, error: '工作组不存在' }
    }

    // 3. 过滤掉要移除的标签页
    const remainingTabs = workspace.tabs.filter(t => t.tabId !== tabId)
    if (remainingTabs.length === workspace.tabs.length) {
      return { success: false, error: '标签页不在该工作组中' }
    }

    // 4. 构造更新 payload（保留 tabId，chromeTabId=0 表示未知）
    const tabPayloads = remainingTabs.map(t => ({
      tabId: t.tabId,
      url: t.url,
      title: t.title,
      favIconUrl: t.favIconUrl,
      chromeTabId: 0,
    }))

    // 5. 调用更新 API
    const updateRes = await updateWorkspace(workspaceId, { tabs: tabPayloads })
    if (updateRes.ok) {
      logger.info(`Tab ${tabId} removed from workspace "${workspace.name}"`)
      return { success: true }
    }
    logger.warn('removeWorkspaceTab: updateWorkspace failed:', updateRes.error)
    return { success: false, error: updateRes.error || '移除标签页失败', authError: updateRes.status === 401 }
  } catch (err) {
    logger.warn('removeWorkspaceTab error:', err)
    return { success: false, error: '移除标签页失败: ' + String(err) }
  }
}

// ============ 设备操作 ============

/** 获取所有工作组的标签页摘要（url + workspace 信息，用于 TabsView 交叉比对打 tag） */
async function handleGetWorkspaceTabsSummary(): Promise<MessageResponse> {
  const res = await getWorkspaceTabsSummary()
  if (res.ok && res.data) {
    return { success: true, data: res.data }
  }
  logger.warn('getWorkspaceTabsSummary API failed:', res.error)
  return { success: true, data: { summaries: [] } }
}

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
    // API 失败，如果是认证错误则传播标记
    if (res.status === 401) {
      return { success: true, data: { devices: [currentDevice] }, authError: true }
    }
  }

  // 未登录或后端不可用，仅返回当前设备
  return {
    success: true,
    data: { devices: [currentDevice] },
  }
}

/** 远程注销指定设备（踢下线） */
async function handleDeregisterDevice(deviceId: string): Promise<MessageResponse> {
  try {
    const res = await deregisterDevice(deviceId)
    if (res.ok) {
      logger.info('Device deregistered:', deviceId)
      return { success: true }
    }
    logger.warn('deregisterDevice API failed:', res.error)
    return { success: false, error: res.error || '注销设备失败', authError: res.status === 401 }
  } catch (err) {
    logger.error('deregisterDevice error:', err)
    return { success: false, error: '注销设备失败: ' + String(err) }
  }
}

// ============ 标签操作 ============

/** 获取标签列表 */
async function handleGetTags(payload?: { scope?: 'tab' | 'workspace' }): Promise<MessageResponse<TagsData>> {
  const res = await getTags(payload?.scope)
  if (res.ok && res.data) {
    return { success: true, data: { tags: res.data.tags } }
  }
  return { success: false, error: res.error || '获取标签失败', authError: res.status === 401 }
}

/** 创建标签 */
async function handleCreateTag(
  payload: { name: string; color?: string; scope: 'tab' | 'workspace'; description?: string },
): Promise<MessageResponse<TagInfo>> {
  const res = await createTag(payload)
  if (res.ok && res.data) {
    return { success: true, data: res.data }
  }
  return { success: false, error: res.error || '创建标签失败', authError: res.status === 401 }
}

/** 更新标签（名称/颜色/描述） */
async function handleUpdateTag(
  payload: { tagId: number; name?: string; color?: string; description?: string },
): Promise<MessageResponse<TagInfo>> {
  const res = await updateTag(payload.tagId, {
    name: payload.name,
    color: payload.color,
    description: payload.description,
  })
  if (res.ok && res.data) {
    return { success: true, data: res.data }
  }
  return { success: false, error: res.error || '更新标签失败', authError: res.status === 401 }
}

/** 删除标签 */
async function handleDeleteTag(tagId: number): Promise<MessageResponse> {
  const res = await deleteTag(tagId)
  if (res.ok) {
    return { success: true }
  }
  return { success: false, error: res.error || '删除标签失败', authError: res.status === 401 }
}

/** 给工作组内标签页打标签 */
async function handleAddTabTag(
  payload: { workspaceId: string; tabId: string; tagId: number },
): Promise<MessageResponse> {
  const res = await addTabTag(payload.workspaceId, payload.tabId, payload.tagId)
  if (res.ok) {
    return { success: true }
  }
  return { success: false, error: res.error || '添加标签失败', authError: res.status === 401 }
}

/** 去掉标签页上的标签 */
async function handleRemoveTabTag(
  payload: { workspaceId: string; tabId: string; tagId: number },
): Promise<MessageResponse> {
  const res = await removeTabTag(payload.workspaceId, payload.tabId, payload.tagId)
  if (res.ok) {
    return { success: true }
  }
  return { success: false, error: res.error || '移除标签失败', authError: res.status === 401 }
}

/** 给工作组打标签 */
async function handleAddWorkspaceTag(
  payload: { workspaceId: string; tagId: number },
): Promise<MessageResponse> {
  const res = await addWorkspaceTag(payload.workspaceId, payload.tagId)
  if (res.ok) {
    return { success: true }
  }
  return { success: false, error: res.error || '添加标签失败', authError: res.status === 401 }
}

/** 去掉工作组上的标签 */
async function handleRemoveWorkspaceTag(
  payload: { workspaceId: string; tagId: number },
): Promise<MessageResponse> {
  const res = await removeWorkspaceTag(payload.workspaceId, payload.tagId)
  if (res.ok) {
    return { success: true }
  }
  return { success: false, error: res.error || '移除标签失败', authError: res.status === 401 }
}

/** 获取某个标签下包含的所有云端标签页 */
async function handleGetTagTabs(tagId: number): Promise<MessageResponse<TagTabsData>> {
  const res = await getTagTabs(tagId)
  if (res.ok && res.data) {
    return { success: true, data: { tabs: res.data.tabs } }
  }
  return { success: false, error: res.error || '获取标签下的标签页失败', authError: res.status === 401 }
}

// ============ 回收站 ============

async function handleGetRecycleBin(): Promise<MessageResponse<RecycleBinData>> {
  const res = await getRecycleBin()
  if (res.ok && res.data) {
    return { success: true, data: { recycleBin: res.data } }
  }
  return { success: false, error: res.error || '获取回收站失败', authError: res.status === 401 }
}

async function handleRestoreRecycleBinTab(payload: { id: number }): Promise<MessageResponse> {
  const res = await restoreRecycleBinTab(payload.id)
  if (res.ok) {
    return { success: true, data: res.data }
  }
  return { success: false, error: res.error || '恢复失败', authError: res.status === 401 }
}

async function handleDeleteRecycleBinTab(payload: { id: number }): Promise<MessageResponse> {
  const res = await deleteRecycleBinTab(payload.id)
  if (res.ok) {
    return { success: true, data: res.data }
  }
  return { success: false, error: res.error || '删除失败', authError: res.status === 401 }
}

async function handleEmptyRecycleBin(): Promise<MessageResponse> {
  const res = await emptyRecycleBin()
  if (res.ok) {
    return { success: true, data: res.data }
  }
  return { success: false, error: res.error || '清空回收站失败', authError: res.status === 401 }
}

