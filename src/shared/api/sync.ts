import { apiClient } from './client'
import type {
  SyncEventsRequest,
  SyncEventsResponse,
  SyncFullRequest,
  SyncFullResponse,
  SyncPullResponse,
} from '../types'

/** 增量事件同步 - 上传本地事件到后端 */
export function syncEvents(payload: SyncEventsRequest) {
  return apiClient.post<SyncEventsResponse>('/v1/tab-sync/sync/events', payload)
}

/** 全量状态对账 - 与后端进行完整的状态比对 */
export function syncFull(payload: SyncFullRequest) {
  return apiClient.post<SyncFullResponse>('/v1/tab-sync/sync/full', payload)
}

/** 拉取其他设备的变更 */
export function syncPull(deviceId: string, since: string) {
  return apiClient.get<SyncPullResponse>(
    `/v1/tab-sync/sync/pull?deviceId=${encodeURIComponent(deviceId)}&since=${encodeURIComponent(since)}`,
  )
}
