import { useRouter } from 'vue-router'
import { dashboardTargetRoute, targetOfTag } from '../utils/dashboard-links'
import type { TabTagDisplay } from '../types/tab-list'

/** 管理面板内的实体跳转：标签与工作组共用同一套目标解析和路由参数 */
export function useDashboardNavigation() {
  const router = useRouter()

  function navigateToTag(tag: TabTagDisplay): void {
    const target = targetOfTag(tag)
    if (target) void router.push(dashboardTargetRoute(target))
  }

  function navigateToWorkspace(workspaceId: string): void {
    void router.push(dashboardTargetRoute({ name: 'workspaces', workspaceId }))
  }

  return { navigateToTag, navigateToWorkspace }
}
