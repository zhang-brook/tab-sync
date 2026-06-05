import { apiClient } from './client'
import type {
  SyncEventsRequest,
  SyncEventsResponse,
  StartupRequest,
  StartupResponse,
  RebuildRequest,
  RebuildResponse,
  SyncPullResponse,
} from '../types'

/** 增量事件同步 - 上传本地事件到后端 */
export function syncEvents(payload: SyncEventsRequest) {
  return apiClient.post<SyncEventsResponse>('/v1/tab-sync/sync/events', payload)
}

/** 启动对账 - 浏览器启动/扩展安装时与后端进行状态比对 */
export function syncStartup(payload: StartupRequest) {
  return apiClient.post<StartupResponse>('/v1/tab-sync/sync/startup', payload)
}

/** 拉取其他设备的变更 */
export function syncPull(deviceId: string, since: string) {
  return apiClient.get<SyncPullResponse>(
    `/v1/tab-sync/sync/pull?deviceId=${encodeURIComponent(deviceId)}&since=${encodeURIComponent(since)}`,
  )
}

/** 数据重建 - 用本地标签页覆盖服务端 */
export function rebuildData(payload: RebuildRequest) {
  return apiClient.post<RebuildResponse>('/v1/tab-sync/data/rebuild', payload)
}
