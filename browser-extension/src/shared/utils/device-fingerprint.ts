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

  const browserName = getBrowserName()
  const defaultName = `${browserName} on ${os}`
  await storage.set(STORAGE_KEYS.DEVICE_NAME, defaultName)
  return defaultName
}

/** 获取浏览器名称（不含版本号） */
function getBrowserName(): string {
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('OPR/')) return 'Opera'
  if (ua.includes('Brave')) return 'Brave'
  if (ua.includes('Vivaldi/')) return 'Vivaldi'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari'
  return 'Unknown'
}

/** 获取浏览器信息（含名称和版本号，用于注册到后端） */
export function getBrowserInfo(): string {
  const ua = navigator.userAgent

  if (ua.includes('Edg/')) {
    const v = ua.match(/Edg\/([\d.]+)/)
    return v ? `Edge ${v[1]}` : 'Edge'
  }
  if (ua.includes('OPR/')) {
    const v = ua.match(/OPR\/([\d.]+)/)
    return v ? `Opera ${v[1]}` : 'Opera'
  }
  if (ua.includes('Brave')) {
    const v = ua.match(/Chrome\/([\d.]+)/)
    return v ? `Brave ${v[1]}` : 'Brave'
  }
  if (ua.includes('Vivaldi/')) {
    const v = ua.match(/Vivaldi\/([\d.]+)/)
    return v ? `Vivaldi ${v[1]}` : 'Vivaldi'
  }
  if (ua.includes('Chrome/')) {
    const v = ua.match(/Chrome\/([\d.]+)/)
    return v ? `Chrome ${v[1]}` : 'Chrome'
  }
  if (ua.includes('Firefox/')) {
    const v = ua.match(/Firefox\/([\d.]+)/)
    return v ? `Firefox ${v[1]}` : 'Firefox'
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const v = ua.match(/Version\/([\d.]+)/)
    return v ? `Safari ${v[1]}` : 'Safari'
  }
  return 'Unknown'
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

/**
 * 获取平台编码（与后端 Platform 枚举的 platformCode 字段对应）
 * 用于登录时告知后端当前扩展运行在哪个浏览器上
 */
export function getPlatformCode(): string {
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'edge_ext'
  if (ua.includes('Chrome/')) return 'chrome_ext'
  if (ua.includes('Firefox/')) return 'firefox_ext'
  return 'chrome_ext' // 默认 chrome_ext，因为目前只支持 Chromium 系浏览器
}
