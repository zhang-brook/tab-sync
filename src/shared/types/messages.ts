import type { TabRecord } from './tab'
import type { Workspace } from './workspace'
import type { Device } from './device'
import type { AuthState, AuthUser } from './auth'
import type { SyncStatus } from './sync'

// ============ 消息 Action 定义 ============

/** 所有支持的消息 Action */
export type MessageAction =
  | 'GET_STATE'
  | 'LOGIN_WITH_TOKEN'
  | 'LOGIN_WITH_CREDENTIALS'
  | 'LOGOUT'
  | 'SYNC_NOW'
  | 'GET_TABS'
  | 'CLOSE_TAB'
  | 'CLOSE_TABS_BATCH'
  | 'REOPEN_TAB'
  | 'GET_WORKSPACES'
  | 'CREATE_WORKSPACE'
  | 'UPDATE_WORKSPACE'
  | 'DELETE_WORKSPACE'
  | 'OPEN_WORKSPACE'
  | 'OPEN_DASHBOARD'

// ============ 请求消息定义 ============

export interface GetStateMessage {
  action: 'GET_STATE'
}

export interface LoginWithTokenMessage {
  action: 'LOGIN_WITH_TOKEN'
  payload: { token: string }
}

export interface LoginWithCredentialsMessage {
  action: 'LOGIN_WITH_CREDENTIALS'
  payload: { username: string; password: string }
}

export interface LogoutMessage {
  action: 'LOGOUT'
}

export interface SyncNowMessage {
  action: 'SYNC_NOW'
}

export interface GetTabsMessage {
  action: 'GET_TABS'
  payload?: {
    status?: 'open' | 'closed' | 'archived'
    search?: string
    deviceId?: string
    workspaceId?: string
  }
}

export interface CloseTabMessage {
  action: 'CLOSE_TAB'
  payload: { tabId: string }
}

export interface CloseTabsBatchMessage {
  action: 'CLOSE_TABS_BATCH'
  payload: { tabIds: string[] }
}

export interface ReopenTabMessage {
  action: 'REOPEN_TAB'
  payload: { url: string }
}

export interface GetWorkspacesMessage {
  action: 'GET_WORKSPACES'
}

export interface CreateWorkspaceMessage {
  action: 'CREATE_WORKSPACE'
  payload: { name: string; color: string; icon?: string; tabIds: string[] }
}

export interface UpdateWorkspaceMessage {
  action: 'UPDATE_WORKSPACE'
  payload: { id: string; name?: string; color?: string; icon?: string; tabIds?: string[] }
}

export interface DeleteWorkspaceMessage {
  action: 'DELETE_WORKSPACE'
  payload: { id: string }
}

export interface OpenWorkspaceMessage {
  action: 'OPEN_WORKSPACE'
  payload: { id: string; tabIds?: string[]; newWindow?: boolean }
}

export interface OpenDashboardMessage {
  action: 'OPEN_DASHBOARD'
}

/** 所有请求消息的联合类型 */
export type ExtensionMessage =
  | GetStateMessage
  | LoginWithTokenMessage
  | LoginWithCredentialsMessage
  | LogoutMessage
  | SyncNowMessage
  | GetTabsMessage
  | CloseTabMessage
  | CloseTabsBatchMessage
  | ReopenTabMessage
  | GetWorkspacesMessage
  | CreateWorkspaceMessage
  | UpdateWorkspaceMessage
  | DeleteWorkspaceMessage
  | OpenWorkspaceMessage
  | OpenDashboardMessage

// ============ 响应定义 ============

/** 通用响应包装 */
export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** GET_STATE 响应数据 */
export interface StateData {
  auth: AuthState
  syncStatus: SyncStatus
  lastSyncAt: string | null
  /** 待同步事件数量 */
  pendingCount: number
  tabCount: {
    open: number
    closed: number
  }
}

/** GET_TABS 响应数据 */
export interface TabsData {
  tabs: TabRecord[]
}

/** GET_WORKSPACES 响应数据 */
export interface WorkspacesData {
  workspaces: Workspace[]
}

/** LOGIN 响应数据 */
export interface LoginData {
  user: AuthUser
}

/** GET_DEVICES 响应数据 */
export interface DevicesData {
  devices: Device[]
}
