import { storage, STORAGE_KEYS } from '../shared/storage'
import { getOrCreateDeviceId } from '../shared/utils/device-fingerprint'
import { logger } from '../shared/utils/logger'
import { ALARM_NAMES, DEFAULT_SYNC_INTERVAL, HEARTBEAT_INTERVAL } from '../shared/constants'
import { triggerSync, performStartupSync } from './sync-engine'
import { deviceHeartbeat } from '../shared/api/devices'

/**
 * 定时任务管理器
 *
 * 使用 chrome.alarms 实现定时任务，原因:
 * - MV3 Service Worker 空闲 30s 后可能被终止
 * - setInterval/setTimeout 不可靠，SW 重启后丢失
 * - chrome.alarms 在 SW 重启后仍然有效
 */

/** 初始化定时器（注册 alarm 监听） */
export function initAlarmManager() {
  chrome.alarms.onAlarm.addListener(handleAlarm)
  logger.info('Alarm manager initialized')
}

/** 启动定时同步和心跳（先执行启动对账，再启动定时器） */
export async function startAlarms() {
  // 先对账：将当前所有打开的标签页同步到后端
  await performStartupSync()

  const syncInterval = await storage.get(STORAGE_KEYS.SYNC_INTERVAL)
  const interval = syncInterval || DEFAULT_SYNC_INTERVAL

  // 创建定期同步定时器
  await chrome.alarms.create(ALARM_NAMES.PERIODIC_SYNC, {
    periodInMinutes: interval,
  })

  // 创建心跳定时器
  await chrome.alarms.create(ALARM_NAMES.HEARTBEAT, {
    periodInMinutes: HEARTBEAT_INTERVAL,
  })

  logger.info(`Alarms started: sync every ${interval}min, heartbeat every ${HEARTBEAT_INTERVAL}min`)
}

/** 停止所有定时器 */
export async function stopAlarms() {
  await chrome.alarms.clear(ALARM_NAMES.PERIODIC_SYNC)
  await chrome.alarms.clear(ALARM_NAMES.HEARTBEAT)
  logger.info('Alarms stopped')
}

/** 处理定时器触发 */
async function handleAlarm(alarm: chrome.alarms.Alarm) {
  logger.debug('Alarm fired:', alarm.name)

  switch (alarm.name) {
    case ALARM_NAMES.PERIODIC_SYNC:
      await handlePeriodicSync()
      break

    case ALARM_NAMES.HEARTBEAT:
      await handleHeartbeat()
      break

    default:
      logger.warn('Unknown alarm:', alarm.name)
  }
}

/** 定期同步处理 */
async function handlePeriodicSync() {
  // 检查是否已登录
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) {
    logger.debug('Periodic sync skipped: not authenticated')
    return
  }

  await triggerSync()
}

/** 心跳处理 - 告知后端设备在线 */
async function handleHeartbeat() {
  // 检查是否已登录
  const token = await storage.get(STORAGE_KEYS.AUTH_TOKEN)
  if (!token) return

  const deviceId = await getOrCreateDeviceId()
  const res = await deviceHeartbeat(deviceId)

  if (!res.ok) {
    logger.debug('Heartbeat failed:', res.error)
  }
}
