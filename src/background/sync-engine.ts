import { storage, STORAGE_KEYS } from '../shared/storage'
import { getOrCreateDeviceId } from '../shared/utils/device-fingerprint'
import { nowISO } from '../shared/utils/tab-utils'
import { logger } from '../shared/utils/logger'
import { syncEvents, syncFull, syncPull } from '../shared/api/sync'
import { SYNC_MAX_RETRIES, SYNC_RETRY_BASE_DELAY_MS } from '../shared/constants'
import type { SyncState, TabEvent, TabRecord } from '../shared/types'

/**
 * 同步引擎
 *
 * 职责:
 * 1. 事件驱动同步: 消费 pendingEvents 队列，批量上传到后端
 * 2. 定期全量对账: 与后端进行完整状态比对
 * 3. 拉取同步: 获取其他设备的变更
 * 4. 失败重试: 指数退避，最多重试 SYNC_MAX_RETRIES 次
 * 5. 离线处理: 网络不可用时事件累积，恢复后自动刷新
 */

/** 执行增量同步 - 上传待同步事件队列 */
export async function performIncrementalSync(): Promise<boolean> {
  // 检查是否已登录
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) {
    logger.debug('Sync skipped: not authenticated')
    return false
  }

  // 获取待同步事件
  const pendingEvents = await storage.get(STORAGE_KEYS.PENDING_EVENTS)
  if (pendingEvents.length === 0) {
    logger.debug('Sync skipped: no pending events')
    return true
  }

  const deviceId = await getOrCreateDeviceId()
  await updateSyncStatus('syncing')

  // 批量上传事件
  const res = await syncEvents({ deviceId, events: pendingEvents })

  if (res.ok) {
    // 上传成功，清空已同步的事件
    // 注意: 在同步期间可能有新事件入队，只清除已发送的部分
    const currentEvents = await storage.get(STORAGE_KEYS.PENDING_EVENTS)
    const sentIds = new Set(pendingEvents.map(e => e.id))
    const remaining = currentEvents.filter(e => !sentIds.has(e.id))
    await storage.set(STORAGE_KEYS.PENDING_EVENTS, remaining)

    await updateSyncStatus('idle', nowISO())
    logger.info(`Incremental sync success: ${pendingEvents.length} events uploaded`)
    return true
  }

  // 同步失败
  logger.warn('Incremental sync failed:', res.error)
  await updateSyncStatus('error', undefined, res.error)
  return false
}

/** 执行全量同步 - 与后端进行完整状态对账 */
export async function performFullSync(): Promise<boolean> {
  // 检查是否已登录
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) {
    logger.debug('Full sync skipped: not authenticated')
    return false
  }

  const deviceId = await getOrCreateDeviceId()
  const tabRecords = await storage.get(STORAGE_KEYS.TAB_RECORDS)
  const tabs = Object.values(tabRecords)

  await updateSyncStatus('syncing')

  const res = await syncFull({
    deviceId,
    tabs,
    timestamp: nowISO(),
  })

  if (res.ok && res.data) {
    // 将后端返回的合并结果更新到本地
    if (res.data.merged.length > 0) {
      const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)
      for (const tab of res.data.merged) {
        records[tab.id] = tab
      }
      await storage.set(STORAGE_KEYS.TAB_RECORDS, records)
    }

    await updateSyncStatus('idle', nowISO())
    logger.info(`Full sync success: ${tabs.length} tabs synced`)
    return true
  }

  logger.warn('Full sync failed:', res.error)
  await updateSyncStatus('error', undefined, res.error)
  return false
}

/** 拉取其他设备的变更 */
export async function performPullSync(): Promise<boolean> {
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) return false

  const deviceId = await getOrCreateDeviceId()
  const syncState = await storage.get(STORAGE_KEYS.SYNC_STATE)
  const since = syncState.lastSyncAt || new Date(0).toISOString()

  const res = await syncPull(deviceId, since)

  if (res.ok && res.data) {
    // 处理来自其他设备的事件
    if (res.data.events.length > 0) {
      await applyRemoteEvents(res.data.events)
      logger.info(`Pull sync: applied ${res.data.events.length} remote events`)
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
      // 指数退避延迟
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
  // 先上传本地变更
  await syncWithRetry()
  // 再拉取远端变更
  await performPullSync()
}

// ============ 内部辅助函数 ============

/** 更新同步状态到 storage */
async function updateSyncStatus(
  status: SyncState['status'],
  lastSyncAt?: string,
  errorMessage?: string,
): Promise<void> {
  const syncState = await storage.get(STORAGE_KEYS.SYNC_STATE)
  syncState.status = status
  if (lastSyncAt) {
    syncState.lastSyncAt = lastSyncAt
  }
  if (errorMessage) {
    syncState.errorMessage = errorMessage
  } else if (status !== 'error') {
    syncState.errorMessage = undefined
  }
  await storage.set(STORAGE_KEYS.SYNC_STATE, syncState)
}

/** 将远端事件应用到本地状态 */
async function applyRemoteEvents(events: TabEvent[]): Promise<void> {
  const records = await storage.get(STORAGE_KEYS.TAB_RECORDS)

  for (const event of events) {
    const tab = event.tabRecord
    // 远端标签页记录直接合并（远端设备的标签页，本地只作为只读展示）
    records[tab.id] = tab
  }

  await storage.set(STORAGE_KEYS.TAB_RECORDS, records)
}

/** 延迟工具函数 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
