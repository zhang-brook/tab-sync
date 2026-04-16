import { storage, STORAGE_KEYS } from '../shared/storage'
import { createKeyedDebounce } from '../shared/utils/debounce'
import { generateUUID, nowISO } from '../shared/utils/tab-utils'
import { getOrCreateDeviceId } from '../shared/utils/device-fingerprint'
import { logger } from '../shared/utils/logger'
import { TAB_EVENT_DEBOUNCE_MS } from '../shared/constants'
import type { TabRecord, TabEvent, TabEventType } from '../shared/types'

/**
 * 初始化标签页监控
 * - 注册 Chrome 标签页事件监听
 * - 首次启动时扫描所有已打开的标签页
 */
export function initTabMonitor() {
  chrome.tabs.onCreated.addListener(handleTabCreated)
  chrome.tabs.onRemoved.addListener(handleTabRemoved)
  chrome.tabs.onActivated.addListener(handleTabActivated)
  chrome.tabs.onUpdated.addListener(handleTabUpdated)

  logger.info('Tab monitor initialized')
}

/**
 * 全量扫描当前所有标签页，建立初始状态
 * 在扩展安装/更新/浏览器启动时调用
 */
export async function scanAllTabs() {
  const deviceId = await getOrCreateDeviceId()
  const tabs = await chrome.tabs.query({})
  const existingRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const existingIdMap = await storage.get(STORAGE_KEYS.TAB_ID_MAP)

  const records: Record<string, TabRecord> = { ...existingRecords }
  const idMap: Record<number, string> = {}

  const now = nowISO()

  for (const tab of tabs) {
    if (tab.id == null) continue

    // 检查是否已有该 chromeTabId 的映射
    const existingUUID = existingIdMap[tab.id]
    const existingRecord = existingUUID ? records[existingUUID] : null

    if (existingRecord) {
      // 已存在，更新信息
      existingRecord.url = tab.url || existingRecord.url
      existingRecord.title = tab.title || existingRecord.title
      existingRecord.favIconUrl = tab.favIconUrl || existingRecord.favIconUrl
      existingRecord.windowId = tab.windowId
      existingRecord.status = 'open'
      records[existingUUID] = existingRecord
      idMap[tab.id] = existingUUID
    } else {
      // 新标签页，创建记录
      const uuid = generateUUID()
      records[uuid] = {
        id: uuid,
        chromeTabId: tab.id,
        windowId: tab.windowId,
        url: tab.url || '',
        title: tab.title || '',
        favIconUrl: tab.favIconUrl || '',
        status: 'open',
        openedAt: now,
        lastAccessedAt: now,
        deviceId,
        workspaceIds: [],
      }
      idMap[tab.id] = uuid
    }
  }

  await storage.setMultiple({
    [STORAGE_KEYS.TAB_RECORDS]: records,
    [STORAGE_KEYS.TAB_ID_MAP]: idMap,
  })

  logger.info(`Scanned ${tabs.length} tabs, ${Object.keys(records).length} records total`)
}

// ============ 事件处理 ============

/** 新标签页创建 */
async function handleTabCreated(tab: chrome.tabs.Tab) {
  if (tab.id == null) return

  const deviceId = await getOrCreateDeviceId()
  const uuid = generateUUID()
  const now = nowISO()

  const record: TabRecord = {
    id: uuid,
    chromeTabId: tab.id,
    windowId: tab.windowId,
    url: tab.url || '',
    title: tab.title || '',
    favIconUrl: tab.favIconUrl || '',
    status: 'open',
    openedAt: now,
    lastAccessedAt: now,
    deviceId,
    workspaceIds: [],
  }

  // 保存记录和映射
  const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const idMap = await storage.get(STORAGE_KEYS.TAB_ID_MAP)
  records[uuid] = record
  idMap[tab.id] = uuid
  await storage.setMultiple({
    [STORAGE_KEYS.TAB_RECORDS]: records,
    [STORAGE_KEYS.TAB_ID_MAP]: idMap,
  })

  await pushEvent('created', record, deviceId)
  logger.debug('Tab created:', tab.id, tab.url)
}

/** 标签页关闭 */
async function handleTabRemoved(tabId: number) {
  const idMap = await storage.get(STORAGE_KEYS.TAB_ID_MAP)
  const uuid = idMap[tabId]
  if (!uuid) return

  const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const record = records[uuid]
  if (!record) return

  const deviceId = await getOrCreateDeviceId()

  // 标记为关闭
  record.status = 'closed'
  record.closedAt = nowISO()
  records[uuid] = record

  // 从 idMap 中移除（chromeTabId 已失效）
  delete idMap[tabId]

  await storage.setMultiple({
    [STORAGE_KEYS.TAB_RECORDS]: records,
    [STORAGE_KEYS.TAB_ID_MAP]: idMap,
  })

  await pushEvent('removed', record, deviceId)
  logger.debug('Tab removed:', tabId, record.url)
}

/** 标签页激活（切换到某标签页） */
async function handleTabActivated(activeInfo: chrome.tabs.OnActivatedInfo) {
  const idMap = await storage.get(STORAGE_KEYS.TAB_ID_MAP)
  const uuid = idMap[activeInfo.tabId]
  if (!uuid) return

  const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const record = records[uuid]
  if (!record) return

  const deviceId = await getOrCreateDeviceId()

  record.lastAccessedAt = nowISO()
  records[uuid] = record

  await storage.set(STORAGE_KEYS.TAB_RECORDS, records)
  await pushEvent('activated', record, deviceId)
}

/**
 * 标签页更新（URL/标题/状态变化）
 * 使用防抖：页面加载时会触发多次 onUpdated，只关心最终状态
 */
const debouncedUpdate = createKeyedDebounce<{ tabId: number; tab: chrome.tabs.Tab }>(
  async (_key, { tabId, tab }) => {
    const idMap = await storage.get(STORAGE_KEYS.TAB_ID_MAP)
    const uuid = idMap[tabId]
    if (!uuid) return

    const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)
    const record = records[uuid]
    if (!record) return

    const deviceId = await getOrCreateDeviceId()

    // 更新字段
    record.url = tab.url || record.url
    record.title = tab.title || record.title
    record.favIconUrl = tab.favIconUrl || record.favIconUrl
    record.lastAccessedAt = nowISO()
    records[uuid] = record

    await storage.set(STORAGE_KEYS.TAB_RECORDS, records)
    await pushEvent('updated', record, deviceId)
    logger.debug('Tab updated:', tabId, record.url)
  },
  TAB_EVENT_DEBOUNCE_MS,
)

function handleTabUpdated(tabId: number, _changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) {
  debouncedUpdate(String(tabId), { tabId, tab })
}

// ============ 事件队列 ============

/** 将事件推入待同步队列 */
async function pushEvent(type: TabEventType, tabRecord: TabRecord, deviceId: string) {
  const event: TabEvent = {
    id: generateUUID(),
    type,
    tabRecord,
    timestamp: nowISO(),
    deviceId,
  }

  const pendingEvents = await storage.get(STORAGE_KEYS.PENDING_EVENTS)
  pendingEvents.push(event)
  await storage.set(STORAGE_KEYS.PENDING_EVENTS, pendingEvents)
}
