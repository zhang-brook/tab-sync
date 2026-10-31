import { DASHBOARD_URL } from './pages'
import type { TabTagDisplay } from '../types/tab-list'

/** 管理面板内的实体详情页：标签 / 工作组 */
export type DashboardTarget =
  | { name: 'tags'; tagId: number }
  | { name: 'workspaces'; workspaceId: string }

/** 行内标签 → 详情页目标：工作组标签跳工作组，其余跳标签 */
export function targetOfTag(tag: TabTagDisplay): DashboardTarget | null {
  if (tag.kind === 'workspace') {
    return tag.key ? { name: 'workspaces', workspaceId: tag.key } : null
  }
  return tag.id != null ? { name: 'tags', tagId: tag.id } : null
}

/** 详情页目标 → 管理面板路由参数（面板内 router.push 用） */
export function dashboardTargetRoute(target: DashboardTarget) {
  return target.name === 'tags'
    ? { path: '/tags', query: { tagId: String(target.tagId) } }
    : { path: '/workspaces', query: { workspaceId: target.workspaceId } }
}

/** 详情页目标 → 完整地址（侧边栏打开管理面板标签页用） */
export function dashboardTargetUrl(target: DashboardTarget): string {
  const hash =
    target.name === 'tags'
      ? `#/tags?tagId=${encodeURIComponent(target.tagId)}`
      : `#/workspaces?workspaceId=${encodeURIComponent(target.workspaceId)}`
  return DASHBOARD_URL + hash
}
