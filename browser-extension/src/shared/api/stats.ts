import { apiClient } from './client'
import type { DashboardStatsData } from '../types'

/** 管理面板概览统计：后端直接返回各项数量，无需拉取设备/工作组/标签列表 */
export function getDashboardStats() {
  return apiClient.get<DashboardStatsData>('/v1/tab-sync/stats')
}
