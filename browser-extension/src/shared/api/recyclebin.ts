import { apiClient } from './client'
import type { RecycleBinTab } from '../types'

/** 获取回收站列表 */
export function getRecycleBin() {
  return apiClient.get<RecycleBinTab[]>('/v1/tab-sync/recyclebin')
}

/** 恢复一条回收站标签页（统一恢复到「未分组」） */
export function restoreRecycleBinTab(id: number) {
  return apiClient.post<{ success: boolean }>(`/v1/tab-sync/recyclebin/${id}/restore`)
}

/** 彻底删除一条回收站标签页 */
export function deleteRecycleBinTab(id: number) {
  return apiClient.delete<{ success: boolean }>(`/v1/tab-sync/recyclebin/${id}`)
}

/** 清空回收站 */
export function emptyRecycleBin() {
  return apiClient.delete<{ success: boolean }>('/v1/tab-sync/recyclebin')
}
