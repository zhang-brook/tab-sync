import type { TabEvent, TabRecord } from './tab'

/** 同步状态 */
export type SyncStatus = 'idle' | 'syncing' | 'error'

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

/** 启动对账请求 */
export interface StartupRequest {
  deviceId: string
  tabs: StartupTab[]
}

export interface StartupTab {
  chromeTabId: number
  url: string
  title: string
  windowId: number
  favIconUrl: string
}

/** 启动对账响应 */
export interface StartupResponse {
  /** chromeTabId → UUID 的映射 */
  mappings: Record<string, string>
  /** 新创建的 TabRecord */
  newTabs: TabRecord[]
}

/** 数据重建请求 */
export interface RebuildRequest {
  deviceId: string
  tabs: RebuildTab[]
}

export interface RebuildTab {
  url: string
  title: string
  windowId: number
  favIconUrl: string
}

/** 数据重建响应 */
export interface RebuildResponse {
  replaced: number
  created: number
}

/** 拉取同步响应 */
export interface SyncPullResponse {
  events: TabEvent[]
  serverTimestamp: string
}

// ============ 以下为已废弃类型，保留兼容 ============

/** @deprecated 由 StartupRequest 替代 */
export interface SyncFullRequest {
  deviceId: string
  tabs: TabRecord[]
  timestamp: string
}

/** @deprecated 由 StartupResponse 替代 */
export interface SyncFullResponse {
  merged: TabRecord[]
  conflicts: TabRecord[]
}

/** @deprecated v2 不再维护本地同步状态 */
export interface SyncState {
  lastSyncAt: string | null
  pendingEvents: TabEvent[]
  status: SyncStatus
  errorMessage?: string
}
