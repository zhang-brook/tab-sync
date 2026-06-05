import { handleMessage } from './message-handler'
import { initTabMonitor } from './tab-monitor'
import { logger } from '../shared/utils/logger'
import { getOrCreateDeviceId, getDeviceName, getBrowserInfo, getOSInfo } from '../shared/utils/device-fingerprint'
import { registerDevice } from '../shared/api/devices'
import { storage, STORAGE_KEYS } from '../shared/storage'

logger.info('Service Worker started')

// 注册标签页事件监听（必须在顶层同步注册，SW 重启时也能正确绑定）
initTabMonitor()

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info('Extension installed/updated:', details.reason)
  const deviceId = await getOrCreateDeviceId()
  const deviceName = await getDeviceName()
  logger.info('Device ID:', deviceId, 'Name:', deviceName)
  // 尝试向后端注册设备（后端未部署时静默失败）
  await tryRegisterDevice(deviceId)
})

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
