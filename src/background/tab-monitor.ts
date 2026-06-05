import { createKeyedDebounce } from '../shared/utils/debounce'
import { generateUUID, nowISO } from '../shared/utils/tab-utils'
import { getOrCreateDeviceId } from '../shared/utils/device-fingerprint'
import { logger } from '../shared/utils/logger'
import { TAB_EVENT_DEBOUNCE_MS } from '../shared/constants'
import type { TabRecord, TabEvent, TabEventType } from '../shared/types'

// ============ 工作组恢复预注册机制 ============

/**
 * 预注册表：URL → 已有 TabRecord UUID 队列
 * 当工作组恢复打开标签页时，先在此注册 URL → UUID 映射，
 * 使 handleTabCreated 能识别这是"恢复打开"并复用已有 TabRecord。
 * 使用队列（数组）以支持同一 URL 在工作组中出现多次的情况。
 */
const pendingReopens = new Map<string, string[]>()

/**
 * 注册一个即将通过 chrome.tabs.create() 恢复打开的标签页。
 * 必须在调用 chrome.tabs.create() 之前调用。
 * @param url 标签页 URL
 * @param existingUUID 已有的 TabRecord.id，用于复用
 */
export function registerPendingReopen(url: string, existingUUID: string) {
  const list = pendingReopens.get(url) || []
  list.push(existingUUID)
  pendingReopens.set(url, list)
  logger.debug('Registered pending reopen:', url, '→', existingUUID)

  // 安全兜底：5 秒后清除未匹配的条目，防止内存泄漏
  setTimeout(() => {
    const current = pendingReopens.get(url)
    if (current) {
      const idx = current.indexOf(existingUUID)
      if (idx !== -1) {
        current.splice(idx, 1)
        if (current.length === 0) pendingReopens.delete(url)
        logger.debug('Cleaned up stale pending reopen:', url, '→', existingUUID)
      }
    }
  }, 5000)
}

/**
 * 初始化标签页监控
 * - 注册 Chrome 标签页事件监听
 */
export function initTabMonitor() {
  chrome.tabs.onCreated.addListener(handleTabCreated)
  chrome.tabs.onRemoved.addListener(handleTabRemoved)
  chrome.tabs.onActivated.addListener(handleTabActivated)
  chrome.tabs.onUpdated.addListener(handleTabUpdated)

  logger.info('Tab monitor initialized')
}

// ============ 事件处理 ============

/** 新标签页创建 */
async function handleTabCreated(tab: chrome.tabs.Tab) {
  if (tab.id == null) return

  const deviceId = await getOrCreateDeviceId()
  const now = nowISO()

  // 检查是否为工作组恢复打开（预注册匹配）
  const tabUrl = tab.pendingUrl || tab.url || ''
  const pendingList = pendingReopens.get(tabUrl)

  if (pendingList && pendingList.length > 0) {
    const existingUUID = pendingList.shift()!
    if (pendingList.length === 0) pendingReopens.delete(tabUrl)

    // 复用已有 UUID，更新 session 映射
    const { tab_id_mappings } = await chrome.storage.session.get('tab_id_mappings')
    const mappings: Record<string, string> = (tab_id_mappings as Record<string, string>) || {}
    mappings[String(tab.id)] = existingUUID
    await chrome.storage.session.set({ tab_id_mappings: mappings })

    // 构造 record 用于事件
    const record: TabRecord = {
      id: existingUUID,
      chromeTabId: tab.id,
      windowId: tab.windowId ?? 0,
      url: tab.url || '',
      title: tab.title || '',
      favIconUrl: tab.favIconUrl || '',
      status: 'open',
      openedAt: now,
      lastAccessedAt: now,
      deviceId,
      workspaceIds: [],
    }

    await pushEvent('created', record, deviceId)
    logger.debug('Tab reopened (reused record):', tab.id, '→', existingUUID, tabUrl)
    return
  }

  // 正常的新标签页创建
  const uuid = generateUUID()

  // 更新 session 映射
  const { tab_id_mappings: currentMappings } = await chrome.storage.session.get('tab_id_mappings')
  const mappings: Record<string, string> = (currentMappings as Record<string, string>) || {}
  mappings[String(tab.id)] = uuid
  await chrome.storage.session.set({ tab_id_mappings: mappings })

  const record: TabRecord = {
    id: uuid,
    chromeTabId: tab.id,
    windowId: tab.windowId ?? 0,
    url: tab.url || '',
    title: tab.title || '',
    favIconUrl: tab.favIconUrl || '',
    status: 'open',
    openedAt: now,
    lastAccessedAt: now,
    deviceId,
    workspaceIds: [],
  }

  await pushEvent('created', record, deviceId)
  logger.debug('Tab created:', tab.id, tab.url)
}

