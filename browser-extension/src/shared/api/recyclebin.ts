import { apiClient } from './client'
import type { RecycleBinData } from '../types'

export interface RecycleBinQuery {
  page?: number
  pageSize?: number
  /** 排序字段：名称 / 移入回收站时间 / 原标签页添加时间 */
  sort?: 'name' | 'deletedAt' | 'addedAt'
  order?: 'asc' | 'desc'
}

/** 分页获取回收站列表，支持按名称/删除时间/添加时间排序 */
export function getRecycleBin(params: RecycleBinQuery = {}) {
  const query = new URLSearchParams()
  if (params.page != null) query.set('page', String(params.page))
  if (params.pageSize != null) query.set('pageSize', String(params.pageSize))
  if (params.sort) query.set('sort', params.sort)
  if (params.order) query.set('order', params.order)
  const qs = query.toString()
  return apiClient.get<RecycleBinData>(`/v1/tab-sync/recyclebin${qs ? `?${qs}` : ''}`)
}

/** 批量恢复回收站标签页到指定工作组（workspaceId 为空时回退「未分组」） */
export function restoreRecycleBinTabs(ids: number[], workspaceId?: string) {
  return apiClient.post<{ success: boolean; restored: number }>('/v1/tab-sync/recyclebin/restore', {
    ids,
    workspaceId,
  })
}

/** 彻底删除一条回收站标签页 */
export function deleteRecycleBinTab(id: number) {
  return apiClient.delete<{ success: boolean }>(`/v1/tab-sync/recyclebin/${id}`)
}

/** 清空回收站 */
export function emptyRecycleBin() {
  return apiClient.delete<{ success: boolean }>('/v1/tab-sync/recyclebin')
}
