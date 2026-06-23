import type { TabRecord } from './tab'
import type { Workspace } from './workspace'
import type { Device } from './device'
import type { AuthState, AuthUser } from './auth'

// ============ 消息 Action 定义 ============

/** 所有支持的消息 Action */
export type MessageAction =
  | 'GET_STATE'
  | 'LOGIN_WITH_TOKEN'
  | 'LOGIN_WITH_CREDENTIALS'
  | 'LOGOUT'
  | 'GET_TABS'
  | 'CLOSE_TAB'
  | 'CLOSE_TABS_BATCH'
  | 'REOPEN_TAB'
  | 'GET_WORKSPACES'
  | 'CREATE_WORKSPACE'
  | 'UPDATE_WORKSPACE'
  | 'DELETE_WORKSPACE'
  | 'OPEN_WORKSPACE'
  | 'ADD_TABS_TO_WORKSPACE'
  | 'MOVE_WORKSPACE_TAB'
  | 'REMOVE_WORKSPACE_TAB'
  | 'OPEN_DASHBOARD'
  | 'GET_DEVICES'
  | 'GET_WORKSPACE_TABS_SUMMARY'

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

/** 标签页数据（前端传给后端创建工作组的标签页信息） */
export interface WorkspaceTabPayload {
  /** 标签页 UUID（更新已有标签页时传入，新建时可不传由后端生成） */
  tabId?: string
  url: string
  title: string
  favIconUrl: string
  /** Chrome 本地 tabId */
  chromeTabId: number
}

export interface CreateWorkspaceMessage {
  action: 'CREATE_WORKSPACE'
  payload: { name: string; color: string; icon?: string; tabs: WorkspaceTabPayload[] }
}

export interface UpdateWorkspaceMessage {
  action: 'UPDATE_WORKSPACE'
  payload: { id: string; name?: string; color?: string; icon?: string; tabs?: WorkspaceTabPayload[] }
}

export interface DeleteWorkspaceMessage {
  action: 'DELETE_WORKSPACE'
  payload: { id: string }
}

export interface OpenWorkspaceMessage {
  action: 'OPEN_WORKSPACE'
  payload: { id: string; tabIds?: string[]; newWindow?: boolean; asTabGroup?: boolean }
}

export interface OpenDashboardMessage {
  action: 'OPEN_DASHBOARD'
}

export interface GetDevicesMessage {
  action: 'GET_DEVICES'
}

export interface GetWorkspaceTabsSummaryMessage {
  action: 'GET_WORKSPACE_TABS_SUMMARY'
}

/** 将选中的标签页加入现有工作组 */
export interface AddTabsToWorkspaceMessage {
  action: 'ADD_TABS_TO_WORKSPACE'
  payload: { workspaceId: string; tabs: WorkspaceTabPayload[] }
}

/** 从工作组中移除指定标签页 */
export interface RemoveWorkspaceTabMessage {
  action: 'REMOVE_WORKSPACE_TAB'
  payload: {
    /** 工作组 UUID */
    workspaceId: string
    /** 要移除的标签页 UUID */
    tabId: string
  }
}

/** 移动标签页到目标工作组指定位置（精简版，支持同组排序和跨组移动） */
export interface MoveWorkspaceTabMessage {
  action: 'MOVE_WORKSPACE_TAB'
  payload: {
    /** 目标工作组 UUID */
    workspaceId: string
    /** 要移动的标签页 UUID */
    tabId: string
    /** 目标排序位置（0-based） */
    newIndex: number
  }
}

/** 所有请求消息的联合类型 */
export type ExtensionMessage =
  | GetStateMessage
  | LoginWithTokenMessage
  | LoginWithCredentialsMessage
  | LogoutMessage
  | GetTabsMessage
  | CloseTabMessage
  | CloseTabsBatchMessage
  | ReopenTabMessage
  | GetWorkspacesMessage
  | CreateWorkspaceMessage
  | UpdateWorkspaceMessage
  | DeleteWorkspaceMessage
  | OpenWorkspaceMessage
  | AddTabsToWorkspaceMessage
  | MoveWorkspaceTabMessage
  | RemoveWorkspaceTabMessage
  | OpenDashboardMessage
  | GetDevicesMessage
  | GetWorkspaceTabsSummaryMessage

// ============ 响应定义 ============

/** 通用响应包装 */
export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  /** 是否为认证错误（Token 过期等），UI 可据此跳转登录 */
  authError?: boolean
}

/** GET_STATE 响应数据 */
export interface StateData {
  auth: AuthState
  tabCount: {
    open: number
    frozen: number
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

/** GET_WORKSPACE_TABS_SUMMARY 响应数据 */
export interface WorkspaceTabsSummaryData {
  summaries: Array<{
    workspaceId: string
    workspaceName: string
    workspaceColor: string
    tabs: Array<{ tabId: string; url: string }>
  }>
}
