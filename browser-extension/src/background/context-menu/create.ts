import { getWorkspaces } from '../../shared/api/workspaces'
import { storage, STORAGE_KEYS } from '../../shared/storage'
import { logger } from '../../shared/utils/logger'
import {
  MENU_MORE,
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

/** 命令名 → 快捷键映射缓存（创建菜单时写入，tabs.onHighlighted 动态更新标题时复用） */
let menuShortcutMap = new Map<string, string>()
/** 默认分组菜单标签缓存（如「[未分组](默认分组) 」），tabs.onHighlighted 动态更新标题时复用 */
export let menuDefaultGroupLabel = '默认分组'

/** 从 chrome.commands.getAll() 读取命令名 → 快捷键映射（菜单标题提示用） */
async function getCommandShortcutMap(): Promise<Map<string, string>> {
  const commands = await chrome.commands.getAll()
  // Command.name 类型定义为可选（实际总是存在），过滤后收窄
  const map = new Map<string, string>()
  for (const c of commands) {
    if (c.name) map.set(c.name, c.shortcut ?? '')
  }
  return map
}

/** 未绑定快捷键时不显示括号提示（与设置页「未设置按键」文案一致） */
export function shortcutHint(name: string): string {
  const key = menuShortcutMap.get(name)
  return key ? `（${key}）` : ''
}

/** 截断分组名：超过 10 个字显示前 10 字 + '...'（右键菜单标题提示用） */
function truncateGroupName(name: string, max = 10): string {
  const chars = Array.from(name)
  return chars.length > max ? chars.slice(0, max).join('') + '...' : name
}

/** 读取默认收藏分组名：未登录/获取失败返回 null，调用方回退展示「默认分组」 */
async function getDefaultWorkspaceName(): Promise<string | null> {
  try {
    const wsId = (await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)) || UNGROUPED_WORKSPACE_ID
    const res = await getWorkspaces(true)
    if (!res.ok || !res.data) return null
    return res.data.workspaces.find((w) => w.id === wsId)?.name ?? null
  } catch {
    return null
  }
}

