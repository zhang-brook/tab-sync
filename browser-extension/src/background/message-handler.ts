import type { ExtensionMessage, MessageResponse, StateData, WorkspacesData, WorkspaceTabsData, WorkspaceTabsGroupsData, SyncedTabPageData, TabHostsData, DevicesData, DashboardStatsData, TagsData, TagInfo, TagTabsData, RecycleBinData, GetRecycleBinMessage, WorkspaceTabsChangedMessage } from '../shared/types'
import type { TabTagMatch } from '../shared/types/tab-list'
import { storage, STORAGE_KEYS } from '../shared/storage'
import { getServerVersion } from '../shared/api/auth'
import { verifyTokenCandidate } from '../shared/api/token-verify'
import { getDevices, registerDevice, deregisterDevice } from '../shared/api/devices'
import { getDashboardStats } from '../shared/api/stats'
import { getWorkspaces, getWorkspaceTabs, getSyncedTabs, getTabHosts, createWorkspace, updateWorkspace, moveWorkspace, deleteWorkspace, duplicateWorkspace, getWorkspaceTabsSummary, moveWorkspaceTab, copyWorkspaceTab, updateWorkspaceTab, addWorkspaceTabByUrl, deleteWorkspaceTab } from '../shared/api/workspaces'
import { getTags, createTag, updateTag, deleteTag, addTabTag, removeTabTag, addWorkspaceTag, removeWorkspaceTag, getTagTabs } from '../shared/api/tags'
import { getRecycleBin, restoreRecycleBinTabs, deleteRecycleBinTab, emptyRecycleBin } from '../shared/api/recyclebin'
import { getBrowserInfo, getOSInfo, getOrCreateDeviceId, getDeviceName } from '../shared/utils/device-fingerprint'
import { mapHexToTabGroupColor, openTabAfterActive, openTabUrls } from '../shared/utils/tab-utils'
import { DASHBOARD_URL } from '../shared/utils/pages'
import { logger } from '../shared/utils/logger'

/** 会改变工作组标签页摘要的写操作：成功后需通知各 UI 页面刷新「已保存到云端」标记 */
const WORKSPACE_TABS_CHANGED_ACTIONS: ReadonlySet<ExtensionMessage['action']> = new Set<
  ExtensionMessage['action']
>([
  'ADD_TABS_TO_WORKSPACE',
  'ADD_WORKSPACE_TAB_BY_URL',
  'MOVE_WORKSPACE_TAB',
  'COPY_WORKSPACE_TAB',
  'UPDATE_WORKSPACE_TAB',
  'REMOVE_WORKSPACE_TAB',
  'UPDATE_WORKSPACE',
  'DELETE_WORKSPACE',
  'DUPLICATE_WORKSPACE',
  'RESTORE_RECYCLE_BIN_TABS',
])

/**
 * 广播工作组标签页变更：侧边栏与管理面板均为独立页面，
 * 需要主动通知才能让按 URL 交叉比对的来源色条与工作组标签同步刷新。
 */
function broadcastWorkspaceTabsChanged() {
  const message: WorkspaceTabsChangedMessage = { action: 'WORKSPACE_TABS_CHANGED' }
  chrome.runtime.sendMessage(message, () => {
    // 没有打开的 UI 页面时会报 "Receiving end does not exist"，读取 lastError 避免控制台报错
    void chrome.runtime.lastError
  })
}

/**
 * 统一消息处理分发器
 */
export async function handleMessage(message: ExtensionMessage): Promise<MessageResponse> {
  const response = await dispatchMessage(message)
  if (response.success && WORKSPACE_TABS_CHANGED_ACTIONS.has(message.action)) {
    broadcastWorkspaceTabsChanged()
  }
  return response
}

