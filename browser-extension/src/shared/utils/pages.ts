/**
 * 扩展内部页面完整 URL（经 chrome.runtime.getURL 生成，各入口统一引用，
 * 避免在 background / 页面组件中重复硬编码路径）
 */

/** 管理面板（Dashboard）页面 URL，路由经 hash 切换，如 DASHBOARD_URL + '#/settings' */
export const DASHBOARD_URL = chrome.runtime.getURL('src/dashboard/index.html')

/** 分组选择器弹窗页面 URL，参数经 query 传递，如 PICKER_URL + '?tabIds=1,2' */
export const PICKER_URL = chrome.runtime.getURL('src/picker/index.html')

/** 浏览器扩展管理页（定位到本扩展，可查看权限、编辑快捷键并重新加载） */
export function extensionManageUrl(): string {
  return `chrome://extensions/?id=${chrome.runtime.id}`
}
