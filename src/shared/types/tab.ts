/** 标签页记录 - 扩展内部管理的标签页数据 */
export interface TabRecord {
  /** 扩展生成的 UUID (跨设备唯一标识) */
  id: string
  /** Chrome 本地 tabId (仅本地有意义，临时性) */
  chromeTabId: number
  /** 所在窗口 ID */
  windowId: number
  /** 页面 URL */
  url: string
  /** 页面标题 */
  title: string
  /** 页面图标 URL */
  favIconUrl: string
  /** 标签页状态 */
  status: TabStatus
  /** 首次打开时间 (ISO 字符串) */
  openedAt: string
  /** 最近访问时间 (ISO 字符串) */
  lastAccessedAt: string
  /** 关闭时间 (ISO 字符串，仅 closed/archived 状态有值) */
  closedAt?: string
  /** 所属设备 ID */
  deviceId: string
  /** 所属工作组 ID 列表 */
  workspaceIds: string[]
}

export type TabStatus = 'open' | 'closed' | 'archived'

/** 标签页变更事件 */
export interface TabEvent {
  /** 事件 UUID */
  id: string
  /** 事件类型 */
  type: TabEventType
  /** 变更后的标签页数据 */
  tabRecord: TabRecord
  /** 事件发生时间 (ISO 字符串) */
  timestamp: string
  /** 事件来源设备 ID */
  deviceId: string
}

export type TabEventType = 'created' | 'updated' | 'removed' | 'activated'
