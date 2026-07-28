/**
 * chrome.storage.local 的存储 key 常量。
 * 本地仅保存认证/设备/设置数据，业务数据全部走后端 API。
 */
export const STORAGE_KEYS = {
  /** API Key 风格的认证 Token */
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
