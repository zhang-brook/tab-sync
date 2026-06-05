import { storage, STORAGE_KEYS } from '../shared/storage'
import { getOrCreateDeviceId } from '../shared/utils/device-fingerprint'
import { nowISO } from '../shared/utils/tab-utils'
import { logger } from '../shared/utils/logger'
import { syncEvents, syncStartup, syncPull } from '../shared/api/sync'
import { SYNC_MAX_RETRIES, SYNC_RETRY_BASE_DELAY_MS } from '../shared/constants'
import type { TabEvent, StartupTab } from '../shared/types'

/**
 * 同步引擎
 *
 * 职责:
 * 1. 事件驱动同步: 消费 pendingEvents 队列，批量上传到后端
 * 2. 启动对账: 浏览器启动时与后端比对标签页状态
 * 3. 拉取同步: 获取其他设备的变更
 * 4. 失败重试: 指数退避，最多重试 SYNC_MAX_RETRIES 次
 */

/** 执行增量同步 - 上传待同步事件队列 */
export async function performIncrementalSync(): Promise<boolean> {
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) {
    logger.debug('Sync skipped: not authenticated')
    return false
  }

  // 从 session storage 获取待同步事件
  const result = await chrome.storage.session.get('pending_events')
  const pendingEvents: TabEvent[] = (result['pending_events'] as TabEvent[]) || []

  if (pendingEvents.length === 0) {
    logger.debug('Sync skipped: no pending events')
    return true
  }

  const deviceId = await getOrCreateDeviceId()

  // 批量上传事件
  const res = await syncEvents({ deviceId, events: pendingEvents })

  if (res.ok) {
    // 上传成功，清空已同步的事件
    const current = await chrome.storage.session.get('pending_events')
    const currentEvents: TabEvent[] = (current['pending_events'] as TabEvent[]) || []
    const sentIds = new Set(pendingEvents.map(e => e.id))
    const remaining = currentEvents.filter(e => !sentIds.has(e.id))
    await chrome.storage.session.set({ pending_events: remaining })

    await storage.set(STORAGE_KEYS.LAST_SYNC_AT, nowISO())
    logger.info(`Incremental sync success: ${pendingEvents.length} events uploaded`)
    return true
  }

  logger.warn('Incremental sync failed:', res.error)
  return false
}

/** 执行启动对账 - 扫描所有标签页与后端比对 */
export async function performStartupSync(): Promise<Record<string, string>> {
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) {
    logger.debug('Startup sync skipped: not authenticated')
    return {}
  }

  const deviceId = await getOrCreateDeviceId()

  // 扫描当前所有打开的标签页
  const chromeTabs = await chrome.tabs.query({})
  const tabs: StartupTab[] = []
  for (const tab of chromeTabs) {
    if (tab.id == null) continue
    tabs.push({
      chromeTabId: tab.id,
      url: tab.url || tab.pendingUrl || '',
      title: tab.title || '',
      windowId: tab.windowId ?? 0,
      favIconUrl: tab.favIconUrl || '',
    })
  }

  if (tabs.length === 0) {
    logger.debug('Startup sync: no tabs to sync')
    return {}
  }

  // 发送对账请求
  const res = await syncStartup({ deviceId, tabs })

  if (res.ok && res.data) {
    // 保存 chromeTabId → UUID 映射到 session storage
    await chrome.storage.session.set({ tab_id_mappings: res.data.mappings })

    await storage.set(STORAGE_KEYS.LAST_SYNC_AT, nowISO())
    logger.info(`Startup sync success: ${tabs.length} tabs, ${Object.keys(res.data.mappings).length} mappings`)
    return res.data.mappings
  }

  logger.warn('Startup sync failed:', res.error)
  return {}
}

/** 拉取其他设备的变更 */
export async function performPullSync(): Promise<boolean> {
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) return false

  const deviceId = await getOrCreateDeviceId()
  const lastSyncAt = await storage.get(STORAGE_KEYS.LAST_SYNC_AT)
  const since = lastSyncAt || new Date(0).toISOString()

  const res = await syncPull(deviceId, since)

  if (res.ok && res.data) {
    if (res.data.events.length > 0) {
      logger.info(`Pull sync: received ${res.data.events.length} remote events`)
    }
    return true
  }

  logger.warn('Pull sync failed:', res.error)
  return false
}

/**
 * 带重试的同步执行
 * 指数退避: 1s → 2s → 4s
 */
export async function syncWithRetry(): Promise<boolean> {
  for (let attempt = 0; attempt <= SYNC_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = SYNC_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
      logger.debug(`Sync retry #${attempt}, waiting ${delay}ms`)
      await sleep(delay)
    }

    const success = await performIncrementalSync()
    if (success) return true
  }

  logger.error(`Sync failed after ${SYNC_MAX_RETRIES} retries`)
  return false
}

/** 触发一次完整的同步周期 (增量上传 + 拉取) */
export async function triggerSync(): Promise<void> {
  await syncWithRetry()
  await performPullSync()
}

/** 延迟工具函数 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
