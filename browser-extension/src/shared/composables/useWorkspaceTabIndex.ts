import { onMounted, ref } from 'vue'
import { getWorkspaceTabsSummary } from '../services/workspace-service'
import { normalizeColor } from '../constants/theme'
import type { WorkspaceTabsSummaryData } from '../types'
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
      clickable: true,
    }))
  }

  function colorsFor(url: string): string[] {
    return workspacesFor(url).map((w) => w.color)
  }

  onMounted(() => void load())

  return { load, tagsFor, colorsFor }
}
