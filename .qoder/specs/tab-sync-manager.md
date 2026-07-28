# Tab Sync 设计规范 (tab-sync-manager)

> 本文档描述 Tab Sync 扩展的**当前实现架构**（单一后端数据源 + MV3 扩展）。
> 早期设计中的「本地标签页自治 / sync-engine / tab-monitor / popup」等方案已废弃，
> 详见第 8 节「已移除 / 废弃」。

---

## 1. 产品定位

Chrome 浏览器标签页管理扩展，支持：标签页同步、工作组（Workspace）管理、标签（Tag）分类、回收站、多设备协作。

- **扩展**: Chrome Manifest V3 + Vue 3 (Composition API) + Element Plus + Vite + CRXJS + TypeScript
- **后端**: 轻量服务 `server/`（Go + Gin + SQLite），REST API 为**唯一真实数据源**
- **交互形态**: SidePanel 主交互 + Dashboard 完整管理 SPA，二者均运行在扩展进程内

---

## 2. 总体架构

```
                  ┌─────────────── 扩展进程 ───────────────┐
  浏览器标签页 ──▶ │  SidePanel (登录/同步快捷)             │
                  │  Dashboard (完整管理 SPA，独立标签页)   │
                  │        │ sendMessage                    │
                  │        ▼                                │
                  │  Background SW (消息路由，无业务数据)   │
                  └───────────────┬────────────────────────┘
                                  │ REST API (HTTPS, Bearer Token)
                                  ▼
                      轻量后端 server/ (Go + Gin + SQLite)
```

要点：
- **后端是唯一数据源**。扩展内不保存任何业务数据（工作组、标签、回收站均来自后端）。
- **Background Service Worker 只做消息分发**，不缓存标签页状态，不做本地同步引擎。
- 所有 UI 通过 `chrome.runtime.sendMessage` 与 Background 通信，Background 调用 `shared/api` 访问后端。

---

## 3. 后端 API (`server/`)

所有路由挂在 `/v1/tab-sync` 下（公开页面 `/setup`、`/docs` 挂在 `/api` 下）。

### 3.1 路由分组

| 分组 | 中间件 | 路由 |
|------|--------|------|
| 公开 | 无 | `GET /version`、`POST /auth/verify-token`、`GET /api/setup`、`POST /api/setup`、`GET /api/setup/status`、`POST /api/admin/login`、`GET /api/docs` |
| 认证 | `TokenAuth` | `GET/POST/DELETE /devices`、`GET/POST /workspaces`、`GET/PUT/DELETE /workspaces/:id`、`GET/POST /workspaces/:id/tabs`、`PUT /workspaces/:id/tabs/move`、`PATCH /workspaces/:id/tabs/:tabId`、`DELETE /workspaces/:id/tabs/:tabId`、`POST/GET /sync`（push/pull，预留）、`GET /sse/events`（预留）、`POST /tool-calling`（织个网上游对接，预留）、`GET/POST/DELETE /tags`、`POST /tags/:id/tabs`、`GET /tags/:id/tabs`、`GET/POST/DELETE /recyclebin`、`POST /recyclebin/restore`、`DELETE /recyclebin/empty` |
| 管理 | `AdminOrJWTAuth` | `GET/POST/DELETE /admin/tokens`、`GET /admin/stats` |

### 3.2 数据模型（核心）

- **Workspace**: `id`(后端主键)、`name`、`color`、`icon`、`parentId`(支持层级)、`createdAt`、`updatedAt`
- **WorkspaceTab**: `tabId`(后端主键，非 chrome 数字 ID)、`url`、`title`、`favIconUrl`、`chromeTabId`、`addedAt`、`displayName`
- **Device**: `deviceId`、`name`、`platform`、`lastSeen`
- **Tag**: `id`、`name`、`color`、`scope`(`'tab'` | `'workspace'`)
- **RecycleBinTab**: `id`、`originalWorkspaceId`、`originalWorkspaceName`、`url`、`title`、`displayName`、`favIconUrl`、`deletedAt`

### 3.3 版本协商

`GET /version` 返回（camelCase）：`serverVersion`、`minExtVersion`、`maxExtVersion`、`versionMap`。
扩展通过 `CHECK_VERSION` 消息拉取并与自身版本做**数值比较**（`compareVersions`，逐段比较 x.y.z）。

---

## 4. 扩展消息协议 (`shared/types/messages.ts`)

UI → Background 统一消息：`{ action: MessageAction, payload? }`。
Background 统一响应：`{ success: boolean, data?, error?, authError?: boolean }`。
UI 读取响应必须用可选链 `?.` / 空值合并 `??` 防御 `undefined`。

### 4.1 消息动作清单

| 分组 | action |
|------|--------|
| 会话 / 版本 | `GET_STATE`、`LOGIN_WITH_TOKEN`、`LOGOUT`、`CHECK_VERSION`、`SET_CONNECTION_MODE` |
| 工作组 | `GET_WORKSPACES`、`CREATE_WORKSPACE`、`UPDATE_WORKSPACE`、`DELETE_WORKSPACE`、`OPEN_WORKSPACE`、`ADD_TABS_TO_WORKSPACE`、`MOVE_WORKSPACE_TAB`、`UPDATE_WORKSPACE_TAB`、`REMOVE_WORKSPACE_TAB`、`GET_WORKSPACE_TABS_SUMMARY` |
| 标签 | `GET_TAGS`、`CREATE_TAG`、`DELETE_TAG`、`ADD_TAB_TAG`、`REMOVE_TAB_TAG`、`ADD_WORKSPACE_TAG`、`REMOVE_WORKSPACE_TAG`、`GET_TAG_TABS` |
| 回收站 | `GET_RECYCLE_BIN`、`RESTORE_RECYCLE_BIN_TAB`、`DELETE_RECYCLE_BIN_TAB`、`EMPTY_RECYCLE_BIN` |
| 设备 / 界面 | `GET_DEVICES`、`DEREGISTER_DEVICE`、`OPEN_DASHBOARD` |

