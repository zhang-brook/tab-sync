// ============ 右键菜单：保存到 Tab Sync 并关闭 ============

/** 「未分组」系统工作组的固定标识（见 server/internal/service/workspace.go） */
export const UNGROUPED_WORKSPACE_ID = 'ungrouped'
// 页面右键菜单
export const MENU_SAVE_DEFAULT = 'tab-sync-save-default'
export const MENU_SAVE_UNGROUPED = 'tab-sync-save-ungrouped'
export const MENU_SAVE_PICK = 'tab-sync-save-pick'
// 标签页右键菜单（标签页菜单的 contexts 与页面不同，需独立菜单项）
export const MENU_TAB_SAVE_DEFAULT = 'tab-sync-tab-save-default'
export const MENU_TAB_SAVE_UNGROUPED = 'tab-sync-tab-save-ungrouped'
export const MENU_TAB_SAVE_PICK = 'tab-sync-tab-save-pick'
// 标签组整体保存为新工作组（Chrome 不支持 tab_groups 右键上下文，改为组内标签页右键提供）
export const MENU_TAB_SAVE_GROUP_NEW = 'tab-sync-tab-save-group-new'
// 多选标签页 → 创建新工作组并保存（弹窗命名 + 添加后关闭复选框）
export const MENU_TAB_SAVE_AS_NEW = 'tab-sync-tab-save-as-new'
// 打开侧栏/设置页：工具栏图标右键（action）+ 页面/标签页右键。contextMenus id 全局唯一，
// 同一动作在每个上下文需独立 id（追加上下文后缀），点击时按前缀分发
export const MENU_OPEN_SIDEPANEL = 'tab-sync-open-sidepanel'
export const MENU_OPEN_SETTINGS = 'tab-sync-open-settings'
export const MENU_OPEN_WORKSPACES = 'tab-sync-open-workspaces'
// 更多选项子菜单（父项带子菜单，子项以 parentId 挂在父项下）
export const MENU_MORE = 'tab-sync-more'
export const MENU_MORE_SHORTCUTS = 'tab-sync-more-shortcuts'
export const MENU_MORE_RELOAD = 'tab-sync-more-reload'

export const NOTIFICATION_SAVE_TAB_SUCCESS = 'save-tab-success'

/** 浏览器标签组颜色 → 工作组标识色 (hex)，未知颜色回退默认色 */
export const TAB_GROUP_COLOR_HEX: Record<string, string> = {
  grey: '#909399',
  blue: '#409EFF',
  red: '#F56C6C',
  yellow: '#E6A23C',
  green: '#67C23A',
  pink: '#E84393',
  purple: '#9B59B6',
  cyan: '#16A085',
  orange: '#E6A23C',
}
