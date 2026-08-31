import { openTabAfterActive } from '../../shared/utils/tab-utils'
import {
  handleSaveGroupClick,
  lastFocusedWindowId,
  openPickerWindow,
  openSettingsPage,
  openSidePanel,
  openWorkspacesPage,
  resolveTabSelection,
  saveTabsToWorkspaceAndClose,
  saveToDefaultWorkspaceAndClose,
} from './actions'
import {
  MENU_MORE_RELOAD,
  MENU_MORE_SHORTCUTS,
  MENU_OPEN_SETTINGS,
  MENU_OPEN_SIDEPANEL,
  MENU_OPEN_WORKSPACES,
  MENU_SAVE_AS_NEW,
  MENU_SAVE_DEFAULT,
  MENU_SAVE_PICK,
  MENU_SAVE_UNGROUPED,
  MENU_TAB_SAVE_AS_NEW,
  MENU_TAB_SAVE_DEFAULT,
  MENU_TAB_SAVE_GROUP_NEW,
  MENU_TAB_SAVE_PICK,
  MENU_TAB_SAVE_UNGROUPED,
  UNGROUPED_WORKSPACE_ID,
} from './constants'

/** 右键菜单点击分发 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = info.menuItemId
  // 打开侧栏/设置页按前缀分发（三个上下文各一个 id）；action 上下文点击时没有关联 tab，需在 tab 判空之前处理
  if (String(id).startsWith(MENU_OPEN_SIDEPANEL + '-')) {
    // sidePanel.open 必须在用户手势内同步调用，await 异步 API 后手势会失效：
    // 页面/标签页上下文直接用 tab.windowId，action 上下文无 tab，用 onFocusChanged 缓存的最近聚焦窗口
    if (tab?.windowId != null) {
      openSidePanel(tab.windowId)
    } else if (lastFocusedWindowId != null) {
      openSidePanel(lastFocusedWindowId)
    }
    return
  }
  if (String(id).startsWith(MENU_OPEN_WORKSPACES + '-')) {
    await openWorkspacesPage()
    return
  }
  if (String(id).startsWith(MENU_OPEN_SETTINGS + '-')) {
    await openSettingsPage()
    return
  }
  if (id === MENU_MORE_SHORTCUTS) {
    // 快捷键配置页：在激活标签页之后打开
    await openTabAfterActive('chrome://extensions/shortcuts')
    return
  }
  if (id === MENU_MORE_RELOAD || id === `${MENU_MORE_RELOAD}-${chrome.contextMenus.ContextType.ACTION}`) {
    // 重启扩展：Service Worker 重载后顶层 createContextMenus 会自动重建菜单
    chrome.runtime.reload()
    return
  }
  if (!tab) return
  if (id === MENU_SAVE_DEFAULT) {
    await saveToDefaultWorkspaceAndClose([tab])
  } else if (id === MENU_TAB_SAVE_DEFAULT) {
    await saveToDefaultWorkspaceAndClose(await resolveTabSelection(tab))
  } else if (id === MENU_SAVE_UNGROUPED) {
    await saveTabsToWorkspaceAndClose([tab], UNGROUPED_WORKSPACE_ID)
  } else if (id === MENU_TAB_SAVE_UNGROUPED) {
    await saveTabsToWorkspaceAndClose(await resolveTabSelection(tab), UNGROUPED_WORKSPACE_ID)
  } else if (id === MENU_SAVE_PICK) {
    await openPickerWindow([tab])
  } else if (id === MENU_TAB_SAVE_PICK) {
    await openPickerWindow(await resolveTabSelection(tab))
  } else if (id === MENU_SAVE_AS_NEW) {
    // 页面上下文只作用于当前页面（多选取自标签页高亮集，不适用于页面右键）
    await openPickerWindow([tab], { mode: 'create' })
  } else if (id === MENU_TAB_SAVE_GROUP_NEW) {
    await handleSaveGroupClick(tab)
  } else if (id === MENU_TAB_SAVE_AS_NEW) {
    await openPickerWindow(await resolveTabSelection(tab), { mode: 'create' })
  }
})
