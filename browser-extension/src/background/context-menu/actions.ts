import { DEFAULT_WORKSPACE_COLOR } from '../../shared/constants/theme'
import { getWorkspaces } from '../../shared/api/workspaces'
import { storage, STORAGE_KEYS } from '../../shared/storage'
import { logger } from '../../shared/utils/logger'
import { DASHBOARD_URL, PICKER_URL } from '../../shared/utils/pages'
import { openTabAfterActive } from '../../shared/utils/tab-utils'
import { handleMessage } from '../message-handler'
import { NOTIFICATION_SAVE_TAB_SUCCESS, TAB_GROUP_COLOR_HEX, UNGROUPED_WORKSPACE_ID } from './constants'

/**
 * 解析标签页标题右键菜单实际操作的标签集合：
 * 被右键的标签页属于当前窗口高亮多选（Ctrl+点击选中多个标签页）时，返回全部高亮标签页；
 * 否则（普通右键或右键未选中的标签页）仅返回该标签页。
 * 页面（page）上下文右键不适用此逻辑，调用方仅对 tab 上下文菜单调用。
 */
export async function resolveTabSelection(tab: chrome.tabs.Tab): Promise<chrome.tabs.Tab[]> {
  if (tab.windowId == null) return [tab]
  const highlighted = await chrome.tabs.query({ highlighted: true, windowId: tab.windowId })
  if (highlighted.length > 1 && highlighted.some((t) => t.id === tab.id)) {
    return highlighted
  }
  return [tab]
}

// sidePanel.open 要求用户手势内同步调用，action 上下文菜单无 tab 可用，
// 故缓存最近聚焦窗口的 ID 供其使用（启动时预热一次）
export let lastFocusedWindowId: number | undefined
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    lastFocusedWindowId = windowId
  }
})
void chrome.windows.getLastFocused().then((win) => {
  if (win.id != null) lastFocusedWindowId = win.id
})

/** 同步打开侧边栏（不 await 以保留用户手势；失败仅记日志） */
export function openSidePanel(windowId: number) {
  chrome.sidePanel.open({ windowId }).catch((err) => logger.error('打开侧边栏失败:', err))
}

/** 打开 Dashboard 设置页（已打开则激活并切换到设置路由，否则新建标签页） */
export async function openSettingsPage() {
  openPage('#/settings')
}

/** 打开 Dashboard 工作组页（已打开则激活并切换到工作组路由，否则新建标签页） */
export async function openWorkspacesPage() {
  openPage('#/workspaces')
}

/** 打开页（已打开则激活并切换到指定页的路由，否则新建标签页） */
async function openPage(page: string) {
  const baseUrl = DASHBOARD_URL
  const pageUrl = baseUrl + page
  // match pattern 不匹配 URL fragment，带 hash 的现有 Dashboard 标签页也能查到
  const tabs = await chrome.tabs.query({ url: baseUrl + '*' })
  if (tabs.length > 0 && tabs[0].id != null) {
    await chrome.tabs.update(tabs[0].id, { active: true, url: pageUrl })
    if (tabs[0].windowId != null) {
      await chrome.windows.update(tabs[0].windowId, { focused: true })
    }
  } else {
    // 在当前窗口的激活标签页之后打开（而非追加到末尾）
    await openTabAfterActive(pageUrl)
  }
}

/**
 * 在居中弹窗中打开分组选择器：
 * - 默认（不传 options）为「选择已有分组」模式；
 * - options.mode === 'create' 时为「新建工作组并保存」模式，可传 defaultName/color 作为弹窗默认值。
 */
