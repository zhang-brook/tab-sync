import { handleMessage } from './message-handler'
import { logger } from '../shared/utils/logger'
import { openTabAfterActive } from '../shared/utils/tab-utils'
import { DASHBOARD_URL, PICKER_URL } from '../shared/utils/pages'
import { getOrCreateDeviceId, getDeviceName, getBrowserInfo, getOSInfo } from '../shared/utils/device-fingerprint'
import { registerDevice } from '../shared/api/devices'
import { storage, STORAGE_KEYS } from '../shared/storage'

logger.info('Service Worker started')

/**
 * 初始化右键菜单
 *
 * 每次 Service Worker 启动都重建右键菜单（createContextMenus 内部先 removeAll，幂等）：
 * onInstalled 只在安装/更新时触发一次，reload 扩展时若 dev server 尚未就绪，
 * worker 加载失败会跳过菜单创建且无法恢复，因此在顶层兜底重建
 */
void createContextMenus() // 对表达式求值，但把结果丢弃，返回 undefined

// 点击工具栏图标时打开侧边栏（已移除 popup，故 onClicked 会触发）
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId })
    } catch (err) {
      logger.error('打开侧边栏失败:', err)
    }
  }
})

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info('Extension installed/updated:', details.reason)
  const deviceId = await getOrCreateDeviceId()
  const deviceName = await getDeviceName()
  logger.info('Device ID:', deviceId, 'Name:', deviceName)
  // 尝试向后端注册设备（后端未部署时静默失败）
  await tryRegisterDevice(deviceId)
})

// ============ 右键菜单：保存到 Tab Sync 并关闭 ============

/** 「未分组」系统工作组的固定标识（见 server/internal/service/workspace.go） */
const UNGROUPED_WORKSPACE_ID = 'ungrouped'
// 页面右键菜单
const MENU_SAVE_DEFAULT = 'tab-sync-save-default'
const MENU_SAVE_UNGROUPED = 'tab-sync-save-ungrouped'
const MENU_SAVE_PICK = 'tab-sync-save-pick'
// 标签页右键菜单（标签页菜单的 contexts 与页面不同，需独立菜单项）
const MENU_TAB_SAVE_DEFAULT = 'tab-sync-tab-save-default'
const MENU_TAB_SAVE_UNGROUPED = 'tab-sync-tab-save-ungrouped'
const MENU_TAB_SAVE_PICK = 'tab-sync-tab-save-pick'
// 打开侧栏/设置页：工具栏图标右键（action）+ 页面/标签页右键。contextMenus id 全局唯一，
// 同一动作在每个上下文需独立 id（追加上下文后缀），点击时按前缀分发
const MENU_OPEN_SIDEPANEL = 'tab-sync-open-sidepanel'
const MENU_OPEN_SETTINGS = 'tab-sync-open-settings'
// 更多选项子菜单（父项带子菜单，子项以 parentId 挂在父项下）
const MENU_MORE = 'tab-sync-more'
const MENU_MORE_SHORTCUTS = 'tab-sync-more-shortcuts'
const MENU_MORE_RELOAD = 'tab-sync-more-reload'

