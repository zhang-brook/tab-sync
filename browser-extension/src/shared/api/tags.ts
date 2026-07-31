import { apiClient } from './client'
import type { TagInfo } from '../types/workspace'
import type { TagsData, TagTabsData } from '../types/messages'

/** 获取标签列表，可按 scope（tab | workspace）过滤 */
export function getTags(scope?: 'tab' | 'workspace') {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : ''
  return apiClient.get<TagsData>(`/v1/tab-sync/tags${query}`)
}

/** 创建标签 */
export function createTag(payload: { name: string; color?: string; scope: 'tab' | 'workspace' }) {
  return apiClient.post<TagInfo>('/v1/tab-sync/tags', payload)
}

/** 更新标签（名称/颜色） */
export function updateTag(tagId: number, payload: { name?: string; color?: string }) {
  return apiClient.put<TagInfo>(`/v1/tab-sync/tags/${tagId}`, payload)
}

/** 删除标签 */
export function deleteTag(tagId: number) {
  return apiClient.delete(`/v1/tab-sync/tags/${tagId}`)
}

/** 给工作组内标签页打标签 */
export function addTabTag(workspaceId: string, tabId: string, tagId: number) {
  return apiClient.post(`/v1/tab-sync/workspaces/${workspaceId}/tabs/${tabId}/tags`, { tagId })
}

/** 去掉标签页上的标签 */
export function removeTabTag(workspaceId: string, tabId: string, tagId: number) {
  return apiClient.delete(`/v1/tab-sync/workspaces/${workspaceId}/tabs/${tabId}/tags/${tagId}`)
}

/** 给工作组打标签 */
export function addWorkspaceTag(workspaceId: string, tagId: number) {
  return apiClient.post(`/v1/tab-sync/workspaces/${workspaceId}/tags`, { tagId })
}

/** 去掉工作组上的标签 */
export function removeWorkspaceTag(workspaceId: string, tagId: number) {
  return apiClient.delete(`/v1/tab-sync/workspaces/${workspaceId}/tags/${tagId}`)
}

/** 获取某个标签下包含的所有云端标签页 */
export function getTagTabs(tagId: number) {
  return apiClient.get<TagTabsData>(`/v1/tab-sync/tags/${tagId}/tabs`)
}
