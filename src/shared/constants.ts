/** 默认同步间隔 (分钟) */
export const DEFAULT_SYNC_INTERVAL = 5

/** 心跳间隔 (分钟) */
export const HEARTBEAT_INTERVAL = 1

/** 标签页事件防抖延迟 (毫秒) */
export const TAB_EVENT_DEBOUNCE_MS = 500

/** 同步失败最大重试次数 */
export const SYNC_MAX_RETRIES = 3

/** 同步重试基础延迟 (毫秒)，指数退避: 1s → 2s → 4s */
export const SYNC_RETRY_BASE_DELAY_MS = 1000

/** Chrome Alarm 名称 */
export const ALARM_NAMES = {
  PERIODIC_SYNC: 'periodic-sync',
  HEARTBEAT: 'heartbeat',
} as const