/** 创建右键菜单项（覆盖式重建，避免重复） */
async function createContextMenus() {
  try {
    await chrome.contextMenus.removeAll()
    // 页面右键：仅 http(s) 页面显示
    const page: chrome.contextMenus.CreateProperties = {
      contexts: ['page'],
      documentUrlPatterns: [
        'http://*/*',
        'https://*/*',
        'file://*/*',
        'chrome://*/*',
        'chrome-extension://*/*',
      ],
    }
    chrome.contextMenus.create({
      id: MENU_SAVE_DEFAULT,
      title: '保存到 默认分组并关闭（Shift+Alt+S）',
      ...page,
    })
    chrome.contextMenus.create({
      id: MENU_SAVE_UNGROUPED,
      // 标题末尾提示快捷键：Chrome 菜单项不支持内联快捷键，实际由 manifest commands 触发
      title: '保存到 [未分组] 并关闭（Alt+Shift+U）',
      ...page,
    })
    chrome.contextMenus.create({
      id: MENU_SAVE_PICK,
      title: '保存到 选定分组…（Alt+Shift+G）',
      ...page,
    })
    // 标签页右键
    const tab: chrome.contextMenus.CreateProperties = { contexts: ['tab'] }
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_DEFAULT,
      title: '保存标签页到 默认分组并关闭（Shift+Alt+S）',
      ...tab,
    })
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_UNGROUPED,
      title: '保存标签页到 [未分组] 并关闭（Alt+Shift+U）',
      ...tab,
    })
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_PICK,
      title: '保存标签页到 选定分组…（Alt+Shift+G）',
      ...tab,
    })

    // 分隔线：与上方收藏操作区分开（仅页面/标签页右键需要；图标右键无收藏项，不显示）。
    // 按上下文各建一条：Chrome 对同一个 separator 挂多个 contexts 时，tab 上下文可能不渲染
    chrome.contextMenus.create({
      id: 'tab-sync-sep-open-page',
      type: 'separator',
      contexts: ['page'],
    })
    // 2026.08.14 备注：浏览器Tab标签页标题右键菜单 不支持添加分隔符，以下这行代码实际不起作用
    /*
    chrome.contextMenus.create({
      id: 'tab-sync-sep-open-tab',
      type: 'separator',
      contexts: ['tab'],
    })
    */

    // 打开侧栏/设置页：在工具栏图标（action）及页面/标签页右键中均提供。
    // 注意：Chrome contextMenus 不支持 tab_groups 上下文（Firefox 才有），无法创建标签组右键菜单
    const openMenuContexts: chrome.contextMenus.ContextType[] = [
      // chrome.contextMenus.ContextType.ACTION, // 右上角扩展图标
      chrome.contextMenus.ContextType.PAGE,   // 页面
      chrome.contextMenus.ContextType.TAB,    // 标签页标题
    ]
    for (const ctx of openMenuContexts) {
      chrome.contextMenus.create({
        id: `${MENU_OPEN_SIDEPANEL}-${ctx}`,
        title: '打开侧栏',
        contexts: [ctx],
      })
      chrome.contextMenus.create({
        id: `${MENU_OPEN_SETTINGS}-${ctx}`,
        title: '打开设置页',
        contexts: [ctx],
      })
    }
    // 更多选项：父项带子菜单（页面/标签页右键末尾）
    chrome.contextMenus.create({
      id: MENU_MORE,
      title: '更多选项',
      contexts: ['page', 'tab'],
    })
    chrome.contextMenus.create({
      id: MENU_MORE_SHORTCUTS,
      parentId: MENU_MORE,
      title: '设置快捷键…',
    })
    chrome.contextMenus.create({
      id: MENU_MORE_RELOAD,
      parentId: MENU_MORE,
      title: '重启扩展',
    })
    logger.info('右键菜单已创建')
  } catch (err) {
    logger.error('创建右键菜单失败:', err)
  }
}

/** 右键菜单点击分发 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = info.menuItemId
  // 打开侧栏/设置页按前缀分发（三个上下文各一个 id）；action 上下文点击时没有关联 tab，需在 tab 判空之前处理
  if (String(id).startsWith(MENU_OPEN_SIDEPANEL + '-')) {
    // sidePanel.open 必须在用户手势内同步调用，await 异步 API 后手势会失效：
    // 页面/标签页上下文直接用 tab.windowId，action 上下文无 tab，用 onFocusChanged 缓存的最近聚焦窗口
    if (tab?.windowId != null) {
      openSidePanel(tab.windowId)
    } else if (lastFocusedWindowId != null) {
      openSidePanel(lastFocusedWindowId)
    }
    return
  }
  if (String(id).startsWith(MENU_OPEN_SETTINGS + '-')) {
    await openSettingsPage()
    return
  }
  if (id === MENU_MORE_SHORTCUTS) {
    // 快捷键配置页：在激活标签页之后打开
    await openTabAfterActive('chrome://extensions/shortcuts')
    return
  }
  if (id === MENU_MORE_RELOAD) {
    // 重启扩展：Service Worker 重载后顶层 createContextMenus 会自动重建菜单
    chrome.runtime.reload()
    return
  }
  if (!tab) return
  if (id === MENU_SAVE_DEFAULT || id === MENU_TAB_SAVE_DEFAULT) {
    await saveToDefaultWorkspaceAndClose(tab)
  } else if (id === MENU_SAVE_UNGROUPED || id === MENU_TAB_SAVE_UNGROUPED) {
    await saveTabsToWorkspaceAndClose([tab], UNGROUPED_WORKSPACE_ID)
  } else if (id === MENU_SAVE_PICK || id === MENU_TAB_SAVE_PICK) {
    await openPickerWindow([tab])
  }
})

// sidePanel.open 要求用户手势内同步调用，action 上下文菜单无 tab 可用，
// 故缓存最近聚焦窗口的 ID 供其使用（启动时预热一次）
let lastFocusedWindowId: number | undefined
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    lastFocusedWindowId = windowId
  }
})
void chrome.windows.getLastFocused().then((win) => {
  if (win.id != null) lastFocusedWindowId = win.id
})

/** 同步打开侧边栏（不 await 以保留用户手势；失败仅记日志） */
function openSidePanel(windowId: number) {
  chrome.sidePanel.open({ windowId }).catch((err) => logger.error('打开侧边栏失败:', err))
}

