import { useRouter } from 'vue-router'
import { dashboardTargetRoute } from '../utils/dashboard-links'

/** 管理面板内跳转到工作组详情 */
export function useDashboardNavigation() {
  const router = useRouter()

  function navigateToWorkspace(workspaceId: string): void {
    void router.push(dashboardTargetRoute({ name: 'workspaces', workspaceId }))
  }

  return { navigateToWorkspace }
}
