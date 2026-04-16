import type { TabEvent, TabRecord } from './tab'

/** 同步状态 */
export type SyncStatus = 'idle' | 'syncing' | 'error'

/** 同步状态信息 */
export interface SyncState {
  /** 上次同步时间 (ISO 字符串) */
  lastSyncAt: string | null
  /** 待同步事件队列 */
  pendingEvents: TabEvent[]
  /** 当前同步状态 */
  status: SyncStatus
  /** 错误信息 (仅 error 状态) */
  errorMessage?: string
}

/** 增量同步请求 */
export interface SyncEventsRequest {
  deviceId: string
  events: TabEvent[]
}

/** 增量同步响应 */
export interface SyncEventsResponse {
  processed: number
  conflicts: TabEvent[]
}

/** 全量同步请求 */
export interface SyncFullRequest {
  deviceId: string
  tabs: TabRecord[]
  timestamp: string
}

/** 全量同步响应 */
export interface SyncFullResponse {
  merged: TabRecord[]
  conflicts: TabRecord[]
}

/** 拉取同步响应 */
export interface SyncPullResponse {
  events: TabEvent[]
  serverTimestamp: string
}
