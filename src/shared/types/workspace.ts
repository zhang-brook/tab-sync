/** 工作组 */
export interface Workspace {
  id: string
  name: string
  /** 工作组标识色 (hex) */
  color: string
  /** 工作组图标 (可选) */
  icon?: string
  /** 工作组内的标签页引用 */
  tabs: TabReference[]
  createdAt: string
  updatedAt: string
}

/** 标签页引用 - 保存 URL 快照，即使原标签页已关闭也能重新打开 */
export interface TabReference {
  /** 关联的 TabRecord.id */
  tabId: string
  /** URL 快照 */
  url: string
  /** 标题快照 */
  title: string
  /** 图标快照 */
  favIconUrl: string
  /** 加入工作组的时间 */
  addedAt: string
}
