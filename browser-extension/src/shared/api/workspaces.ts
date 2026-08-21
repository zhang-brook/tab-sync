import { apiClient } from './client'
import type { Workspace, TabReference, WorkspaceTabsGroup } from '../types'
import type { WorkspaceTabsSummaryData, WorkspaceTabPayload } from '../types'

/** 获取所有工作组。
 * includeSystem=true 时包含系统工作组（如「未分组」）。
 * includeTabs=false 时仅返回工作组元信息（不含标签页），用于管理页面左侧工作组树，避免全量拉取标签页。 */
export function getWorkspaces(includeSystem = false, includeTabs = true) {
  const params = new URLSearchParams({ includeSystem: String(includeSystem) })
  if (!includeTabs) params.set('includeTabs', 'false')
  return apiClient.get<{ workspaces: Workspace[] }>(
    `/v1/tab-sync/workspaces?${params.toString()}`,
  )
}

/** 获取工作组的标签页列表（管理页面右侧列表按需拉取，而非随工作组树全量返回）。
 * recursive=true 时一次返回该工作组自身及整棵子树的标签页（按工作区分组），用于「包含子工作组」模式。 */
export function getWorkspaceTabs(id: string, recursive = false) {
  const query = recursive ? '?recursive=true' : ''
  return apiClient.get<{ tabs: TabReference[] } | { groups: WorkspaceTabsGroup[] }>(
    `/v1/tab-sync/workspaces/${encodeURIComponent(id)}/tabs${query}`,
  )
}

/** 创建工作区（不含标签页，标签页由后续更新/加入操作添加） */
export function createWorkspace(payload: {
  name: string
  color: string
  icon?: string
  description?: string
  parentId?: string
}) {
  return apiClient.post<{ workspace: Workspace }>('/v1/tab-sync/workspaces', payload)
}

/** 更新工作区 */
export function updateWorkspace(
  id: string,
  payload: { name?: string; color?: string; icon?: string; description?: string; parentId?: string; tabs?: WorkspaceTabPayload[] }
) {
  return apiClient.put<{ workspace: Workspace }>(`/v1/tab-sync/workspaces/${encodeURIComponent(id)}`, payload)
}

/** 删除工作区。defaultWorkspaceId 为当前默认分组 ID（可选），传给后端作为兜底校验，
 * 防止默认分组被删除后「加入并关闭」等快捷操作失效。 */
export function deleteWorkspace(id: string, defaultWorkspaceId?: string) {
  const query = defaultWorkspaceId ? `?defaultWorkspaceId=${encodeURIComponent(defaultWorkspaceId)}` : ''
  return apiClient.delete<{ success: boolean }>(`/v1/tab-sync/workspaces/${encodeURIComponent(id)}${query}`)
}

/** 获取所有工作组标签页摘要（用于 TabsView 交叉比对打 tag） */
export function getWorkspaceTabsSummary() {
  return apiClient.get<WorkspaceTabsSummaryData>('/v1/tab-sync/workspaces/tabs-summary')
}

/** 移动标签页到指定工作组的目标位置（支持同组排序和跨组移动） */
export function moveWorkspaceTab(targetWorkspaceId: string, tabId: string, newIndex: number) {
  return apiClient.post<{ success: boolean }>(`/v1/tab-sync/workspaces/${encodeURIComponent(targetWorkspaceId)}/tabs/move`, { tabId, newIndex })
}

/** 通过 URL 向工作组添加标签页 */
export function addWorkspaceTabByUrl(workspaceId: string, url: string, title?: string) {
  return apiClient.post<{ tab: { tabId: string; url: string; title: string; favIconUrl: string; sortOrder: number; addedAt: string } }>(
    `/v1/tab-sync/workspaces/${encodeURIComponent(workspaceId)}/tabs`,
    { url, title: title || '' },
  )
}

/** 更新工作组内单个标签页属性（支持手动设置添加时间 addedAt、重命名 displayName、编辑链接 url/title/favIconUrl、描述 description） */
export function updateWorkspaceTab(
  workspaceId: string,
  tabId: string,
  payload: { addedAt?: string; displayName?: string; url?: string; title?: string; favIconUrl?: string; description?: string },
) {
  return apiClient.patch<{ success: boolean }>(
    `/v1/tab-sync/workspaces/${encodeURIComponent(workspaceId)}/tabs/${encodeURIComponent(tabId)}`,
    payload,
  )
}

/** 删除工作组内的单个标签页（被移除的标签页统一进入回收站） */
export function deleteWorkspaceTab(workspaceId: string, tabId: string) {
  return apiClient.delete<{ success: boolean }>(
    `/v1/tab-sync/workspaces/${encodeURIComponent(workspaceId)}/tabs/${encodeURIComponent(tabId)}`,
  )
}
