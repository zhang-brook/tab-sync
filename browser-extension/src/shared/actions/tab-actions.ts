import type { Component } from 'vue'
import {
  Close,
  Clock,
  CopyDocument,
  Delete,
  DocumentCopy,
  Edit,
  EditPen,
  FolderAdd,
  FolderChecked,
  FolderOpened,
  InfoFilled,
  Link,
  Memo,
  Plus,
  PriceTag,
  Rank,
  View,
} from '@element-plus/icons-vue'
import type { TabListMenuEntry } from '../types/tab-list'

/**
 * 标签页操作目录：本地标签页、云端标签页、标签页/已同步页共用同一套
 * 动作标识与文案，各端只按场景挑选需要的项。
 */
export type TabActionId =
  | 'open'
  | 'close'
  | 'addToWorkspace'
  | 'addToWorkspaceAndClose'
  | 'saveToDefault'
  | 'saveToDefaultAndClose'
  | 'saveToUngrouped'
  | 'saveToUngroupedAndClose'
  | 'saveToNewWorkspace'
  | 'saveToNewWorkspaceAndClose'
  | 'copyTitle'
  | 'copyLink'
  | 'rename'
  | 'editUrl'
  | 'editDesc'
  | 'editTime'
  | 'tag'
  | 'move'
  | 'copy'
  | 'remove'
  | 'removeTag'
  | 'openWorkspace'
  | 'properties'

interface ActionMeta {
  label: string
  icon?: Component
  danger?: boolean
}

const ACTION_META: Record<TabActionId, ActionMeta> = {
  open: { label: '打开', icon: View },
  close: { label: '关闭标签页', icon: Close },
  addToWorkspace: { label: '加入工作组…', icon: FolderAdd },
  addToWorkspaceAndClose: { label: '加入工作组并关闭…', icon: FolderChecked },
  saveToDefault: { label: '保存到默认分组', icon: FolderChecked },
  saveToDefaultAndClose: { label: '保存到默认分组并关闭', icon: FolderChecked },
  saveToUngrouped: { label: '保存到未分组', icon: FolderOpened },
  saveToUngroupedAndClose: { label: '保存到未分组并关闭', icon: FolderOpened },
  saveToNewWorkspace: { label: '保存到新工作组…', icon: Plus },
  saveToNewWorkspaceAndClose: { label: '保存到新工作组并关闭…', icon: Plus },
  copyTitle: { label: '复制标题', icon: DocumentCopy },
  copyLink: { label: '复制链接', icon: Link },
  rename: { label: '编辑标题', icon: Edit },
  editUrl: { label: '编辑链接', icon: EditPen },
  editDesc: { label: '编辑描述', icon: Memo },
  editTime: { label: '修改添加时间', icon: Clock },
  tag: { label: '设置标签', icon: PriceTag },
  move: { label: '移动到其他工作组', icon: Rank },
  copy: { label: '复制到其他工作组', icon: CopyDocument },
  remove: { label: '移至回收站', icon: Delete, danger: true },
  removeTag: { label: '移除标签', icon: Delete, danger: true },
  openWorkspace: { label: '打开工作组', icon: FolderOpened },
  properties: { label: '属性', icon: InfoFilled },
}

export interface BuildTabMenuOptions {
  /** 覆盖默认文案（如带默认分组名） */
  labels?: Partial<Record<TabActionId, string>>
  /** 禁用项 */
  disabled?: readonly TabActionId[]
  /** 在这些项上方显示分隔线 */
  dividersBefore?: readonly TabActionId[]
}

/** 组装 TabList 行菜单 */
export function buildTabMenu(
  ids: readonly TabActionId[],
  options: BuildTabMenuOptions = {},
): TabListMenuEntry[] {
  return ids.map((id) => {
    const meta = ACTION_META[id]
    return {
      command: id,
      label: options.labels?.[id] ?? meta.label,
      icon: meta.icon,
      danger: meta.danger,
      disabled: options.disabled?.includes(id),
      divided: options.dividersBefore?.includes(id),
    }
  })
}

/** 本地标签页右键/行菜单（与浏览器标签页右键菜单的收藏动作对齐） */
export function localTabMenu(options: BuildTabMenuOptions = {}): TabListMenuEntry[] {
  return buildTabMenu(
    [
      'open',
      'close',
      'addToWorkspace',
      'addToWorkspaceAndClose',
      'saveToDefault',
      'saveToDefaultAndClose',
      'saveToUngrouped',
      'saveToUngroupedAndClose',
      'saveToNewWorkspace',
      'saveToNewWorkspaceAndClose',
      'copyTitle',
      'copyLink',
    ],
    { dividersBefore: ['addToWorkspace', 'copyTitle'], ...options },
  )
}

/** 云端标签页行菜单 */
export function cloudTabMenu(options: BuildTabMenuOptions = {}): TabListMenuEntry[] {
  return buildTabMenu(
    ['open', 'copyTitle', 'copyLink', 'rename', 'editUrl', 'editDesc', 'editTime', 'tag', 'move', 'copy', 'remove', 'properties'],
    { dividersBefore: ['copyTitle', 'rename', 'move', 'remove', 'properties'], ...options },
  )
}

/** 标签页标签视图的行菜单 */
export function taggedTabMenu(options: BuildTabMenuOptions = {}): TabListMenuEntry[] {
  return buildTabMenu(['open', 'copyTitle', 'copyLink', 'openWorkspace', 'removeTag'], {
    dividersBefore: ['copyTitle', 'removeTag'],
    ...options,
  })
}

/** 已同步标签页视图的行菜单 */
export function syncedTabMenu(options: BuildTabMenuOptions = {}): TabListMenuEntry[] {
  return buildTabMenu(['open', 'copyTitle', 'copyLink', 'openWorkspace', 'remove'], {
    dividersBefore: ['copyTitle', 'remove'],
    ...options,
  })
}