/** 创建右键菜单项（覆盖式重建，避免重复） */
export async function createContextMenus() {
  try {
    await chrome.contextMenus.removeAll()
    // 动态读取快捷键：用户可在 chrome://extensions/shortcuts 修改/移除绑定，标题提示需随之更新
    menuShortcutMap = await getCommandShortcutMap()
    // 默认分组名：登录且能定位到分组时展示实际名字（如「保存到 [未分组](默认分组) 并关闭」），否则回退通用文案
    const defaultName = await getDefaultWorkspaceName()
    menuDefaultGroupLabel = defaultName ? `[${truncateGroupName(defaultName)}](默认分组) ` : '默认分组'
    const defaultGroupLabel = menuDefaultGroupLabel
    // 页面右键：仅 http(s) 页面显示
    const page: chrome.contextMenus.CreateProperties = {
      contexts: ['page'],
      documentUrlPatterns: [
        'http://*/*',
        'https://*/*',
        'file://*/*',
        'chrome://*/*',
        'chrome-extension://*/*',
      ],
    }
    chrome.contextMenus.create({
      id: MENU_SAVE_DEFAULT,
      title: `保存到 ${defaultGroupLabel} 并关闭${shortcutHint('save-and-close')}`,
      ...page,
    })
    chrome.contextMenus.create({
      id: MENU_SAVE_UNGROUPED,
      // 标题末尾提示快捷键：Chrome 菜单项不支持内联快捷键，实际由 manifest commands 触发
      title: `保存到 [未分组] 并关闭${shortcutHint('save-ungrouped')}`,
      ...page,
    })
    chrome.contextMenus.create({
      id: MENU_SAVE_PICK,
      title: `保存到 选定分组…${shortcutHint('save-pick')}`,
      ...page,
    })
    // 页面右键：创建新工作组并保存（与标签页右键的 MENU_TAB_SAVE_AS_NEW 对齐，作用于当前页面）
    chrome.contextMenus.create({
      id: MENU_SAVE_AS_NEW,
      title: '保存到 新工作组…',
      ...page,
    })
    // 标签页右键：静态标题默认单数文案，多选时由 tabs.onHighlighted 预先替换为「保存 x 个选中的标签页…」
    const tab: chrome.contextMenus.CreateProperties = { contexts: ['tab'] }
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_DEFAULT,
      title: `保存此标签页到 ${defaultGroupLabel} 并关闭${shortcutHint('save-and-close')}`,
      ...tab,
    })
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_UNGROUPED,
      title: `保存此标签页到 [未分组] 并关闭${shortcutHint('save-ungrouped')}`,
      ...tab,
    })
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_PICK,
      title: `保存此标签页到 选定分组…${shortcutHint('save-pick')}`,
      ...tab,
    })
    // 多选标签页 → 创建新工作组并保存：仅当选中多个标签页时显示（visible 由 onHighlighted 动态切换）
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_AS_NEW,
      title: '保存此标签页到 新工作组…',
      ...tab,
    })
    // 标签组整体保存：Chrome 不支持 tab_groups 右键上下文（Firefox 才有），故在组内标签页标题
    // 上提供；仅当选中集合全部处于同一标签组时显示，标题「含 x 个页面」与 visible 由
    // tabs.onHighlighted/onUpdated 动态更新（默认隐藏，避免单选/未分组时误显示）
    chrome.contextMenus.create({
      id: MENU_TAB_SAVE_GROUP_NEW,
      title: '将此标签页所在标签组保存为 新工作组…',
      ...tab,
      visible: false,
    })

    // 分隔线：与上方收藏操作区分开（仅页面/标签页右键需要；图标右键无收藏项，不显示）。
    // 按上下文各建一条：Chrome 对同一个 separator 挂多个 contexts 时，tab 上下文可能不渲染
    chrome.contextMenus.create({
      id: 'tab-sync-sep-open-page',
      type: 'separator',
      contexts: ['page'],
    })
    // 2026.08.14 备注：浏览器Tab标签页标题右键菜单 不支持添加分隔符，以下这行代码实际不起作用
    /*
    chrome.contextMenus.create({
      id: 'tab-sync-sep-open-tab',
      type: 'separator',
      contexts: ['tab'],
    })
    */

    // 打开侧栏/设置页：在工具栏图标（action）及页面/标签页右键中均提供。
    // 注意：Chrome contextMenus 不支持 tab_groups 上下文（Firefox 才有），无法创建标签组右键菜单
    const openMenuContexts: chrome.contextMenus.ContextType[] = [
      // chrome.contextMenus.ContextType.ACTION, // 右上角扩展图标
      chrome.contextMenus.ContextType.PAGE,   // 页面
      chrome.contextMenus.ContextType.TAB,    // 标签页标题
    ]
    for (const ctx of openMenuContexts) {
      chrome.contextMenus.create({
        id: `${MENU_OPEN_WORKSPACES}-${ctx}`,
        title: '查看已同步工作组',
        contexts: [ctx],
      })
      chrome.contextMenus.create({
        id: `${MENU_OPEN_SIDEPANEL}-${ctx}`,
        title: '打开侧栏',
        contexts: [ctx],
      })
      chrome.contextMenus.create({
        id: `${MENU_OPEN_SETTINGS}-${ctx}`,
        title: '打开设置页',
        contexts: [ctx],
      })
      chrome.contextMenus.create({
        id: `${'tab-sync-sep-2'}-${ctx}`,
        type: 'separator',
        contexts: ['page', 'tab'],
      })
    }
    // 更多选项：父项带子菜单（页面/标签页右键末尾）
    chrome.contextMenus.create({
      id: MENU_MORE,
      title: '更多选项',
      contexts: ['page', /* 'tab' */], // tab 似乎不支持二级菜单，所以这里先注释掉了
    })
    chrome.contextMenus.create({
      id: MENU_MORE_SHORTCUTS,
      parentId: MENU_MORE,
      title: '设置快捷键…',
    })
    chrome.contextMenus.create({
      id: MENU_MORE_RELOAD,
      parentId: MENU_MORE,
      title: '重启扩展',
    })

    {
      const ctx = chrome.contextMenus.ContextType.ACTION
      chrome.contextMenus.create({
        id: `${MENU_MORE_RELOAD}-${ctx}`,
        title: '重启扩展',
        contexts: [ctx],
      })
    }
    logger.info('右键菜单已创建')
  } catch (err) {
    logger.error('创建右键菜单失败:', err)
  }
}

// 注意：Chrome 的 chrome.commands API 没有 onChanged 事件（该事件是 Firefox 的
// browser.commands.onChanged，Firefox 139+ 才有）。在 Chrome 中调用会抛
// "Cannot read properties of undefined (reading 'addListener')"，导致 Service Worker
// 脚本求值失败、注册失败（Status code: 15）。
// 用户在 chrome://extensions/shortcuts 修改快捷键后 Chrome 不会通知扩展，
// 菜单标题中的快捷键提示会在下一次 Service Worker 启动时由顶层 createContextMenus() 自动刷新。
// // 用户在快捷键设置页修改/移除绑定后，重建菜单使标题提示同步（createContextMenus 幂等）
// chrome.commands.onChanged.addListener(() => {
//   void createContextMenus()
// })