/** 打开 Dashboard 设置页（已打开则激活并切换到设置路由，否则新建标签页） */
async function openSettingsPage() {
  const baseUrl = DASHBOARD_URL
  const settingsUrl = baseUrl + '#/settings'
  // match pattern 不匹配 URL fragment，带 hash 的现有 Dashboard 标签页也能查到
  const tabs = await chrome.tabs.query({ url: baseUrl + '*' })
  if (tabs.length > 0 && tabs[0].id != null) {
    await chrome.tabs.update(tabs[0].id, { active: true, url: settingsUrl })
    if (tabs[0].windowId != null) {
      await chrome.windows.update(tabs[0].windowId, { focused: true })
    }
  } else {
    // 在当前窗口的激活标签页之后打开（而非追加到末尾）
    await openTabAfterActive(settingsUrl)
  }
}

/** 在居中弹窗中打开分组选择器，选中后再加入并关闭原标签页（支持标签组批量） */
async function openPickerWindow(tabs: chrome.tabs.Tab[]) {
  const ids = tabs.map((t) => t.id).filter((id): id is number => id != null)
  if (ids.length === 0) return
  const url = PICKER_URL + '?tabIds=' + ids.join(',')
  const width = 560
  const height = 600
  try {
    const win = await chrome.windows.getLastFocused()
    const left = Math.max(0, Math.round((win.left ?? 0) + ((win.width ?? width) - width) / 2))
    const top = Math.max(0, Math.round((win.top ?? 0) + ((win.height ?? height) - height) / 2))
    await chrome.windows.create({ url, type: 'popup', focused: true, width, height, left, top })
  } catch {
    // 兜底：不指定位置
    await chrome.windows.create({ url, type: 'popup', focused: true, width, height })
  }
}

/**
 * 将标签页（支持批量，如标签组）加入指定工作组并关闭：
 * 仅当加入成功后才关闭页面；失败（含未登录）则保留页面并通知。
 * 非 http(s)/file 页面会被跳过，不影响其余标签页收藏。
 */
async function saveTabsToWorkspaceAndClose(tabs: chrome.tabs.Tab[], workspaceId: string) {
  // 仅允许 http(s)/file 页面，浏览器内置页面不支持（组内混有此类页面时跳过）
  const savable = tabs.filter((tab) => {
    if (!tab.url) return false
    try {
      return ['http:', 'https:', 'file:'].includes(new URL(tab.url).protocol)
    } catch {
      return false
    }
  })
  if (savable.length === 0) {
    await notify('无法收藏', '当前页面类型不支持收藏（如浏览器内置页面）')
    return
  }

  // 注意：这里是 background 自身发起操作，不能走 runtime.sendMessage（消息不会投递给自己，
  // 会报 "Could not establish connection. Receiving end does not exist."），需直接调用消息处理器
  const res = await handleMessage({
    action: 'ADD_TABS_TO_WORKSPACE',
    payload: {
      workspaceId,
      tabs: savable.map((tab) => ({
        chromeTabId: tab.id ?? 0,
        url: tab.url ?? '',
        title: tab.title ?? '',
        favIconUrl: tab.favIconUrl ?? '',
      })),
    },
  })

  if (res.success) {
    const ids = savable.map((t) => t.id).filter((id): id is number => id != null)
    if (ids.length > 0) {
      await chrome.tabs.remove(ids)
    }
    await notify('已加入工作组', savable.length > 1 ? `已收藏 ${savable.length} 个标签页并关闭` : '当前标签页已收藏并关闭')
  } else if (res.authError) {
    await notify('收藏失败', '未登录或连接已失效，请先在侧边栏登录')
  } else {
    await notify('收藏失败', res.error || '请检查后端连接')
  }
}

