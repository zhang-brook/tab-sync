import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { copyText } from '../utils/clipboard'
import { buildTabPayloads, saveTabsToWorkspace } from '../services/save-tabs'
import { getDefaultWorkspaceId, UNGROUPED_WORKSPACE_ID } from '../services/workspace-service'
import { reportServiceError } from '../services/feedback'
import type { LocalTab } from '../services/local-tabs'

export interface LocalTabActionsOptions {
  /** 当前选中的标签页 */
  selectedTabs: () => LocalTab[]
  clearSelection: () => void
  closeTabs: (ids: number[]) => Promise<void>
  /** 打开工作组选择弹窗：mode=add 普通加入，add-close 加入后关闭 */
  openWorkspacePicker: (mode: 'add' | 'add-close', tabs: LocalTab[]) => void
  /** 打开「保存到新工作组」弹窗 */
  openCreateWorkspace: (closeAfterAdd: boolean, tabs: LocalTab[]) => void
  /** 激活标签页（点击行/打开菜单项） */
  onActivate?: (tab: LocalTab) => void | Promise<void>
  /** 保存成功后的回调（刷新列表等） */
  onSaved?: () => void
}

/**
 * 本地标签页命令执行器：侧边栏与管理面板共用。
 * 行菜单点击、批量操作按钮都通过这里落到同一套 service。
 */
export function useLocalTabActions(options: LocalTabActionsOptions) {
  const saving = ref(false)

  function resolveTabs(tab?: LocalTab | null): LocalTab[] {
    if (!tab) return options.selectedTabs()
    // 与浏览器右键行为一致：右键的标签页属于多选集合时，操作作用于整个选中集合
    const selected = options.selectedTabs()
    return selected.length > 1 && selected.some((t) => t.chromeTabId === tab.chromeTabId)
      ? selected
      : [tab]
  }

  async function saveTo(workspaceId: string, tabs: LocalTab[], closeAfterSave: boolean, label?: string) {
    if (tabs.length === 0) {
      ElMessage.warning('请先选择标签页')
      return
    }
    const payloads = buildTabPayloads(tabs)
    if (payloads.length === 0) {
      ElMessage.warning('所选页面类型不支持收藏（如浏览器内置页面）')
      return
    }
    saving.value = true
    try {
      const outcome = await saveTabsToWorkspace(workspaceId, tabs)
      if (closeAfterSave) {
        await options.closeTabs(payloads.map((p) => p.chromeTabId))
      }
      const suffix = outcome.skipped > 0 ? `，跳过 ${outcome.skipped} 个重复` : ''
      const action = closeAfterSave ? '已保存并关闭' : '已保存'
      ElMessage.success(`${action}${label ? `到${label}` : ''} ${outcome.added + outcome.skipped} 个标签页${suffix}`)
      options.clearSelection()
      options.onSaved?.()
    } catch (err) {
      reportServiceError(err, { fallback: '保存失败' })
    } finally {
      saving.value = false
    }
  }

  async function saveDefault(tabs: LocalTab[], closeAfterSave: boolean) {
    try {
      const workspaceId = await getDefaultWorkspaceId()
      await saveTo(workspaceId, tabs, closeAfterSave)
    } catch (err) {
      reportServiceError(err, { fallback: '保存失败' })
    }
  }

  async function saveUngrouped(tabs: LocalTab[], closeAfterSave: boolean) {
    await saveTo(UNGROUPED_WORKSPACE_ID, tabs, closeAfterSave, '未分组')
  }

  async function copy(value: string, successText: string) {
    if (!value) {
      ElMessage.warning('没有可复制的内容')
      return
    }
    const ok = await copyText(value)
    if (ok) ElMessage.success(successText)
    else ElMessage.error('复制失败')
  }

  /** 执行行菜单命令。返回 false 表示未处理 */
  async function run(command: string, tab?: LocalTab | null): Promise<boolean> {
    const tabs = resolveTabs(tab)
    switch (command) {
      case 'open':
        if (tab) await options.onActivate?.(tab)
        return true
      case 'close':
        if (tab) await options.closeTabs([tab.chromeTabId])
        return true
      case 'addToWorkspace':
        options.openWorkspacePicker('add', tabs)
        return true
      case 'addToWorkspaceAndClose':
        options.openWorkspacePicker('add-close', tabs)
        return true
      case 'saveToDefault':
        await saveDefault(tabs, false)
        return true
      case 'saveToDefaultAndClose':
        await saveDefault(tabs, true)
        return true
      case 'saveToUngrouped':
        await saveUngrouped(tabs, false)
        return true
      case 'saveToUngroupedAndClose':
        await saveUngrouped(tabs, true)
        return true
      case 'saveToNewWorkspace':
        options.openCreateWorkspace(false, tabs)
        return true
      case 'saveToNewWorkspaceAndClose':
        options.openCreateWorkspace(true, tabs)
        return true
      case 'copyTitle':
        if (tab) await copy(tab.title || tab.url, '已复制标题')
        return true
      case 'copyLink':
        if (tab) await copy(tab.url, '已复制链接')
        return true
      default:
        return false
    }
  }

  return { saving, run, resolveTabs }
}
