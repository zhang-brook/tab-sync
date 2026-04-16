import { handleMessage } from './message-handler'
import { initTabMonitor, scanAllTabs } from './tab-monitor'
import { initAlarmManager, startAlarms } from './alarm-manager'
import { logger } from '../shared/utils/logger'
import { getOrCreateDeviceId } from '../shared/utils/device-fingerprint'

logger.info('Service Worker started')

// 注册标签页事件监听（必须在顶层同步注册，SW 重启时也能正确绑定）
initTabMonitor()

// 注册定时器事件监听（同样必须在顶层同步注册）
initAlarmManager()

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info('Extension installed/updated:', details.reason)
  const deviceId = await getOrCreateDeviceId()
  logger.info('Device ID:', deviceId)
  // 全量扫描当前已打开的标签页
  await scanAllTabs()
  // 启动定时同步和心跳
  await startAlarms()
})

// 浏览器启动时也做一次全量扫描并启动定时器
chrome.runtime.onStartup.addListener(async () => {
  logger.info('Browser startup')
  await scanAllTabs()
  await startAlarms()
})

// 监听来自 popup/sidepanel/dashboard 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  logger.debug('Received message:', message.action)
  // handleMessage 是异步的，需要返回 true 保持消息通道
  handleMessage(message).then(sendResponse)
  return true
})