// 快捷键分发。commands.onCommand 回调属于用户手势，打开侧栏需在此同步调用（await 后手势会失效）
chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-and-close') {
    // 用户可在设置中关闭该快捷键
    storage.get(STORAGE_KEYS.SHORTCUT_ENABLED).then((enabled) => {
      if (!enabled) return
      void handleSaveAndClose()
    })
  } else if (command === 'open-sidepanel') {
    if (lastFocusedWindowId != null) {
      openSidePanel(lastFocusedWindowId)
    }
  } else if (command === 'open-settings') {
    void openSettingsPage()
  } else if (command === 'save-ungrouped') {
    void handleSaveUngrouped()
  } else if (command === 'save-pick') {
    void handleSavePick()
  }
})

/**
 * 处理「加入并关闭」快捷键：取当前激活标签页后走 saveToDefaultWorkspaceAndClose。
 */
async function handleSaveAndClose() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab) await saveToDefaultWorkspaceAndClose(tab)
}

/**
 * 将标签页保存到默认收藏工作组并关闭（右键菜单与快捷键共用）：
 * 1. 校验协议；2. 默认工作组初始为「未分组」，空值（历史数据）回退到「未分组」；3. 收藏并关闭。
 */
async function saveToDefaultWorkspaceAndClose(tab: chrome.tabs.Tab) {
  if (!tab?.url) return

  // 仅允许 http(s)/file 页面，浏览器内置页面不支持
  let protocol = ''
  try {
    protocol = new URL(tab.url).protocol
  } catch {
    return
  }
  if (!['http:', 'https:', 'file:'].includes(protocol)) {
    await notify('无法收藏该页面', '当前页面类型不支持收藏（如浏览器内置页面）')
    return
  }

  const wsId = (await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)) || UNGROUPED_WORKSPACE_ID

  // background 自身调用，直接走消息处理器（runtime.sendMessage 不会投递给自己）
  await saveTabsToWorkspaceAndClose([tab], wsId)
}

/** 快捷键：将当前激活标签页保存到 [未分组] 并关闭（Alt+Shift+U） */
async function handleSaveUngrouped() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return
  // 协议校验与失败通知由 saveTabsToWorkspaceAndClose 内部处理
  await saveTabsToWorkspaceAndClose([tab], UNGROUPED_WORKSPACE_ID)
}

/** 快捷键：打开分组选择器，将当前激活标签页保存到选定分组（Alt+Shift+G） */
async function handleSavePick() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return
  await openPickerWindow([tab])
}

/** 轻量桌面通知 */
async function notify(title: string, message: string) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'public/icons/icon-48.png',
      title,
      message,
    })
  } catch {
    /* ignore */
  }
}

// 浏览器启动时注册设备
chrome.runtime.onStartup.addListener(async () => {
  logger.info('Browser startup')
  // 尝试注册/更新设备
  const deviceId = await getOrCreateDeviceId()
  await tryRegisterDevice(deviceId)
})

// 监听来自 popup/sidepanel/dashboard 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  logger.debug('Received message:', message.action)
  // handleMessage 是异步的，需要返回 true 保持消息通道
  // 必须添加 .catch 确保 sendResponse 始终被调用，否则前端收到 undefined
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      logger.error('Message handler error:', err)
      sendResponse({ success: false, error: String(err) })
    })
  return true
})

/**
 * 尝试向后端注册当前设备
 * 后端未部署时静默失败，不影响扩展正常使用
 */
async function tryRegisterDevice(deviceId: string) {
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) return // 未登录，跳过

  const name = (await storage.get(STORAGE_KEYS.DEVICE_NAME)) || 'Unknown'
  const browser = getBrowserInfo()
  const os = getOSInfo()

  const res = await registerDevice({ deviceId, name, browser, os })
  if (res.ok) {
    logger.info('Device registered/updated on server')
  } else {
    logger.debug('Device registration skipped (server unavailable):', res.error)
  }
}
