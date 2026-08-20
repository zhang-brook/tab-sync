import { handleMessage } from './message-handler'
import type { AddTabsToWorkspaceMessage, MessageResponse } from '../shared/types'
import { logger } from '../shared/utils/logger'
import { getOrCreateDeviceId, getDeviceName, getBrowserInfo, getOSInfo } from '../shared/utils/device-fingerprint'
import { registerDevice } from '../shared/api/devices'
import { getWorkspaces } from '../shared/api/workspaces'
import { storage, STORAGE_KEYS } from '../shared/storage'
import {
  lastFocusedWindowId,
  notify,
  openPickerWindow,
  openSettingsPage,
  openSidePanel,
  openWorkspacesPage,
  saveTabsToWorkspaceAndClose,
  saveToDefaultWorkspaceAndClose,
} from './context-menu/actions'
import { NOTIFICATION_SAVE_TAB_SUCCESS, UNGROUPED_WORKSPACE_ID } from './context-menu/constants'
import { createContextMenus } from './context-menu/create'
import './context-menu/onClicked'
import './context-menu/titles'

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

// 默认分组或登录状态变化后重建菜单，使标题中的分组名同步（createContextMenus 幂等）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes[STORAGE_KEYS.DEFAULT_WORKSPACE_ID] || changes[STORAGE_KEYS.AUTH_TOKEN]) {
    void createContextMenus()
  }
})

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
  if (tab) await saveToDefaultWorkspaceAndClose([tab])
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

// 通知点击：保存成功类通知 → 打开管理后台工作组页（ID 前缀判断，SW 重启后依然有效）
chrome.notifications.onClicked.addListener((id) => {
  void chrome.notifications.clear(id)
  if (id.startsWith(NOTIFICATION_SAVE_TAB_SUCCESS + '|')) {
    void openWorkspacesPage()
  }
})

// 浏览器启动时注册设备
chrome.runtime.onStartup.addListener(async () => {
  logger.info('Browser startup')
  // 尝试注册/更新设备
  const deviceId = await getOrCreateDeviceId()
  await tryRegisterDevice(deviceId)
})

/**
 * 分组选择器弹窗的收藏流程（payload 带 closeAfterAdd 标记）：
 * 加入成功后由 background 统一弹桌面通知；closeAfterAdd 为 true 时一并关闭原标签页。
 * 与右键菜单「保存到默认/未分组并关闭」保持同一行为：关闭与通知都不放在弹窗页面上下文里做
 * （弹窗页面里 chrome.tabs.remove 可能静默失败，且桌面通知本应由 background 发出）。
 */
async function savePickerTabsToWorkspace(
  payload: AddTabsToWorkspaceMessage['payload'],
): Promise<MessageResponse> {
  const res = await handleMessage({
    action: 'ADD_TABS_TO_WORKSPACE',
    payload: { workspaceId: payload.workspaceId, tabs: payload.tabs },
  })

  if (res.success) {
    const data = (res.data ?? {}) as { added?: number; skipped?: number }
    const added = data.added ?? payload.tabs.length
    const skipped = data.skipped ?? 0
    const count = payload.tabs.length
    // 「保存并关闭」语义：无论新增还是跳过，统一关闭用户选中的页面，避免混选时行为不一致
    let closed = false
    if (payload.closeAfterAdd) {
      const ids = payload.tabs.map((t) => t.chromeTabId).filter((id) => id > 0)
      if (ids.length > 0) {
        try {
          await chrome.tabs.remove(ids)
          closed = true
        } catch (err) {
          // 标签可能已关闭：记录日志但不影响整体成功结果
          logger.warn('关闭已收藏标签页失败:', err)
        }
      }
    }
    // 读取分组名用于提示文案（失败不影响主流程，回退通用表述）
    let wsLabel = '该分组'
    try {
      const wsRes = await getWorkspaces(true)
      if (wsRes.ok && wsRes.data) {
        const name = wsRes.data.workspaces.find((w) => w.id === payload.workspaceId)?.name
        if (name) wsLabel = `「${name}」`
      }
    } catch {
      /* ignore */
    }
    let title: string
    let detail: string
    if (added === 0 && skipped > 0) {
      // 全部已存在：跳过（页面仍按"保存并关闭"语义关闭）
      title = '已存在'
      detail = `${wsLabel}下已存在该页面，已跳过并关闭`
    } else if (skipped > 0) {
      // 部分已存在：加入新增项并关闭
      title = '已加入工作组'
      detail = closed
        ? `已收藏 ${added} 个标签页（${skipped} 个已存在，已跳过）并关闭，点击查看`
        : `已收藏 ${added} 个标签页（${skipped} 个已存在，已跳过），点击查看`
    } else {
      title = '已加入工作组'
      detail = closed
        ? count > 1
          ? `已收藏 ${count} 个标签页并关闭，点击查看`
          : '当前标签页已收藏并关闭，点击查看'
        : count > 1
          ? `已收藏 ${count} 个标签页，点击查看`
          : '当前标签页已收藏，点击查看'
    }
    await notify(title, detail, NOTIFICATION_SAVE_TAB_SUCCESS)
  }
  return res
}

// 监听来自 popup/sidepanel/dashboard 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  logger.debug('Received message:', message.action)
  // 选择器弹窗的收藏请求（带 closeAfterAdd 标记）单独处理：由 background 负责关闭原标签页与通知
  if (
    message.action === 'ADD_TABS_TO_WORKSPACE' &&
    (message as AddTabsToWorkspaceMessage).payload?.closeAfterAdd !== undefined
  ) {
    savePickerTabsToWorkspace((message as AddTabsToWorkspaceMessage).payload)
      .then(sendResponse)
      .catch((err) => {
        logger.error('Message handler error:', err)
        sendResponse({ success: false, error: String(err) })
      })
    return true
  }
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
