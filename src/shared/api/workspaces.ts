import { apiClient } from './client'
import type { Workspace } from '../types'
import type { WorkspaceTabsSummaryData, WorkspaceTabPayload } from '../types'

/** 获取所有工作组 */
export function getWorkspaces() {
  return apiClient.get<{ workspaces: Workspace[] }>('/v1/tab-sync/workspaces')
}

/** 创建工作区 — 前端直接传入标签页完整数据 */
export function createWorkspace(payload: {
  name: string
  color: string
  icon?: string
  tabs: WorkspaceTabPayload[]
}) {
  return apiClient.post<{ workspace: Workspace; mappings: Record<string, string> }>('/v1/tab-sync/workspaces', payload)
}

/** 更新工作区 */
export function updateWorkspace(
  id: string,
  payload: { name?: string; color?: string; icon?: string; tabs?: WorkspaceTabPayload[] }
) {
  return apiClient.put<{ workspace: Workspace; mappings?: Record<string, string> }>(`/v1/tab-sync/workspaces/${encodeURIComponent(id)}`, payload)
}

/** 删除工作区 */
export function deleteWorkspace(id: string) {
  return apiClient.delete<{ success: boolean }>(`/v1/tab-sync/workspaces/${encodeURIComponent(id)}`)
}

/** 获取所有工作组标签页摘要（用于 TabsView 交叉比对打 tag） */
export function getWorkspaceTabsSummary() {
  return apiClient.get<WorkspaceTabsSummaryData>('/v1/tab-sync/workspaces/tabs-summary')
}

/** 重新排序工作组内的标签页 */
export function reorderWorkspaceTabs(workspaceId: string, tabOrder: string[]) {
  return apiClient.put<{ success: boolean }>(`/v1/tab-sync/workspaces/${encodeURIComponent(workspaceId)}/reorder`, { tabOrder })
}
