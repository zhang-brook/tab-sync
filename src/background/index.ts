// SpiderMemos Tab Sync - Background Service Worker
console.log('[SpiderMemos] Service Worker started')

// 监听扩展安装/更新
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SpiderMemos] Extension installed/updated:', details.reason)
})

// 监听来自 popup/sidepanel/dashboard 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[SpiderMemos] Received message:', message)

  if (message.action === 'OPEN_DASHBOARD') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/dashboard/index.html'),
    })
    sendResponse({ success: true })
    return
  }

  if (message.action === 'GET_STATE') {
    sendResponse({
      success: true,
      data: {
        authenticated: false,
        syncStatus: 'idle',
      },
    })
    return
  }

  sendResponse({ success: false, error: 'Unknown action' })
})
