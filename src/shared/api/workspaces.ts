import { apiClient } from './client'
import type { Workspace } from '../types'

/** 获取所有工作组 */
export function getWorkspaces() {
  return apiClient.get<{ workspaces: Workspace[] }>('/v1/tab-sync/workspaces')
}

/** 创建工作区 */
export function createWorkspace(payload: {
  name: string
  color: string
  icon?: string
  tabIds: string[]
}) {
  return apiClient.post<{ workspace: Workspace }>('/v1/tab-sync/workspaces', payload)
}

/** 更新工作区 */
export function updateWorkspace(
  id: string,
  payload: { name?: string; color?: string; icon?: string; tabIds?: string[] }
) {
  return apiClient.put<{ workspace: Workspace }>(`/v1/tab-sync/workspaces/${encodeURIComponent(id)}`, payload)
}

/** 删除工作区 */
export function deleteWorkspace(id: string) {
  return apiClient.delete<{ success: boolean }>(`/v1/tab-sync/workspaces/${encodeURIComponent(id)}`)
}
