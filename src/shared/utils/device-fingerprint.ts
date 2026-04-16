import { storage } from '../storage'
import { STORAGE_KEYS } from '../storage/keys'
import { generateUUID } from './tab-utils'

/**
 * 获取或生成设备 ID
 * 首次安装时生成 UUID 并持久化，后续直接返回
 */
export async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await storage.get(STORAGE_KEYS.DEVICE_ID)
  if (!deviceId) {
    deviceId = generateUUID()
    await storage.set(STORAGE_KEYS.DEVICE_ID, deviceId)
  }
  return deviceId
}

/**
 * 获取设备名称，默认从 User-Agent 推断
 */
export async function getDeviceName(): Promise<string> {
  const stored = await storage.get(STORAGE_KEYS.DEVICE_NAME)
  if (stored) return stored

  const ua = navigator.userAgent
  let os = 'Unknown OS'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('CrOS')) os = 'ChromeOS'

  const defaultName = `Chrome on ${os}`
  await storage.set(STORAGE_KEYS.DEVICE_NAME, defaultName)
  return defaultName
}

/** 获取浏览器信息 */
export function getBrowserInfo(): string {
  return 'Chrome'
}

/** 获取操作系统信息 */
export function getOSInfo(): string {
  const ua = navigator.userAgent
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac')) return 'macOS'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('CrOS')) return 'ChromeOS'
  return 'Unknown'
}
