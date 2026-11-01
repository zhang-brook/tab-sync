import type { Component } from 'vue'
import type { TabReference } from './workspace'

/** 列表行上的可点击标签（云端标签、来源工作组等） */
export interface TabTagDisplay {
  id?: number
  /** 点击回传的标识（如来源工作组 id） */
  key?: string
  name: string
  color?: string
  /** 标签来源：普通标签用深色胶囊，工作组用浅色描边 */
  kind?: 'tag' | 'workspace'
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
  /** 来源徽标对应的工作组 id（用于点击跳转） */
  badgeKey?: string
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

/** 云端标签页排序方式：名称 / 创建时间（标签页添加时间）/ 修改时间 */
export type TabSortMode = 'name' | 'createdAt' | 'updatedAt'

/** 云端列表展示顺序：manual 为工作组内的手动排序（仅工作组成员列表提供该模式） */
export type CloudTabSortMode = TabSortMode | 'manual'

/** 云端标签页行：在统一行数据上补充所属工作组信息，供共享列表组件执行操作 */
export interface CloudTabListItem extends TabListItem {
  workspaceId: string
  tab: TabReference
}

/** 各端按场景为行补充的展示信息 */
export interface TabRowMeta {
  badgeText?: string
  badgeColor?: string
  badgeKey?: string
  tags?: TabTagDisplay[]
  description?: string
  addedAt?: string
  saved?: boolean
  savedColors?: string[]
}
