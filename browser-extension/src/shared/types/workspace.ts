/** 标签（全局资源，按 scope 区分标签页/工作组用途） */
export interface TagInfo {
  id: number
  name: string
  /** 十六进制颜色，可能为空 */
  color: string
  scope: 'tab' | 'workspace'
  /** 标签描述（可选，仅用户主动设置时存在） */
  description?: string
  /** 该标签关联的标签页数量（由后端统计，workspace 类标签为 0） */
  tabCount?: number
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
  /** 工作组描述 (可选) */
  description?: string
  /** 同级排序序号（拖拽排序后由后端下发；历史数据为 0，此时前端按名称回退排序） */
  sortOrder?: number
  /** 默认折叠状态：true=默认折叠，false/缺省=默认展开。用于树形展示的初始展开/收起 */
  collapsed?: boolean
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
  /** 标签页在后端的唯一标识 */
  tabId: string
  /** URL 快照 */
  url: string
  /** 标题快照 */
  title: string
  /** 用户重命名后的显示名（可选，为空时使用 title） */
  displayName?: string
  /** 图标快照 */
  favIconUrl: string
  /** 标签页描述（可选，仅用户主动设置时存在） */
  description?: string
  /** 排序序号 */
  sortOrder: number
  /** 加入工作组的时间 */
  addedAt: string
  /** 该标签页上的标签 */
  tags?: TagInfo[]
}
