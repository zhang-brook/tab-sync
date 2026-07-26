/** chrome.storage.local 的存储 key 常量
 * v2: 仅保留认证/设备/设置，业务数据全部走后端 API
 * v3: 适配轻量后端 — 移除账号密码体系，Token 改为 API Key 风格
 */
export const STORAGE_KEYS = {
  /** API Key 风格的认证 Token（替代原来的 accessToken） */
  AUTH_TOKEN: 'auth_token',
  /** 连接模式: 'lightweight' | 'zhige' */
  CONNECTION_MODE: 'connection_mode',
  /** 设备 ID */
  DEVICE_ID: 'device_id',
  /** 设备名称 */
  DEVICE_NAME: 'device_name',
  /** 后端 API 地址 */
  API_BASE_URL: 'api_base_url',
  /** 快捷键「加入并关闭」使用的默认收藏工作组 ID */
  DEFAULT_WORKSPACE_ID: 'default_workspace_id',
  /** 是否启用「加入并关闭」快捷键 (Shift+Alt+S) */
  SHORTCUT_ENABLED: 'shortcut_enabled',
} as const

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]