> 分发集中在 `background/message-handler.ts` 的 `handleMessage()` 单一切面，
> 不存在按 UI 模块分散的 handler。

---

## 5. 认证与连接模式

- **Token 风格**: `AUTH_TOKEN` 直接存 Bearer Token，无账号密码 / 无 refresh。
- **连接模式** `CONNECTION_MODE`:
  - `'lightweight'`：连接本地轻量后端，`API_BASE_URL` 设为用户填写的服务器地址（持久化在 `chrome.storage.local`）。
  - `'zhige'`：预留的「织个网」上游对接模式，当前未启用。
- **登录流程**: SidePanel 的 `LoginPanel` 收集「服务器地址 + Token」→ `LOGIN_WITH_TOKEN` → 后端 `verify-token` → 通过则保存 `AUTH_TOKEN`，失败则提示。
- **Token 生成**: 服务端 `/setup` 初始化向导，或管理后台 `/v1/tab-sync/admin/tokens` 的 `GenerateToken`。
- **401 处理**: 任何 API 返回 401 → 标记 `authError`，UI 弹登录遮罩，本地点清除认证态（无续签）。

---

## 6. UI 模块

### 6.1 SidePanel (`src/sidepanel/`)
主交互面板：登录（由废弃的 popup 迁移而来）、标签页树、快速加入工作组、保存并关闭。

### 6.2 Dashboard (`src/dashboard/`, 独立标签页)
完整管理 SPA（Vue Router + Element Plus），通过 `OPEN_DASHBOARD` 在新标签页打开：
- `DashboardView` 概览
- `TabsView` 本地标签页（搜索 / 筛选 / 批量）
- `SyncedView` 已同步标签页
- `WorkspacesView` 工作组（CRUD + 恢复打开）
- `TagsView` 标签管理
- `RecycleBinView` 回收站
- `DevicesView` 多设备
- `SettingsView` 设置（认证 / 连接 / 数据）

### 6.3 快捷键
`chrome.commands` 的 `save-and-close`（Shift+Alt+S）：把当前标签页加入默认工作组（`DEFAULT_WORKSPACE_ID`）后关闭当前标签。

### 6.4 工具栏入口
`chrome.action.onClicked` 打开 SidePanel（扩展未配置 popup）。

---

## 7. 关键实现细节

- **工作组打开统一「重新打开」**：工作组 tab 的公开标识是后端主键 `tabId`，不绑定本地 `chromeTabId`，因此一律按新标签打开，不做本地「已打开检测」。
- **标签组颜色映射**：`mapHexToTabGroupColor` 把 16 进制色值映射到 Chrome 有限的 `TabGroupColor` 枚举。
- **Service Worker 陷阱**：状态持久化到 `chrome.storage.local`；定时任务用 `chrome.alarms`；事件监听器顶层同步注册；`sendMessage` 异步回调用 `.catch()` 兜底。
- **消息响应可空**：见 §4 防御性编程要求。

---

## 8. 已移除 / 废弃（对比旧设计）

以下组件在早期设计中存在，已在实际实现中删除（因为后端成为唯一数据源，本地自治逻辑全部失效）：

| 已移除 | 原用途 | 移除原因 |
|--------|--------|----------|
| `background/tab-monitor.ts` | 监听 tab 事件写入 `chrome.storage.session` 的 `pending_events` 队列 | 队列无人消费，长期会话逼近存储配额 |
| `background/sync-engine.ts` | 本地全量扫描 + 与后端双向同步 | 后端为单一数据源，无需本地引擎 |
| `popup/` 目录 + manifest `default_popup` | 点击图标弹出的小窗 | 改为 SidePanel（`chrome.action.openPopup` 因无 popup 必失败） |
| `shared/types/tab.ts` (`TabRecord` 等) | 本地标签页数据结构 | 业务数据全在后端 |
| 消息 `GET_TABS` / `CLOSE_TAB` / `CLOSE_TABS_BATCH` / `REOPEN_TAB` / `SYNC_NOW` / `LOGIN_WITH_CREDENTIALS` | 本地标签管理 + 本地登录 | 无发送方，已无对应功能 |
| `chrome.storage.session` 的 `tabId↔UUID` 映射、`pendingReopens` 去重 | 工作组恢复去重 | 工作组 tab 不再与本地 chromeTabId 绑定 |
| 相关死代码：`updateDevice`/`deviceHeartbeat`、`getPlatformCode`、`isSelfOrDescendant`、`nowISO`/`sanitizeFavIconUrl`、`debounce.ts`、`constants.ts` | 被上述功能依赖 | 零引用 |

---

## 9. 后续方向（预留）

- `GET /sse/events` 服务端 SSE 已建，但扩展侧 SSE 客户端尚未启用（用于后续实时推送 / 织个网上游）。
- `POST /sync`（push/pull）、`POST /tool-calling`（织个网对接）目前为预留接口。
- 可优化：扩展图标 Badge 显示同步状态；补充 ESLint + Prettier 统一风格。