async function dispatchMessage(message: ExtensionMessage): Promise<MessageResponse> {
  switch (message.action) {
    case 'GET_STATE':
      return handleGetState()

    case 'LOGIN_WITH_TOKEN':
      return handleLoginWithToken(message.payload.token)

    case 'LOGOUT':
      return handleLogout()

    case 'CHECK_VERSION':
      return handleCheckVersion(message.payload as { apiBaseUrl?: string } | undefined)

    case 'SET_CONNECTION_MODE':
      return handleSetConnectionMode(message.payload)

    case 'OPEN_DASHBOARD':
      return handleOpenDashboard()

    case 'GET_WORKSPACE_TABS_SUMMARY':
      return handleGetWorkspaceTabsSummary()

    case 'GET_WORKSPACES':
      return handleGetWorkspaces(message.payload)

    case 'GET_WORKSPACE_TABS':
      return handleGetWorkspaceTabs(message.payload)

    case 'GET_SYNCED_TABS':
      return handleGetSyncedTabs(message.payload)

    case 'GET_TAB_HOSTS':
      return handleGetTabHosts(message.payload)

    case 'CREATE_WORKSPACE':
      return handleCreateWorkspace(message.payload)

    case 'UPDATE_WORKSPACE':
      return handleUpdateWorkspace(message.payload)

    case 'MOVE_WORKSPACE':
      return handleMoveWorkspace(message.payload)

    case 'DELETE_WORKSPACE':
      return handleDeleteWorkspace(message.payload.id, message.payload.defaultWorkspaceId)

    case 'DUPLICATE_WORKSPACE':
      return handleDuplicateWorkspace(message.payload.id)

    case 'OPEN_WORKSPACE':
      return handleOpenWorkspace(message.payload)

    case 'ADD_TABS_TO_WORKSPACE':
      return handleAddTabsToWorkspace(message.payload)

    case 'ADD_WORKSPACE_TAB_BY_URL':
      return handleAddWorkspaceTabByUrl(message.payload)

    case 'MOVE_WORKSPACE_TAB':
      return handleMoveWorkspaceTab(message.payload)

    case 'COPY_WORKSPACE_TAB':
      return handleCopyWorkspaceTab(message.payload)

    case 'UPDATE_WORKSPACE_TAB':
      return handleUpdateWorkspaceTab(message.payload)

    case 'REMOVE_WORKSPACE_TAB':
      return handleRemoveWorkspaceTab(message.payload.workspaceId, message.payload.tabId)

    case 'GET_RECYCLE_BIN':
      return handleGetRecycleBin(message.payload)

    case 'RESTORE_RECYCLE_BIN_TABS':
      return handleRestoreRecycleBinTabs(message.payload)

    case 'DELETE_RECYCLE_BIN_TAB':
      return handleDeleteRecycleBinTab(message.payload)

    case 'EMPTY_RECYCLE_BIN':
      return handleEmptyRecycleBin()

    case 'GET_DEVICES':
      return handleGetDevices()

    case 'GET_DASHBOARD_STATS':
      return handleGetDashboardStats()

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
  // 先携带待校验 Token 请求服务端，通过后再写入本地；失败不触碰现有认证
  const res = await verifyTokenCandidate(token)

  if (!res.ok || !res.data?.valid) {
    const error = res.error || 'Token 验证失败'
    logger.warn('Token login failed:', error)
    return { success: false, error }
  }

  await storage.set(STORAGE_KEYS.AUTH_TOKEN, token)
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

/** 版本协商：检查客户端与服务端版本兼容性；payload.apiBaseUrl 用于临时测试未保存的地址 */
async function handleCheckVersion(payload?: { apiBaseUrl?: string }): Promise<MessageResponse> {
  const startedAt = Date.now()
  const res = await getServerVersion(payload?.apiBaseUrl)
  const latencyMs = Date.now() - startedAt

  if (!res.ok || !res.data) {
    return {
      success: true,
      data: {
        compatible: false,
        serverVersion: '未知',
        reason: res.error || '无法连接服务器',
        checkedAt: Date.now(),
      },
    }
  }

  const { serverVersion, minExtVersion, maxExtVersion, serverTime } = res.data
  const extVersion = chrome.runtime.getManifest().version

  const compatible =
    compareVersions(extVersion, minExtVersion) >= 0 &&
    compareVersions(extVersion, maxExtVersion) <= 0

  // 服务端时间戳约产生于请求往返的中点，用它和本地时间估算时钟偏差；正值表示服务端更快
  const clockDiffMs = typeof serverTime === 'number'
    ? Math.round(serverTime - (startedAt + latencyMs / 2))
    : undefined

  return {
    success: true,
    data: {
      compatible,
      serverVersion,
      minExtVersion,
      maxExtVersion,
      extVersion,
      reason: compatible ? undefined : `扩展版本 ${extVersion} 不在服务器兼容范围 [${minExtVersion}, ${maxExtVersion}]`,
      latencyMs,
      clockDiffMs,
      checkedAt: Date.now(),
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
async function handleGetWorkspaces(payload?: { includeSystem?: boolean; includeTabs?: boolean }): Promise<MessageResponse<WorkspacesData>> {
  // 默认不拉取标签页，工作组树仅需要元信息；右侧列表按需调用 GET_WORKSPACE_TABS
  const res = await getWorkspaces(payload?.includeSystem ?? false, payload?.includeTabs ?? false)
  if (res.ok && res.data) {
    return { success: true, data: { workspaces: res.data.workspaces } }
  }
  logger.warn('getWorkspaces API failed:', res.error)
  return { success: false, error: res.error || '获取工作组失败', authError: res.status === 401 }
}

/** 获取工作组的标签页列表（管理页面右侧列表按需拉取，而非随工作组树全量返回）。
 * recursive=true 时一次返回该工作组自身及整棵子树的标签页（按工作区分组）。 */
async function handleGetWorkspaceTabs(payload: { workspaceId: string; recursive?: boolean }): Promise<MessageResponse<WorkspaceTabsData | WorkspaceTabsGroupsData>> {
  if (!payload?.workspaceId) {
    return { success: false, error: '缺少工作组 ID' }
  }
  const res = await getWorkspaceTabs(payload.workspaceId, payload.recursive)
  if (res.ok && res.data) {
    if ('groups' in res.data) {
      return { success: true, data: { groups: res.data.groups } }
    }
    if ('tabs' in res.data) {
      return { success: true, data: { tabs: res.data.tabs } }
    }
  }
  logger.warn('getWorkspaceTabs API failed:', res.error)
  return { success: false, error: res.error || '获取工作组标签页失败', authError: res.status === 401 }
}

/** 已同步标签页页面：跨所有工作组扁平化分页返回（单独聚合接口，无需经由工作组树拍平） */
async function handleGetSyncedTabs(payload: {
  page?: number
  pageSize?: number
  keyword?: string
  includeSystem?: boolean
  scheme?: string
  domain?: string
  exact?: boolean
  tagIds?: number[]
  tagMatch?: TabTagMatch
  sort?: string
  order?: string
}): Promise<MessageResponse<SyncedTabPageData>> {
  const res = await getSyncedTabs({
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 50,
    keyword: payload?.keyword ?? '',
    includeSystem: payload?.includeSystem ?? true,
    scheme: payload?.scheme ?? '',
    domain: payload?.domain ?? '',
    exact: payload?.exact ?? false,
    tagIds: payload?.tagIds,
    tagMatch: payload?.tagMatch,
    sort: payload?.sort ?? '',
    order: payload?.order ?? '',
  })
  if (res.ok && res.data) {
    return { success: true, data: res.data }
  }
  logger.warn('getSyncedTabs API failed:', res.error)
  return { success: false, error: res.error || '获取已同步标签页失败', authError: res.status === 401 }
}

async function handleGetTabHosts(payload?: { scheme?: string; keyword?: string; tagIds?: number[]; tagMatch?: TabTagMatch }): Promise<MessageResponse<TabHostsData>> {
  const res = await getTabHosts({
    scheme: payload?.scheme ?? '',
    keyword: payload?.keyword ?? '',
    tagIds: payload?.tagIds,
    tagMatch: payload?.tagMatch,
  })
  if (res.ok && res.data) {
    return { success: true, data: res.data }
  }
  logger.warn('getTabHosts API failed:', res.error)
  return { success: false, error: res.error || '获取域名分布失败', authError: res.status === 401 }
}

/** 创建工作组（通过后端 API，不含标签页） */
async function handleCreateWorkspace(
  payload: { name: string; color: string; icon?: string; description?: string; parentId?: string; collapsed?: boolean },
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
  payload: { id: string; name?: string; color?: string; icon?: string; description?: string; parentId?: string; collapsed?: boolean; tabs?: Array<{ url: string; title: string; favIconUrl: string; chromeTabId: number }> },
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

/** 移动工作组到参照节点的指定落点（左侧工作组树拖拽，顺序由后端计算） */
async function handleMoveWorkspace(
  payload: { id: string; targetId: string; position: 'before' | 'after' | 'inner' },
): Promise<MessageResponse> {
  if (!payload?.id || !payload?.targetId) {
    return { success: false, error: '缺少工作组 ID 或落点位置' }
  }
  const res = await moveWorkspace(payload.id, payload.targetId, payload.position)
  if (res.ok) {
    logger.info('Workspace moved:', payload.id)
    return { success: true }
  }
  logger.warn('moveWorkspace API failed:', res.error)
  return { success: false, error: res.error || '调整工作组顺序失败', authError: res.status === 401 }
}

/** 删除工作组（通过后端 API） */
async function handleDeleteWorkspace(id: string, defaultWorkspaceId?: string): Promise<MessageResponse> {
  const res = await deleteWorkspace(id, defaultWorkspaceId)
  if (res.ok) {
    logger.info('Workspace deleted:', id)
    return { success: true }
  }
  logger.warn('deleteWorkspace API failed:', res.error)
  return { success: false, error: res.error || '删除工作组失败', authError: res.status === 401 }
}

/** 复制工作组（后端递归复制整棵子树，返回新建的根副本） */
async function handleDuplicateWorkspace(id: string): Promise<MessageResponse> {
  if (!id) {
    return { success: false, error: '缺少工作组 ID' }
  }
  const res = await duplicateWorkspace(id)
  if (res.ok && res.data) {
    logger.info('Workspace duplicated:', id, '->', res.data.workspace.id)
    return { success: true, data: { workspace: res.data.workspace } }
  }
  logger.warn('duplicateWorkspace API failed:', res.error)
  return { success: false, error: res.error || '复制工作组失败', authError: res.status === 401 }
}

/** 将选中的标签页加入现有工作组（去重后合并） */
async function handleAddTabsToWorkspace(
  payload: { workspaceId: string; tabs: Array<{ url: string; title: string; favIconUrl: string; chromeTabId: number }> },
): Promise<MessageResponse> {
  // 1. 只取目标工作组的已有标签页（用于去重），无需拉取全部工作组
  const tabsRes = await getWorkspaceTabs(payload.workspaceId)
  if (!tabsRes.ok || !tabsRes.data) {
    logger.warn('addTabsToWorkspace: getWorkspaceTabs failed:', tabsRes.error)
    return { success: false, error: tabsRes.error || '获取工作组标签页失败', authError: tabsRes.status === 401 }
  }
  const workspaceTabs = 'tabs' in tabsRes.data ? tabsRes.data.tabs : []

  // 2. 获取已有标签页 URL 集合（用于去重）
  const existingUrls = new Set(workspaceTabs.map(t => t.url))

  // 3. 过滤新标签页，只保留不在工作组中的
  const newTabs = payload.tabs.filter(t => !existingUrls.has(t.url))
  if (newTabs.length === 0) {
    // 所有标签页已存在
    return { success: true, data: { added: 0, skipped: payload.tabs.length } }
  }

  // 4. 将已有 TabReference 转为 WorkspaceTabPayload（chromeTabId=0 表示未知，保留 tabId）
  const existingTabPayloads = workspaceTabs.map(t => ({
    tabId: t.tabId,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    chromeTabId: 0,
  }))

  // 5. 合并后调用更新 API
  const allTabs = [...existingTabPayloads, ...newTabs]
  const updateRes = await updateWorkspace(payload.workspaceId, { tabs: allTabs })
  if (updateRes.ok) {
    logger.info(`Added ${newTabs.length} tabs to workspace "${payload.workspaceId}"`)
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

  // 工作组 tab 以后端主键标识，不与本地 chromeTabId 绑定，因此统一按"重新打开"处理
  const opened = await openTabUrls(
    tabsToOpen.map((t) => t.url),
    {
      newWindow,
      asTabGroup,
      groupTitle: workspace.name,
      groupColor: mapHexToTabGroupColor(workspace.color),
    },
  )

  logger.info(`Workspace "${workspace.name}": opened=${opened}${asTabGroup ? ', asTabGroup' : ''}`)
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

/** 复制标签页到目标工作组末尾（源标签页不变） */
async function handleCopyWorkspaceTab(
  payload: { workspaceId: string; tabId: string },
): Promise<MessageResponse> {
  try {
    const res = await copyWorkspaceTab(payload.workspaceId, payload.tabId)
    if (res.ok) {
      logger.info(`Tab copied: ${payload.tabId} → workspace=${payload.workspaceId}`)
      return { success: true }
    }
    logger.warn('copyWorkspaceTab API failed:', res.error)
    return { success: false, error: res.error || '复制标签页失败', authError: res.status === 401 }
  } catch (err) {
    logger.warn('copyWorkspaceTab error:', err)
    return { success: false, error: '复制标签页失败: ' + String(err) }
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
      description: payload.description,
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

/** 从工作组中移除指定标签页（后端 DELETE 会将其统一移入回收站） */
async function handleRemoveWorkspaceTab(workspaceId: string, tabId: string): Promise<MessageResponse> {
  try {
    const res = await deleteWorkspaceTab(workspaceId, tabId)
    if (res.ok) {
      logger.info(`Tab ${tabId} removed from workspace "${workspaceId}"`)
      return { success: true }
    }
    logger.warn('removeWorkspaceTab: deleteWorkspaceTab failed:', res.error)
    return { success: false, error: res.error || '移除标签页失败', authError: res.status === 401 }
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

/** 管理面板概览统计：只需数量，由后端聚合返回，不拉取设备/工作组/标签列表 */
async function handleGetDashboardStats(): Promise<MessageResponse<DashboardStatsData>> {
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (token) {
    const res = await getDashboardStats()
    if (res.ok && res.data) {
      return { success: true, data: res.data }
    }
    logger.warn('getDashboardStats API failed:', res.error)
  }
  // 未登录或后端不可用：与概览页「仅本地数据」状态一致，仅统计当前设备
  return { success: true, data: { devices: 1, workspaces: 0, tags: 0, workspaceTabs: 0 } }
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

async function handleGetRecycleBin(
  payload?: GetRecycleBinMessage['payload'],
): Promise<MessageResponse<RecycleBinData>> {
  const res = await getRecycleBin(payload)
  if (res.ok && res.data) {
    return { success: true, data: res.data }
  }
  return { success: false, error: res.error || '获取回收站失败', authError: res.status === 401 }
}

async function handleRestoreRecycleBinTabs(payload: { ids: number[]; workspaceId?: string }): Promise<MessageResponse> {
  if (!payload?.ids?.length) {
    return { success: false, error: '请选择要恢复的标签页' }
  }
  const res = await restoreRecycleBinTabs(payload.ids, payload.workspaceId)
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

