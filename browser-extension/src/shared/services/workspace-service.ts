import { callService } from './message'
import { storage, STORAGE_KEYS } from '../storage'
import type {
  Workspace,
  TabReference,
  WorkspaceTabPayload,
  WorkspaceTabsData,
  WorkspaceTabsGroupsData,
  WorkspaceTabsGroup,
  WorkspaceTabsSummaryData,
  SyncedTabPageData,
  TabHostsData,
} from '../types'
import type { TabTagMatch } from '../types/tab-list'

/** 「未分组」系统工作组的固定标识（见 server/internal/service/workspace.go） */
export const UNGROUPED_WORKSPACE_ID = 'ungrouped'

export interface WorkspaceListOptions {
  includeSystem?: boolean
  includeTabs?: boolean
}

/** 工作组列表。默认只取元信息，标签页按需通过 listWorkspaceTabs 拉取 */
export async function listWorkspaces(options: WorkspaceListOptions = {}): Promise<Workspace[]> {
  const data = await callService<{ workspaces: Workspace[] }>({
    action: 'GET_WORKSPACES',
    payload: options,
  })
  return data.workspaces
}

/** 单个工作组的标签页 */
export async function listWorkspaceTabs(workspaceId: string): Promise<TabReference[]> {
  const data = await callService<WorkspaceTabsData>({
    action: 'GET_WORKSPACE_TABS',
    payload: { workspaceId },
  })
  return data.tabs
}

/** 工作组自身及整棵子树的标签页（按工作区分组） */
export async function listWorkspaceTabGroups(workspaceId: string): Promise<WorkspaceTabsGroup[]> {
  const data = await callService<WorkspaceTabsGroupsData>({
    action: 'GET_WORKSPACE_TABS',
    payload: { workspaceId, recursive: true },
  })
  return data.groups
}

export async function createWorkspace(payload: {
  name: string
  color: string
  icon?: string
  description?: string
  parentId?: string
  collapsed?: boolean
}): Promise<Workspace> {
  const data = await callService<{ workspace: Workspace }>({
    action: 'CREATE_WORKSPACE',
    payload,
  })
  return data.workspace
}

export async function updateWorkspace(payload: {
  id: string
  name?: string
  color?: string
  icon?: string
  description?: string
  parentId?: string
  collapsed?: boolean
  tabs?: WorkspaceTabPayload[]
}): Promise<void> {
  await callService({ action: 'UPDATE_WORKSPACE', payload })
}

export async function duplicateWorkspace(id: string): Promise<Workspace> {
  const data = await callService<{ workspace: Workspace }>({
    action: 'DUPLICATE_WORKSPACE',
    payload: { id },
  })
  return data.workspace
}

export async function moveWorkspace(
  id: string,
  targetId: string,
  position: 'before' | 'after' | 'inner',
): Promise<void> {
  await callService({ action: 'MOVE_WORKSPACE', payload: { id, targetId, position } })
}

export async function deleteWorkspace(id: string, defaultWorkspaceId?: string): Promise<void> {
  await callService({ action: 'DELETE_WORKSPACE', payload: { id, defaultWorkspaceId } })
}

export async function openWorkspace(
  id: string,
  options: { tabIds?: string[]; newWindow?: boolean; asTabGroup?: boolean } = {},
): Promise<number> {
  const data = await callService<{ opened?: number }>({
    action: 'OPEN_WORKSPACE',
    payload: { id, ...options },
  })
  return data?.opened ?? 0
}

export interface WorkspaceSaveResult {
  added: number
  skipped: number
}

/** 把标签页加入工作组（后端按 URL 去重）；closeAfterAdd 时由 background 关闭原标签页并弹通知 */
export async function addTabsToWorkspace(
  workspaceId: string,
  tabs: WorkspaceTabPayload[],
  options: { closeAfterAdd?: boolean } = {},
): Promise<WorkspaceSaveResult> {
  const data = await callService<WorkspaceSaveResult>({
    action: 'ADD_TABS_TO_WORKSPACE',
    payload: { workspaceId, tabs, closeAfterAdd: options.closeAfterAdd ?? false },
  })
  return { added: data.added ?? 0, skipped: data.skipped ?? 0 }
}

export async function moveWorkspaceTab(workspaceId: string, tabId: string, newIndex: number): Promise<void> {
  await callService({ action: 'MOVE_WORKSPACE_TAB', payload: { workspaceId, tabId, newIndex } })
}

/** 复制标签页到目标工作组末尾（源标签页不变） */
export async function copyWorkspaceTab(workspaceId: string, tabId: string): Promise<void> {
  await callService({ action: 'COPY_WORKSPACE_TAB', payload: { workspaceId, tabId } })
}

export async function updateWorkspaceTab(
  workspaceId: string,
  tabId: string,
  payload: {
    addedAt?: string
    displayName?: string
    url?: string
    title?: string
    favIconUrl?: string
    description?: string
  },
): Promise<void> {
  await callService({
    action: 'UPDATE_WORKSPACE_TAB',
    payload: { workspaceId, tabId, ...payload },
  })
}

export async function removeWorkspaceTab(workspaceId: string, tabId: string): Promise<void> {
  await callService({ action: 'REMOVE_WORKSPACE_TAB', payload: { workspaceId, tabId } })
}

export async function addWorkspaceTabByUrl(workspaceId: string, url: string, title?: string): Promise<void> {
  await callService({ action: 'ADD_WORKSPACE_TAB_BY_URL', payload: { workspaceId, url, title } })
}

export async function listSyncedTabs(params: {
  page?: number
  pageSize?: number
  keyword?: string
  includeSystem?: boolean
  scheme?: string
  domain?: string
  exact?: boolean
  tagIds?: number[]
  tagMatch?: TabTagMatch
  sort?: string
  order?: string
}): Promise<SyncedTabPageData> {
  return callService<SyncedTabPageData>({ action: 'GET_SYNCED_TABS', payload: params })
}

/** 标签页域名聚合（「标签页」页左侧域名树） */
export async function listTabHosts(params: { scheme?: string; keyword?: string; tagIds?: number[]; tagMatch?: TabTagMatch } = {}): Promise<TabHostsData> {
  return callService<TabHostsData>({ action: 'GET_TAB_HOSTS', payload: params })
}

export async function getWorkspaceTabsSummary(): Promise<WorkspaceTabsSummaryData['summaries']> {
  const data = await callService<WorkspaceTabsSummaryData>({ action: 'GET_WORKSPACE_TABS_SUMMARY' })
  return data.summaries
}

/** 当前设置的默认收藏工作组 ID（空值回退「未分组」） */
export async function getDefaultWorkspaceId(): Promise<string> {
  return (await storage.get(STORAGE_KEYS.DEFAULT_WORKSPACE_ID)) || UNGROUPED_WORKSPACE_ID
}

/** 当前默认收藏工作组；未登录或后端不可用时返回 null */
export async function getDefaultWorkspace(): Promise<Workspace | null> {
  const id = await getDefaultWorkspaceId()
  const workspaces = await listWorkspaces({ includeSystem: true })
  return (
    workspaces.find((w) => w.id === id) ??
    workspaces.find((w) => w.id === UNGROUPED_WORKSPACE_ID) ??
    null
  )
}