/** 标签页关闭 */
async function handleTabRemoved(tabId: number) {
  const { tab_id_mappings } = await chrome.storage.session.get('tab_id_mappings')
  const mappings: Record<string, string> = (tab_id_mappings as Record<string, string>) || {}
  const uuid = mappings[String(tabId)]
  if (!uuid) return

  const deviceId = await getOrCreateDeviceId()

  // 从 session 映射中移除
  delete mappings[String(tabId)]
  await chrome.storage.session.set({ tab_id_mappings: mappings })

  const record: TabRecord = {
    id: uuid,
    chromeTabId: tabId,
    windowId: 0,
    url: '',
    title: '',
    favIconUrl: '',
    status: 'closed',
    openedAt: '',
    lastAccessedAt: nowISO(),
    closedAt: nowISO(),
    deviceId,
    workspaceIds: [],
  }

  await pushEvent('removed', record, deviceId)
  logger.debug('Tab removed:', tabId, uuid)
}

/** 标签页激活（切换到某标签页） */
async function handleTabActivated(activeInfo: chrome.tabs.OnActivatedInfo) {
  const { tab_id_mappings } = await chrome.storage.session.get('tab_id_mappings')
  const mappings: Record<string, string> = (tab_id_mappings as Record<string, string>) || {}
  const uuid = mappings[String(activeInfo.tabId)]
  if (!uuid) return

  const deviceId = await getOrCreateDeviceId()

  const record: TabRecord = {
    id: uuid,
    chromeTabId: activeInfo.tabId,
    windowId: activeInfo.windowId,
    url: '',
    title: '',
    favIconUrl: '',
    status: 'open',
    openedAt: '',
    lastAccessedAt: nowISO(),
    deviceId,
    workspaceIds: [],
  }

  await pushEvent('activated', record, deviceId)
}

/**
 * 标签页更新（URL/标题/状态变化）
 * 使用防抖：页面加载时会触发多次 onUpdated，只关心最终状态
 */
const debouncedUpdate = createKeyedDebounce<{ tabId: number; tab: chrome.tabs.Tab }>(
  async (_key, { tabId, tab }) => {
    const { tab_id_mappings } = await chrome.storage.session.get('tab_id_mappings')
    const mappings: Record<string, string> = (tab_id_mappings as Record<string, string>) || {}
    const uuid = mappings[String(tabId)]
    if (!uuid) return

    const deviceId = await getOrCreateDeviceId()

    const record: TabRecord = {
      id: uuid,
      chromeTabId: tabId,
      windowId: tab.windowId ?? 0,
      url: tab.url || '',
      title: tab.title || '',
      favIconUrl: tab.favIconUrl || '',
      status: 'open',
      openedAt: '',
      lastAccessedAt: nowISO(),
      deviceId,
      workspaceIds: [],
    }

    await pushEvent('updated', record, deviceId)
    logger.debug('Tab updated:', tabId, record.url)
  },
  TAB_EVENT_DEBOUNCE_MS,
)

function handleTabUpdated(tabId: number, _changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) {
  debouncedUpdate(String(tabId), { tabId, tab })
}

// ============ 事件队列 ============

/** 将事件推入待同步队列（存入 session storage） */
async function pushEvent(type: TabEventType, tabRecord: TabRecord, deviceId: string) {
  const event: TabEvent = {
    id: generateUUID(),
    type,
    tabRecord,
    timestamp: nowISO(),
    deviceId,
  }

  const result = await chrome.storage.session.get('pending_events')
  const pendingEvents: TabEvent[] = (result['pending_events'] as TabEvent[]) || []
  pendingEvents.push(event)
  await chrome.storage.session.set({ pending_events: pendingEvents })
}
