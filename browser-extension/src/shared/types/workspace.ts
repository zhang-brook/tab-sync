/** 标签（全局资源，按 scope 区分标签页/工作组用途） */
export interface TagInfo {
  id: number
  name: string
  /** 十六进制颜色，可能为空 */
  color: string
  scope: 'tab' | 'workspace'
}

/** 工作组 */
export interface Workspace {
  id: string
  /** 父工作组 ID（空/缺省表示根级），用于层级树结构 */
  parentId?: string
  name: string
  /** 工作组标识色 (hex) */
  color: string
  /** 工作组图标 (可选) */
  icon?: string
  /** 工作组内的标签页引用 */
  tabs: TabReference[]
  /** 工作组标签 */
  tags?: TagInfo[]
  createdAt: string
  updatedAt: string
  /** 是否为系统工作组（如「未分组」），系统工作组不可在管理界面删除 */
  isSystem?: boolean
}

/** 标签页引用 - 保存 URL 快照，即使原标签页已关闭也能重新打开 */
export interface TabReference {
  /** 关联的 TabRecord.id */
  tabId: string
  /** URL 快照 */
  url: string
  /** 标题快照 */
  title: string
  /** 用户重命名后的显示名（可选，为空时使用 title） */
  displayName?: string
  /** 图标快照 */
  favIconUrl: string
  /** 排序序号 */
  sortOrder: number
  /** 加入工作组的时间 */
  addedAt: string
  /** 该标签页上的标签 */
  tags?: TagInfo[]
}
