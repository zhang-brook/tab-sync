import { onMounted, onUnmounted, ref } from 'vue'
import { getWorkspaceTabsSummary } from '../services/workspace-service'
import { normalizeColor } from '../constants/theme'
import { STORAGE_KEYS } from '../storage'
import type { WorkspaceTabsSummaryData, WorkspaceTabsChangedMessage } from '../types'
import type { TabTagDisplay } from '../types/tab-list'

type WorkspaceSummary = WorkspaceTabsSummaryData['summaries'][number]

interface SavedWorkspaceRef {
  workspaceId: string
  workspaceName: string
  /** 归一化后的色值（始终带 #） */
  color: string
}

/**
 * 「当前标签页是否已保存到工作组」索引：拉取所有工作组的标签页摘要，
 * 按 URL 反查所属工作组，供标签页列表做来源高亮。
 */
export function useWorkspaceTabIndex() {
  const workspacesByUrl = ref<Record<string, SavedWorkspaceRef[]>>({})

  async function load() {
    let summaries: WorkspaceSummary[]
    try {
      summaries = await getWorkspaceTabsSummary()
    } catch {
      // 未登录/后端不可用时仅不展示来源标识
      return
    }

    const index: Record<string, SavedWorkspaceRef[]> = {}
    for (const s of summaries) {
      const workspace: SavedWorkspaceRef = {
        workspaceId: s.workspaceId,
        workspaceName: s.workspaceName,
        color: normalizeColor(s.workspaceColor),
      }
      for (const tab of s.tabs) {
        const list = (index[tab.url] ||= [])
        if (!list.some((w) => w.workspaceId === workspace.workspaceId)) list.push(workspace)
      }
    }
    workspacesByUrl.value = index
  }

  function workspacesFor(url: string): SavedWorkspaceRef[] {
    return workspacesByUrl.value[url] ?? []
  }

  function tagsFor(url: string): TabTagDisplay[] {
    return workspacesFor(url).map((w) => ({
      key: w.workspaceId,
      name: w.workspaceName,
      color: w.color,
      kind: 'workspace' as const,
    }))
  }

  function colorsFor(url: string): string[] {
    return workspacesFor(url).map((w) => w.color)
  }

  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  /** 批量操作会连续触发多条变更广播，合并为一次刷新 */
  function scheduleLoad() {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => void load(), 120)
  }

  function onMessage(message: unknown) {
    if ((message as WorkspaceTabsChangedMessage | null)?.action === 'WORKSPACE_TABS_CHANGED') {
      scheduleLoad()
    }
  }

  // 登录态变化时重建来源索引：登出后不再展示云端工作组来源，重新登录后恢复
  function onStorageChanged(changes: { [key: string]: chrome.storage.StorageChange }) {
    const tokenChange = changes[STORAGE_KEYS.AUTH_TOKEN]
    if (!tokenChange) return
    if (tokenChange.newValue) void load()
    else workspacesByUrl.value = {}
  }

  onMounted(() => {
    // 工作组标签页的写操作统一由 background 广播，其他页面（管理面板/右键菜单）修改后也能同步刷新
    chrome.runtime.onMessage.addListener(onMessage)
    chrome.storage.onChanged.addListener(onStorageChanged)
    void load()
  })

  onUnmounted(() => {
    chrome.runtime.onMessage.removeListener(onMessage)
    chrome.storage.onChanged.removeListener(onStorageChanged)
    if (reloadTimer) clearTimeout(reloadTimer)
  })

  return { load, tagsFor, colorsFor }
}
