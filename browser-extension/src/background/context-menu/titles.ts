import { menuDefaultGroupLabel, shortcutHint } from './create'
import {
  MENU_TAB_SAVE_AS_NEW,
  MENU_TAB_SAVE_DEFAULT,
  MENU_TAB_SAVE_GROUP_NEW,
  MENU_TAB_SAVE_PICK,
  MENU_TAB_SAVE_UNGROUPED,
} from './constants'

// 标签页标题右键菜单的动态标题：Chrome 的 contextMenus 没有 onShown 事件（Firefox 的 menus
// API 才有），菜单弹出前无法改标题，改用 tabs.onHighlighted 预先更新——
// Ctrl+点击选中多个标签页（或取消多选）都会触发高亮集变化，此时把标题更新为
// 「保存 x 个选中的标签页…」/「保存此标签页…」，用户随后右键菜单显示的就是对应文案。
// 菜单标题全局共享：多窗口交错右键时文案可能短暂滞后，但点击行为（onClicked 中
// resolveTabSelection）始终以实际高亮集合为准
chrome.tabs.onHighlighted.addListener((highlightInfo) => {
  const count = highlightInfo.tabIds.length
  const subject = count > 1 ? `${count} 个选中的标签页` : '此标签页'
  chrome.contextMenus.update(MENU_TAB_SAVE_DEFAULT, {
    title: `保存 ${subject}到 ${menuDefaultGroupLabel} 并关闭${shortcutHint('save-and-close')}`,
  })
  chrome.contextMenus.update(MENU_TAB_SAVE_UNGROUPED, {
    title: `保存 ${subject}到 [未分组] 并关闭${shortcutHint('save-ungrouped')}`,
  })
  chrome.contextMenus.update(MENU_TAB_SAVE_PICK, {
    title: `保存 ${subject}到 选定分组…${shortcutHint('save-pick')}`,
  })
  chrome.contextMenus.update(MENU_TAB_SAVE_AS_NEW, {
    title: `保存 ${subject}到 新工作组…${''/*shortcutHint('save-pick')*/}`,
  })
  // 标签组菜单标题：按选中集合（高亮集）的分组状态更新
  void updateGroupMenuTitles(highlightInfo.tabIds)
})

/**
 * 更新「组保存」与「多选新建」两个菜单项的可见性与标题：
 * - 多选（选中数量 > 1）→ 显示「创建新的工作组并保存」；单选 → 隐藏；
 * - 选中集合全部处于同一标签组 → 显示「将所在标签组（含 x 个页面）保存为新工作组…」；否则隐藏。
 * 由 tabs.onHighlighted / tabs.onUpdated（groupId 变化）触发，Chrome 无菜单弹出前回调，
 * 只能预先更新；点击行为仍以点击时选中集合的实际分组为准。
 */
async function updateGroupMenuTitles(tabIds: number[]) {
  if (tabIds.length === 0) return
  // 并行读取标签信息，已关闭的跳过
  const tabs = (
    await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)))
  ).filter((t): t is chrome.tabs.Tab => t != null)
  if (tabs.length === 0) return

  // 判定是否全部处于同一标签组（未分组标签页 groupId 为 -1）
  let groupId = 0
  let sameGroup = true
  for (const t of tabs) {
    if (t.groupId < 0) {
      sameGroup = false
      break
    }
    if (groupId === 0) groupId = t.groupId
    else if (groupId !== t.groupId) {
      sameGroup = false
      break
    }
  }
  if (sameGroup && groupId > 0) {
    let count = 0
    try {
      count = (await chrome.tabs.query({ groupId })).length
    } catch {
      // 组可能已解散，保留回退标题
    }
    const groupLabel = `（含 ${count} 个页面）`
    chrome.contextMenus.update(MENU_TAB_SAVE_GROUP_NEW, {
      visible: true,
      title: `将所在标签组 ${groupLabel} 保存为 新工作组…`,
    })
  } else {
    chrome.contextMenus.update(MENU_TAB_SAVE_GROUP_NEW, { visible: false })
  }
}

// 标签页加入/移出标签组时同步更新两个菜单的可见性与标题（以该标签页为集合）
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.groupId !== undefined) {
    void updateGroupMenuTitles([tabId])
  }
})
