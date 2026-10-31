import { apiClient } from './client'
import type { RecycleBinTab } from '../types'

/** 获取回收站列表 */
export function getRecycleBin() {
  return apiClient.get<RecycleBinTab[]>('/v1/tab-sync/recyclebin')
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
