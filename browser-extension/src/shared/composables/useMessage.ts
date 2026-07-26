import type { ExtensionMessage, MessageResponse } from '../types'

/**
 * 向 Background Service Worker 发送消息并获取响应
 */
export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message || 'Message sending failed',
        })
        return
      }
      // 如果 Service Worker 尚未就绪或未返回响应，response 可能为 undefined
      if (!response) {
        resolve({
          success: false,
          error: 'Service Worker 未响应，请重试',
        })
        return
      }
      resolve(response)
    })
  })
}
