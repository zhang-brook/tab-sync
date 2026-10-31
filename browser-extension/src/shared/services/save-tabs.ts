import { ServiceError } from './message'
import { toWorkspaceTabPayload, type TabPayloadSource } from './local-tabs'
import {
  addTabsToWorkspace,
  getDefaultWorkspaceId,
  UNGROUPED_WORKSPACE_ID,
} from './workspace-service'
import type { WorkspaceTabPayload } from '../types'

export interface SaveTabsOutcome {
  added: number
  skipped: number
  /** 实际提交的可收藏标签页数量 */
  requested: number
}

/** 过滤掉不可收藏页面（浏览器内置页等）并转为后端载荷 */
export function buildTabPayloads(tabs: readonly TabPayloadSource[]): WorkspaceTabPayload[] {
  return tabs
    .map(toWorkspaceTabPayload)
    .filter((t): t is WorkspaceTabPayload => t != null)
}

/** 把本地标签页保存到指定工作组；closeAfterAdd 时由 background 关闭原标签页并弹通知 */
export async function saveTabsToWorkspace(
  workspaceId: string,
  tabs: readonly TabPayloadSource[],
  options: { closeAfterAdd?: boolean } = {},
): Promise<SaveTabsOutcome> {
  const payloads = buildTabPayloads(tabs)
  if (payloads.length === 0) {
    throw new ServiceError('当前页面类型不支持收藏（如浏览器内置页面）')
  }
  const res = await addTabsToWorkspace(workspaceId, payloads, options)
  return { added: res.added, skipped: res.skipped, requested: payloads.length }
}

/** 保存到当前默认收藏工作组；未设置默认时回退「未分组」 */
export async function saveTabsToDefaultWorkspace(
  tabs: readonly TabPayloadSource[],
): Promise<SaveTabsOutcome & { workspaceId: string }> {
  const workspaceId = await getDefaultWorkspaceId()
  const outcome = await saveTabsToWorkspace(workspaceId, tabs)
  return { ...outcome, workspaceId }
}

/** 保存到「未分组」系统工作组 */
export async function saveTabsToUngrouped(
  tabs: readonly TabPayloadSource[],
): Promise<SaveTabsOutcome> {
  return saveTabsToWorkspace(UNGROUPED_WORKSPACE_ID, tabs)
}
