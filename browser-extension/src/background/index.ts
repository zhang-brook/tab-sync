import { handleMessage } from './message-handler'
import { logger } from '../shared/utils/logger'
import { getOrCreateDeviceId, getDeviceName, getBrowserInfo, getOSInfo } from '../shared/utils/device-fingerprint'
import { registerDevice } from '../shared/api/devices'
import { storage, STORAGE_KEYS } from '../shared/storage'
import { sendMessage } from '../shared/composables/useMessage'

logger.info('Service Worker started')

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
  // 初始化右键菜单
  await createContextMenus()
})

// ============ 右键菜单：保存到 Tab Sync 并关闭 ============

/** 「未分组」系统工作组的固定标识（见 server/internal/service/workspace.go） */
const UNGROUPED_WORKSPACE_ID = 'ungrouped'
const MENU_SAVE_UNGROUPED = 'tab-sync-save-ungrouped'
const MENU_SAVE_PICK = 'tab-sync-save-pick'

/** 创建右键菜单项（覆盖式重建，避免重复） */
async function createContextMenus() {
  try {
    await chrome.contextMenus.removeAll()
    const common: chrome.contextMenus.CreateProperties = {
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    }
    chrome.contextMenus.create({
      id: MENU_SAVE_UNGROUPED,
      title: '保存到 Tab Sync 并关闭（未分组）',
      ...common,
    })
    chrome.contextMenus.create({
      id: MENU_SAVE_PICK,
      title: '保存到 Tab Sync 并关闭 → 选择分组…',
      ...common,
    })
    logger.info('右键菜单已创建')
  } catch (err) {
    logger.error('创建右键菜单失败:', err)
  }
}

/** 右键菜单点击分发 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return
  if (info.menuItemId === MENU_SAVE_UNGROUPED) {
    await saveTabToWorkspaceAndClose(tab, UNGROUPED_WORKSPACE_ID)
  } else if (info.menuItemId === MENU_SAVE_PICK) {
    await openPickerWindow(tab)
  }
})

/** 在居中弹窗中打开分组选择器，选中后再加入并关闭当前页 */
async function openPickerWindow(tab: chrome.tabs.Tab) {
  if (!tab.id) return
  const url = chrome.runtime.getURL('src/picker/index.html') + '?tabId=' + tab.id
  const width = 480
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
 * 将单个标签页加入指定工作组并关闭：
 * 仅当加入成功后才关闭当前页；失败（含未登录）则保留页面并通知。
 */
async function saveTabToWorkspaceAndClose(tab: chrome.tabs.Tab, workspaceId: string) {
  if (!tab.id || !tab.url) return

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

  const res = await sendMessage({
    action: 'ADD_TABS_TO_WORKSPACE',
    payload: {
      workspaceId,
      tabs: [
        {
          chromeTabId: tab.id ?? 0,
          url: tab.url ?? '',
          title: tab.title ?? '',
          favIconUrl: tab.favIconUrl ?? '',
        },
      ],
    },
  })

  if (res.success) {
    await chrome.tabs.remove(tab.id)
    await notify('已加入工作组', '当前标签页已收藏并关闭')
  } else if (res.authError) {
    await notify('收藏失败', '未登录或连接已失效，请先在侧边栏登录')
  } else {
    await notify('收藏失败', res.error || '请检查后端连接')
  }
}

// 快捷键：将当前标签页加入工作组并关闭
chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-and-close') {
    // 用户可在设置中关闭该快捷键
    storage.get(STORAGE_KEYS.SHORTCUT_ENABLED).then((enabled) => {
      if (!enabled) return
      void handleSaveAndClose()
    })
  }
})

/**
 * 处理「加入并关闭」快捷键：
 * 1. 取当前激活标签页；2. 校验协议；3. 若已设置默认工作组则收藏并关闭，否则打开侧边栏兜底。
 */
async function handleSaveAndClose() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
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

  const wsId = await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)
  if (!wsId) {
    // 兜底：打开侧边栏引导用户设置默认工作组
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId })
    } catch {
      /* ignore */
    }
    await notify('未设置默认收藏工作组', '请在设置中选择默认工作组后再使用快捷键')
    return
  }

  const res = await sendMessage({
    action: 'ADD_TABS_TO_WORKSPACE',
    payload: { workspaceId: wsId, tabs: [{ chromeTabId: tab.id ?? 0, url: tab.url ?? '', title: tab.title ?? '', favIconUrl: tab.favIconUrl ?? '' }] },
  })
  if (res.success) {
    await chrome.tabs.remove(tab.id!)
    await notify('已加入工作组', '当前标签页已收藏并关闭')
  } else {
    await notify('收藏失败', res.error || '请检查后端连接')
  }
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
