import { apiClient } from './client'
import type { TabRecord } from '../types'

/** 分页查询标签页 */
export function getTabs(params: {
  status?: string
  search?: string
  deviceId?: string
  workspaceId?: string
  page?: number
  limit?: number
}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.deviceId) query.set('deviceId', params.deviceId)
  if (params.workspaceId) query.set('workspaceId', params.workspaceId)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  return apiClient.get<{ tabs: TabRecord[]; total: number; page: number }>(
    `/v1/tab-sync/tabs?${query.toString()}`
  )
}
