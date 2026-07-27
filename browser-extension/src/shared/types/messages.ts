import type { TabRecord } from './tab'
import type { Workspace, TagInfo } from './workspace'
import type { Device } from './device'
import type { AuthState } from './auth'

// ============ 消息 Action 定义 ============

/** 所有支持的消息 Action */
export type MessageAction =
  | 'GET_STATE'
  | 'LOGIN_WITH_TOKEN'
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
  | 'DEREGISTER_DEVICE'
  | 'GET_WORKSPACE_TABS_SUMMARY'
  | 'CHECK_VERSION'
  | 'SET_CONNECTION_MODE'
  | 'GET_TAGS'
  | 'CREATE_TAG'
  | 'DELETE_TAG'
  | 'ADD_TAB_TAG'
  | 'REMOVE_TAB_TAG'
  | 'ADD_WORKSPACE_TAG'
  | 'REMOVE_WORKSPACE_TAG'
  | 'GET_TAG_TABS'

// ============ 请求消息定义 ============

export interface GetStateMessage {
  action: 'GET_STATE'
}

export interface LoginWithTokenMessage {
  action: 'LOGIN_WITH_TOKEN'
  payload: { token: string }
}

export interface LogoutMessage {
  action: 'LOGOUT'
}

export interface CheckVersionMessage {
  action: 'CHECK_VERSION'
}

export interface SetConnectionModeMessage {
  action: 'SET_CONNECTION_MODE'
  payload: { mode: 'lightweight' | 'zhige'; apiBaseUrl?: string }
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
  /** 标签页公开标识：后端主键 ID（字符串）。更新已有标签页时传入以增量匹配；新建时不传由数据库自增生成 */
  tabId?: string
  url: string
  title: string
  favIconUrl: string
  /** Chrome 本地 tabId */
  chromeTabId: number
}

export interface CreateWorkspaceMessage {
  action: 'CREATE_WORKSPACE'
  /** 创建时不携带标签页；标签页通过 UPDATE_WORKSPACE / ADD_TABS_TO_WORKSPACE 添加 */
  payload: { name: string; color: string; icon?: string; parentId?: string }
}

export interface UpdateWorkspaceMessage {
  action: 'UPDATE_WORKSPACE'
  payload: { id: string; name?: string; color?: string; icon?: string; parentId?: string; tabs?: WorkspaceTabPayload[] }
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

export interface DeregisterDeviceMessage {
  action: 'DEREGISTER_DEVICE'
  payload: { deviceId: string }
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

// ============ 标签相关消息 ============

/** 获取标签列表（可按 scope 过滤） */
export interface GetTagsMessage {
  action: 'GET_TAGS'
  payload?: { scope?: 'tab' | 'workspace' }
}

/** 创建标签 */
export interface CreateTagMessage {
  action: 'CREATE_TAG'
  payload: { name: string; color?: string; scope: 'tab' | 'workspace' }
}

/** 删除标签 */
export interface DeleteTagMessage {
  action: 'DELETE_TAG'
  payload: { tagId: number }
}

/** 给工作组内标签页打标签 */
export interface AddTabTagMessage {
  action: 'ADD_TAB_TAG'
  payload: { workspaceId: string; tabId: string; tagId: number }
}

/** 去掉标签页上的标签 */
export interface RemoveTabTagMessage {
  action: 'REMOVE_TAB_TAG'
  payload: { workspaceId: string; tabId: string; tagId: number }
}

/** 给工作组打标签 */
export interface AddWorkspaceTagMessage {
  action: 'ADD_WORKSPACE_TAG'
  payload: { workspaceId: string; tagId: number }
}

/** 去掉工作组上的标签 */
export interface RemoveWorkspaceTagMessage {
  action: 'REMOVE_WORKSPACE_TAG'
  payload: { workspaceId: string; tagId: number }
}

/** 获取某个标签下包含的所有云端标签页 */
export interface GetTagTabsMessage {
  action: 'GET_TAG_TABS'
  payload: { tagId: number }
}

/** 所有请求消息的联合类型 */
export type ExtensionMessage =
  | GetStateMessage
  | LoginWithTokenMessage
  | LogoutMessage
  | CheckVersionMessage
  | SetConnectionModeMessage
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
  | DeregisterDeviceMessage
  | GetWorkspaceTabsSummaryMessage
  | GetTagsMessage
  | CreateTagMessage
  | DeleteTagMessage
  | AddTabTagMessage
  | RemoveTabTagMessage
  | AddWorkspaceTagMessage
  | RemoveWorkspaceTagMessage
  | GetTagTabsMessage

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
  connectionMode?: string | null
}

/** GET_TABS 响应数据 */
export interface TabsData {
  tabs: TabRecord[]
}

/** GET_WORKSPACES 响应数据 */
export interface WorkspacesData {
  workspaces: Workspace[]
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

/** GET_TAGS 响应数据 */
export interface TagsData {
  tags: TagInfo[]
}

/** 标签下的云端标签页条目 */
export interface TagTabItem {
  tabId: number
  url: string
  title: string
  favIconUrl: string
  workspaceId: string
  workspaceName: string
}

/** GET_TAG_TABS 响应数据 */
export interface TagTabsData {
  tabs: TagTabItem[]
}
