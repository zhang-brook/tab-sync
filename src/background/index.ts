import { handleMessage } from './message-handler'
import { logger } from '../shared/utils/logger'
import { getOrCreateDeviceId } from '../shared/utils/device-fingerprint'

logger.info('Service Worker started')

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info('Extension installed/updated:', details.reason)
  // 确保设备 ID 已生成
  const deviceId = await getOrCreateDeviceId()
  logger.info('Device ID:', deviceId)
})

// 监听来自 popup/sidepanel/dashboard 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  logger.debug('Received message:', message.action)
  // handleMessage 是异步的，需要返回 true 保持消息通道
  handleMessage(message).then(sendResponse)
  return true
})