export async function openPickerWindow(
  tabs: chrome.tabs.Tab[],
  options?: { mode?: 'create'; defaultName?: string; color?: string },
) {
  const ids = tabs.map((t) => t.id).filter((id): id is number => id != null)
  if (ids.length === 0) return
  const params = new URLSearchParams({ tabIds: ids.join(',') })
  if (options?.mode === 'create') {
    params.set('mode', 'create')
    if (options.defaultName) params.set('defaultName', options.defaultName)
    if (options.color) params.set('color', options.color)
  }
  const url = PICKER_URL + '?' + params.toString()
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
export async function saveTabsToWorkspaceAndClose(tabs: chrome.tabs.Tab[], workspaceId: string) {
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
    const data = (res.data ?? {}) as { added?: number; skipped?: number }
    const added = data.added ?? savable.length
    const skipped = data.skipped ?? 0
    // 「保存并关闭」语义：无论新增还是跳过，统一关闭用户选中的可收藏页面，避免混选时行为不一致
    const ids = savable.map((t) => t.id).filter((id): id is number => id != null)
    if (ids.length > 0) {
      await chrome.tabs.remove(ids)
    }
    // 读取分组名用于提示文案（失败不影响主流程，回退通用表述）
    let wsLabel = '该分组'
    try {
      const wsRes = await getWorkspaces(true)
      if (wsRes.ok && wsRes.data) {
        const name = wsRes.data.workspaces.find((w) => w.id === workspaceId)?.name
        if (name) wsLabel = `「${name}」`
      }
    } catch {
      /* ignore */
    }
    let title: string
    let message: string
    if (added === 0 && skipped > 0) {
      // 全部已存在：跳过（页面仍按"保存并关闭"语义关闭）
      title = '已存在'
      message = `${wsLabel}下已存在该页面，已跳过并关闭`
    } else if (skipped > 0) {
      // 部分已存在：加入新增项并关闭
      title = '已加入工作组'
      message =
        savable.length > 1
          ? `已收藏 ${added} 个标签页（${skipped} 个已存在，已跳过），已全部关闭，点击查看`
          : `已收藏（${wsLabel}下已存在该页面，已跳过），已关闭，点击查看`
    } else {
      title = '已加入工作组'
      message =
        savable.length > 1 ? `已收藏 ${savable.length} 个标签页并关闭，点击查看` : '当前标签页已收藏并关闭，点击查看'
    }
    await notify(title, message, NOTIFICATION_SAVE_TAB_SUCCESS)
  } else if (res.authError) {
    await notify('收藏失败', '未登录或连接已失效，请先在侧边栏登录')
  } else {
    await notify('收藏失败', res.error || '请检查后端连接')
  }
}

/** 是否为可收藏的页面协议（http/https/file），浏览器内置页面不支持 */
function isSavableTab(tab: { url?: string }): boolean {
  if (!tab.url) return false
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(tab.url).protocol)
  } catch {
    return false
  }
}

/**
 * 组保存菜单点击：解析选中集合，全部处于同一标签组时打开「新建工作组并保存」命名弹窗，
 * 默认名称取标签组标题、颜色取标签组颜色，保存对象为组内全部可收藏标签页（由弹窗统一创建并保存）。
 */
export async function handleSaveGroupClick(tab: chrome.tabs.Tab) {
  const selection = await resolveTabSelection(tab)
  if (selection.length === 0) return
  const first = selection[0]
  const sameGroup = first.groupId > 0 && selection.every((t) => t.groupId === first.groupId)
  if (!sameGroup) return

  const groupTabs = (await chrome.tabs.query({ groupId: first.groupId })).filter(isSavableTab)
  if (groupTabs.length === 0) {
    await notify('无法收藏', '标签组中的页面均不支持收藏（如浏览器内置页面）')
    return
  }
  // 组标题/颜色：优先取标签组自身属性，缺失时回退默认
  let groupName = '标签组'
  let groupColor = DEFAULT_WORKSPACE_COLOR
  try {
    const group = await chrome.tabGroups.get(first.groupId)
    if (group.title) groupName = group.title
    if (group.color) groupColor = TAB_GROUP_COLOR_HEX[group.color] ?? DEFAULT_WORKSPACE_COLOR
  } catch {
    // 标签组可能已解散，使用回退值
  }
  await openPickerWindow(groupTabs, { mode: 'create', defaultName: groupName, color: groupColor })
}

/**
 * 将标签页（支持多选批量）保存到默认收藏工作组并关闭（右键菜单与快捷键共用）：
 * 1. 默认工作组初始为「未分组」，空值（历史数据）回退到「未分组」；
 * 2. 协议校验（非 http(s)/file 跳过）、失败通知与关闭由 saveTabsToWorkspaceAndClose 内部处理。
 */
export async function saveToDefaultWorkspaceAndClose(tabs: chrome.tabs.Tab[]) {
  if (tabs.length === 0) return
  const wsId = (await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)) || UNGROUPED_WORKSPACE_ID
  await saveTabsToWorkspaceAndClose(tabs, wsId)
}

/**
 * 轻量桌面通知。idPrefix 非空时用于标记通知类型：
 * 通知 ID 以「{idPrefix}|{时间戳}」命名，点击行为在 notifications.onClicked 中按前缀分发。
 */
export async function notify(title: string, message: string, idPrefix?: string) {
  const options = {
    type: 'basic' as const,
    iconUrl: 'public/icons/icon-48.png',
    title,
    message,
  }
  try {
    if (idPrefix) {
      // 指定 ID（带时间戳避免覆盖同类型通知），供 onClicked 按前缀识别点击行为
      await chrome.notifications.create(`${idPrefix}|${Date.now()}`, options)
    } else {
      await chrome.notifications.create(options)
    }
  } catch {
    /* ignore */
  }
}
