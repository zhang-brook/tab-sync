/** chrome.storage.local 的存储 key 常量 */
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
  /** 本地标签页记录 Map<tabUUID, TabRecord> */
  TAB_RECORDS: 'tab_records',
  /** Chrome tabId → 扩展 UUID 的映射表 */
  TAB_ID_MAP: 'tab_id_map',
  /** 同步状态 */
  SYNC_STATE: 'sync_state',
  /** 待同步事件队列 */
  PENDING_EVENTS: 'pending_events',
  /** 工作组列表 */
  WORKSPACES: 'workspaces',
  /** 后端 API 地址 */
  API_BASE_URL: 'api_base_url',
  /** 同步间隔 (分钟) */
  SYNC_INTERVAL: 'sync_interval',
} as const

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]
