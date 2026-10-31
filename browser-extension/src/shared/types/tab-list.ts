import type { Component } from 'vue'

/** 列表行上的可点击标签（云端标签、来源工作组等） */
export interface TabTagDisplay {
  id?: number
  /** 点击回传的标识（如来源工作组 id） */
  key?: string
  name: string
  color?: string
  clickable?: boolean
}

/** TabList 行菜单项：由各端按场景组装，执行通过 command 事件回传 */
export interface TabListMenuEntry {
  command: string
  label: string
  icon?: Component
  danger?: boolean
  disabled?: boolean
  /** 在该项上方显示分隔线 */
  divided?: boolean
}

/** TabList 统一行数据：本地标签页与云端标签页都映射到这个结构 */
export interface TabListItem {
  /** 行唯一标识（选择与渲染 key 用） */
  id: string | number
  title: string
  url: string
  favIconUrl?: string
  /** 重命名后的原始标题（悬浮提示「xx（原：yy）」） */
  originalTitle?: string
  /** 行尾来源徽标（工作组名等） */
  badgeText?: string
  badgeColor?: string
  /** 行内标签（云端标签、来源工作组等） */
  tags?: TabTagDisplay[]
  /** 描述文本 */
  description?: string
  /** 加入时间（ISO） */
  addedAt?: string
  /** 已保存到工作组：行首显示来源色条 */
  saved?: boolean
  /** 已保存工作组的颜色，多个工作组按顺序渐变 */
  savedColors?: string[]
}

/** 拖拽排序事件（vuedraggable update 事件的简化形态） */
export interface TabListSortEvent {
  moved?: { element: TabListItem; oldIndex: number; newIndex: number }
}

/** 各端按场景为行补充的展示信息 */
export interface TabRowMeta {
  badgeText?: string
  badgeColor?: string
  tags?: TabTagDisplay[]
  description?: string
  addedAt?: string
  saved?: boolean
  savedColors?: string[]
}
