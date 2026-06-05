/** chrome.storage.local 的存储 key 常量
 * v2: 仅保留认证/设备/设置，业务数据全部走后端 API
 */
export const STORAGE_KEYS = {
  /** 认证 Token */
  AUTH_TOKEN: 'auth_token',
  /** 刷新 Token */
  REFRESH_TOKEN: 'refresh_token',
  /** 当前用户信息 */
  AUTH_USER: 'auth_user',
  /** 设备 ID */
  DEVICE_ID: 'device_id',
  /** 设备名称 */
  DEVICE_NAME: 'device_name',
  /** 后端 API 地址 */
  API_BASE_URL: 'api_base_url',
  /** 同步间隔 (分钟) */
  SYNC_INTERVAL: 'sync_interval',
  /** 上次同步时间 (ISO 字符串) */
  LAST_SYNC_AT: 'last_sync_at',
} as const

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]
