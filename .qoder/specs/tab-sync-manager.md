# SpiderMemos Tab Sync - Chrome Extension Design Spec

## Context

用户需要一个浏览器标签页管理扩展，能够将本地浏览器的所有标签页信息（ID、URL、标题、图标、打开时间、最近访问时间）实时同步到自定义后端，支持多设备共享、工作组管理、历史标签页找回等功能。后端尚未实现，需要同时设计 OpenAPI 接口规范。

**技术栈**: Vue 3 (Composition API) + Element Plus + Vite + CRXJS + TypeScript + Chrome Manifest V3

---

## 1. Chrome Extension API 速览

### chrome.tabs (权限: `tabs`)
| 类别 | API | 用途 |
|------|-----|------|
| 方法 | `tabs.query(queryInfo)` | 查询符合条件的标签页 |
| 方法 | `tabs.get(tabId)` | 获取指定标签页信息 |
| 方法 | `tabs.create({url, active, windowId})` | 创建新标签页 |
| 方法 | `tabs.remove(tabId \| tabIds[])` | 关闭标签页 |
| 方法 | `tabs.update(tabId, {url, active})` | 更新标签页属性 |
| 方法 | `tabs.reload(tabId)` | 重新加载标签页 |
| 事件 | `tabs.onCreated` | 新标签页创建时触发 |
| 事件 | `tabs.onRemoved` | 标签页关闭时触发 |
| 事件 | `tabs.onUpdated` | 标签页 URL/标题/状态变化时触发 |
| 事件 | `tabs.onActivated` | 切换到某标签页时触发 |
| 事件 | `tabs.onMoved` | 标签页在窗口内移动时触发 |

**Tab 对象关键属性**: `id`, `windowId`, `url`, `title`, `favIconUrl`, `status` ('loading'|'complete'), `active`, `index`, `pinned`

### chrome.storage (权限: `storage`)
| 区域 | 容量 | 特点 |
|------|------|------|
| `storage.local` | 10MB | 本地持久化，不跨设备 |
| `storage.sync` | 100KB | 跨 Chrome 账户同步，有写入频率限制 |
| `storage.session` | 10MB | 仅 Service Worker 会话期间存在 |

方法: `get()`, `set()`, `remove()`, `clear()`, `onChanged` 事件

### chrome.alarms (权限: `alarms`)
- `alarms.create(name, {delayInMinutes, periodInMinutes})` — 创建定时器
- `alarms.onAlarm` — 定时器触发事件
- **重要**: MV3 Service Worker 不能用 `setInterval`，必须用 alarms

### chrome.sidePanel (权限: `sidePanel`)
- `sidePanel.setOptions({path, enabled})` — 设置侧边栏页面
- `sidePanel.open({windowId})` — 打开侧边栏
- Chrome 114+ 支持

### chrome.runtime
- `runtime.sendMessage()` / `runtime.onMessage` — 组件间消息通信
- `runtime.getURL(path)` — 获取扩展内部页面 URL

### chrome.windows
- `windows.create({url, type, focused})` — 创建新窗口
- `windows.onRemoved` — 窗口关闭事件

---

## 2. 项目目录结构

```
spidermemos-broswer-extension-tab-sync/
├── public/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       └── icon-128.png
├── src/
│   ├── manifest.ts                      # Manifest V3 定义 (CRXJS 使用)
│   │
│   ├── background/                      # Service Worker (后台核心)
│   │   ├── index.ts                     # SW 入口，初始化所有模块
│   │   ├── tab-monitor.ts              # 标签页事件监听与本地状态管理
│   │   ├── sync-engine.ts              # 同步引擎：事件队列、批量上传、拉取
│   │   ├── alarm-manager.ts            # 定时同步 & 心跳
│   │   └── message-handler.ts          # 处理来自 popup/sidepanel/dashboard 的消息
│   │
│   ├── popup/                           # 弹出窗口 (轻量快捷操作)
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   └── components/
│   │       ├── LoginPanel.vue           # 登录面板（Token 粘贴 + 账号密码）
│   │       ├── SyncStatus.vue           # 同步状态指示器
│   │       ├── TabSummary.vue           # 标签页统计概览
│   │       └── QuickActions.vue         # 快捷操作按钮
│   │
│   ├── sidepanel/                       # 侧边栏面板 (中等复杂度)
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   └── components/
│   │       ├── TabList.vue              # 当前标签页列表
│   │       ├── TabItem.vue              # 单个标签页条目
│   │       ├── SearchBar.vue            # 搜索过滤
│   │       └── WorkspaceQuick.vue       # 工作组快速切换
│   │
│   ├── dashboard/                       # 独立标签页管理面板 (完整功能)
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/
│   │   │   └── index.ts
│   │   ├── views/
│   │   │   ├── TabsView.vue            # 标签页管理（查询/筛选/批量操作）
│   │   │   ├── WorkspacesView.vue      # 工作组管理
│   │   │   ├── HistoryView.vue         # 已关闭标签页历史
│   │   │   ├── DevicesView.vue         # 多设备概览
│   │   │   └── SettingsView.vue        # 设置（认证/同步/偏好）
│   │   └── components/
│   │       ├── layout/
│   │       │   ├── AppHeader.vue
│   │       │   └── AppSidebar.vue
│   │       ├── tabs/
│   │       │   ├── TabTable.vue         # 标签页表格
│   │       │   ├── TabFilters.vue       # 筛选条件栏
│   │       │   └── TabActions.vue       # 批量操作栏
│   │       ├── workspaces/
│   │       │   ├── WorkspaceCard.vue    # 工作组卡片
│   │       │   └── WorkspaceEditor.vue  # 工作组编辑器
│   │       └── devices/
│   │           └── DeviceCard.vue       # 设备信息卡片
│   │
│   ├── shared/                          # 所有页面共享的代码
│   │   ├── types/
│   │   │   ├── tab.ts                  # TabRecord, TabEvent
│   │   │   ├── workspace.ts            # Workspace, TabReference
│   │   │   ├── device.ts              # Device
│   │   │   ├── auth.ts               # AuthState, LoginRequest
│   │   │   ├── sync.ts               # SyncPayload, SyncResponse
│   │   │   └── messages.ts           # 消息协议类型定义
│   │   ├── api/
│   │   │   ├── client.ts              # fetch 封装 (带 auth header)
│   │   │   ├── auth.ts               # 认证 API
│   │   │   ├── tabs.ts               # 标签页 API
│   │   │   ├── workspaces.ts         # 工作组 API
│   │   │   ├── devices.ts            # 设备 API
│   │   │   └── sync.ts               # 同步 API
│   │   ├── composables/
│   │   │   ├── useAuth.ts            # 认证状态 composable
│   │   │   ├── useMessage.ts         # 与 background 通信的 composable
│   │   │   └── useStorage.ts         # chrome.storage 响应式封装
│   │   ├── storage/
│   │   │   ├── chrome-storage.ts      # chrome.storage.local 类型化封装
│   │   │   └── keys.ts               # 存储 key 常量
│   │   ├── utils/
│   │   │   ├── tab-utils.ts          # Tab 数据提取辅助函数
│   │   │   ├── debounce.ts           # 防抖/节流
│   │   │   ├── device-fingerprint.ts # 设备指纹生成
│   │   │   └── logger.ts             # 日志工具
│   │   └── constants.ts              # 全局常量
│   │
│   └── styles/
│       └── element-overrides.scss     # Element Plus 样式覆盖
│
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .eslintrc.cjs
└── .prettierrc
```

---

## 3. 架构设计

### 3.1 组件通信架构

```
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│   Popup     │  │  Side Panel  │  │  Dashboard   │
│  (Vue 3)    │  │   (Vue 3)    │  │   (Vue 3)    │
└──────┬──────┘  └──────┬───────┘  └──────┬───────┘
       │                │                  │
       │    chrome.runtime.sendMessage     │
       └────────────────┼──────────────────┘
                        │
                        ▼
              ┌───────────────────┐     fetch()     ┌──────────┐
              │  Background SW    │◄───────────────►│ Backend  │
              │  (Service Worker) │                  │  (API)   │
              │                   │                  └──────────┘
              │  - Tab Monitor    │
              │  - Sync Engine    │
              │  - Alarm Manager  │
              │  - Message Handler│
              └─────────┬────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  chrome.storage   │
              │     .local        │
              └───────────────────┘
```

**核心原则**: Background Service Worker 是唯一的数据管理者。所有 UI 页面（Popup / SidePanel / Dashboard）通过 `chrome.runtime.sendMessage` 与 Background 通信，不直接调用 `chrome.tabs.*` 或 `fetch()`。

### 3.2 Tab 生命周期数据流

```
Chrome 标签页事件 (onCreated/onUpdated/onRemoved/onActivated)
       │
       ▼
┌──────────────────┐
│   Tab Monitor    │── 防抖 500ms/tab ──┐
└──────────────────┘                     │
                                         ▼
                               ┌──────────────────┐
                               │ 生成/更新 TabRecord│
                               │ (扩展 UUID 作为 ID)│
                               └────────┬─────────┘
                                        │
                        ┌───────────────┼───────────────┐
                        ▼                               ▼
               ┌──────────────┐                ┌──────────────┐
               │chrome.storage│                │  事件队列     │
               │  (本地状态)   │                │(pendingEvents)│
               └──────────────┘                └───────┬──────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │  Sync Engine  │
                                              │  批量 POST    │
                                              └───────┬──────┘
                                                      │
                                                      ▼
                                               ┌──────────┐
                                               │ Backend  │
                                               └──────────┘
```

### 3.3 同步状态机

```
       ┌───────┐
       │ IDLE  │◄────────────────────────────────┐
       └───┬───┘                                 │
           │ (事件入队 OR 定时器触发)               │
           ▼                                     │
    ┌────────────┐                               │
    │  SYNCING   │── 成功 ──────────────────────→┘
    └──────┬─────┘
           │ 失败
           ▼
    ┌────────────┐
    │  RETRYING  │── 超过最大重试次数 → ERROR ──(下次定时器)→ IDLE
    └──────┬─────┘
           │ 成功
           └──────────────────────────────────→ IDLE
```

### 3.4 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Tab 标识 | 扩展生成 UUID，而非 Chrome tabId | Chrome 的 tabId 重启后变化，无法跨设备 |
| HTTP 客户端 | 原生 fetch 封装 | Service Worker 原生支持，比 Axios 减少 ~15KB 体积 |
| 状态管理 | Composables + 消息通信 | 状态在 Background 的 chrome.storage 中，Pinia 是多余层 |
| 事件防抖 | 每标签页 500ms | 页面加载时 onUpdated 会触发 3-8 次，只关心最终状态 |
| 同步策略 | 事件队列 + 定期全量对账 | 事件驱动保证实时性，全量对账保证一致性 |
| UI 组件库 | Element Plus 按需导入 | `unplugin-vue-components` 自动导入，减少打包体积 |
| Service Worker 状态 | 全部持久化到 chrome.storage.local | MV3 SW 空闲 30s 可能被终止，不能依赖内存 |

---

## 4. 消息协议设计

Background Service Worker 的消息处理分发表：

| Action | 来源 | 说明 |
|--------|------|------|
| `GET_STATE` | Popup/SidePanel/Dashboard | 获取当前状态概览 |
| `LOGIN_WITH_TOKEN` | Popup/Dashboard | Token 登录 |
| `LOGIN_WITH_CREDENTIALS` | Popup/Dashboard | 账号密码登录 |
| `LOGOUT` | Popup/Dashboard | 登出 |
| `SYNC_NOW` | Popup/SidePanel/Dashboard | 立即触发同步 |
| `GET_TABS` | SidePanel/Dashboard | 获取标签页列表 (支持筛选参数) |
| `CLOSE_TAB` | SidePanel/Dashboard | 关闭本地标签页，保留远端记录 |
| `CLOSE_TABS_BATCH` | Dashboard | 批量关闭标签页 |
| `REOPEN_TAB` | Dashboard | 从历史记录重新打开标签页 |
| `GET_WORKSPACES` | SidePanel/Dashboard | 获取工作组列表 |
| `CREATE_WORKSPACE` | Dashboard | 创建工作组 |
| `UPDATE_WORKSPACE` | Dashboard | 更新工作组 |
| `DELETE_WORKSPACE` | Dashboard | 删除工作组 |
| `OPEN_WORKSPACE` | SidePanel/Dashboard | 打开工作组 (全部/部分) |
| `OPEN_DASHBOARD` | Popup/SidePanel | 在新标签页中打开 Dashboard |

---

## 5. 后端 OpenAPI 接口设计

### 基础信息
- Base URL: `{configurable}/api/v1`
- 认证: 除登录接口外，所有请求需携带 `Authorization: Bearer <token>`
- 所有请求携带 `X-Device-Id` header

### 5.1 认证接口

```
POST /auth/login
  Body: { username: string, password: string }
  Response 200: { token: string, user: { id, username, email } }
  Response 401: { error: { code: "INVALID_CREDENTIALS", message: string } }

POST /auth/verify-token
  Body: { token: string }
  Response 200: { valid: true, user: { id, username, email } }
  Response 401: { valid: false, error: { code: "INVALID_TOKEN", message: string } }

POST /auth/logout
  Response 200: { success: true }
```

### 5.2 设备接口

```
POST /devices/register
  Body: { deviceId: string, name: string, browser: string, os: string }
  Response 201: { device: Device }

GET /devices
  Response 200: { devices: Device[] }

PATCH /devices/:deviceId
  Body: { name?: string }
  Response 200: { device: Device }

POST /devices/:deviceId/heartbeat
  Response 200: { ok: true }
```

### 5.3 同步接口

```
POST /sync/events
  Body: { deviceId: string, events: TabEvent[] }
  Response 200: { processed: number, conflicts: TabEvent[] }
  说明: 增量事件同步，每次标签页变化时批量上传

POST /sync/full
  Body: { deviceId: string, tabs: TabRecord[], timestamp: ISO }
  Response 200: { merged: TabRecord[], conflicts: TabRecord[] }
  说明: 全量状态对账，用于首次同步和定期对账

GET /sync/pull?deviceId={id}&since={ISO}
  Response 200: { events: TabEvent[], serverTimestamp: ISO }
  说明: 拉取其他设备的变更事件
```

### 5.4 标签页接口

```
GET /tabs?deviceId=&status=open|closed|archived&search=&workspaceId=&since=ISO&page=1&limit=50
  Response 200: { tabs: TabRecord[], total: number, page: number }

GET /tabs/:tabId
  Response 200: { tab: TabRecord }

DELETE /tabs/:tabId
  Response 200: { success: true }
  说明: 从服务端永久删除记录
```

### 5.5 工作组接口

```
GET /workspaces
  Response 200: { workspaces: Workspace[] }

POST /workspaces
  Body: { name: string, color: string, icon?: string, tabs: TabReference[] }
  Response 201: { workspace: Workspace }

GET /workspaces/:id
  Response 200: { workspace: Workspace }

PATCH /workspaces/:id
  Body: { name?, color?, icon?, tabs? }
  Response 200: { workspace: Workspace }

DELETE /workspaces/:id
  Response 200: { success: true }

POST /workspaces/:id/tabs
  Body: { tabs: TabReference[] }
  Response 200: { workspace: Workspace }
  说明: 向工作组添加标签页

DELETE /workspaces/:id/tabs
  Body: { tabIds: string[] }
  Response 200: { workspace: Workspace }
  说明: 从工作组移除标签页
```

### 5.6 数据类型定义

```typescript
interface TabRecord {
  id: string              // 扩展生成的 UUID (跨设备唯一)
  chromeTabId: number      // Chrome 本地 tabId (仅本地有意义)
  windowId: number
  url: string
  title: string
  favIconUrl: string
  status: 'open' | 'closed' | 'archived'
  openedAt: string         // ISO 时间
  lastAccessedAt: string   // ISO 时间
  closedAt?: string        // ISO 时间
  deviceId: string
  workspaceIds: string[]   // 所属工作组
}

interface TabEvent {
  id: string               // 事件 UUID
  type: 'created' | 'updated' | 'removed' | 'activated'
  tabRecord: TabRecord
  timestamp: string        // ISO 时间
  deviceId: string
}

interface Workspace {
  id: string
  name: string
  color: string
  icon?: string
  tabs: TabReference[]
  createdAt: string
  updatedAt: string
}

interface TabReference {
  tabId: string            // 关联的 TabRecord.id
  url: string              // URL 快照 (即使标签页已关闭也能重新打开)
  title: string
  favIconUrl: string
  addedAt: string
}

interface Device {
  id: string
  name: string
  browser: string
  os: string
  lastSeen: string
}

// 错误响应格式
interface ErrorResponse {
  error: {
    code: string           // 如 INVALID_TOKEN, DEVICE_NOT_FOUND, SYNC_CONFLICT
    message: string
    details?: any
  }
}
```

---

## 6. Manifest V3 配置

```typescript
// src/manifest.ts
export default defineManifest({
  manifest_version: 3,
  name: "SpiderMemos Tab Sync",
  version: "1.0.0",
  description: "同步和管理浏览器标签页",
  permissions: [
    "tabs",
    "storage",
    "alarms",
    "activeTab",
    "sidePanel"
  ],
  host_permissions: [
    "<all_urls>"    // 用于获取 favicon 和访问可配置的后端地址
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  side_panel: {
    default_path: "src/sidepanel/index.html"
  },
  icons: {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
})
```

---

## 7. 实现阶段规划

### 阶段 1: 项目搭建与扩展骨架

**目标**: 创建可加载到 Chrome 的基础扩展

1. 初始化 Vite + Vue 3 + TypeScript 项目（告知用户执行创建命令）
2. 安装依赖: `@crxjs/vite-plugin`, `element-plus`, `vue-router`, `unplugin-vue-components`, `unplugin-auto-import`
3. 配置 `vite.config.ts`: CRXJS 插件、Element Plus 按需导入、多入口页面 (popup/sidepanel/dashboard)
4. 编写 `src/manifest.ts`
5. 创建 popup / sidepanel / dashboard 三个入口的最小 Vue 应用
6. 创建最小的 background service worker
7. 验证: 扩展可加载到 `chrome://extensions` 并显示 popup

**关键文件**: `vite.config.ts`, `src/manifest.ts`, `package.json`

### 阶段 2: 共享类型与存储层

**目标**: 建立类型安全基础和本地存储封装

1. 定义所有 TypeScript 类型 (`src/shared/types/`)
2. 实现 `chrome.storage.local` 类型化封装 (`src/shared/storage/`)
3. 定义消息协议类型 (`src/shared/types/messages.ts`)
4. 实现消息通信 composable (`src/shared/composables/useMessage.ts`)
5. 定义全局常量 (`src/shared/constants.ts`)

**关键文件**: `src/shared/types/*.ts`, `src/shared/storage/chrome-storage.ts`

### 阶段 3: 认证模块

**目标**: 完成 Token 粘贴 + 账号密码双模式登录

1. 实现 fetch 封装 (`src/shared/api/client.ts`): 自动附加 auth header + X-Device-Id
2. 实现认证 API (`src/shared/api/auth.ts`)
3. Background 中实现认证守卫逻辑: token 验证、存储、清除
4. 实现 Popup 的 LoginPanel 组件: 支持 Token 粘贴和账号密码两种方式
5. Dashboard Settings 中的认证管理
6. 设备指纹生成与注册

**关键文件**: `src/shared/api/client.ts`, `src/popup/components/LoginPanel.vue`, `src/background/message-handler.ts`

### 阶段 4: 标签页监控与本地状态

**目标**: 实时跟踪所有标签页活动

1. 实现 `tab-monitor.ts`: 注册 Chrome 标签页事件监听
2. 实现 Tab UUID 生成与 chromeTabId 映射
3. 实现事件防抖 (500ms/tab)
4. 扩展安装/启动时执行全量标签页扫描 (`chrome.tabs.query({})`)
5. 维护本地标签页状态到 `chrome.storage.local`
6. 事件队列: 每个变更推入待同步队列

**关键文件**: `src/background/tab-monitor.ts`, `src/shared/utils/tab-utils.ts`, `src/shared/utils/debounce.ts`

### 阶段 5: 同步引擎

**目标**: 可靠的增量同步 + 全量对账

1. 实现 `sync-engine.ts`:
   - 事件驱动同步: 队列有数据时批量发送
   - 定期全量对账: 每 5 分钟（可配置）
   - 指数退避重试: 1s → 2s → 4s，最多 3 次
   - 离线缓存: 网络不可用时事件累积，恢复后刷新队列
2. 实现 `alarm-manager.ts`:
   - `periodic-sync` 定时器 (5 分钟)
   - `heartbeat` 定时器 (1 分钟)
3. 实现同步相关 API (`src/shared/api/sync.ts`)
4. "本地关闭，保留远端" 逻辑: 关闭标签页 → 状态变 `closed` → 同步到后端保留记录

**关键文件**: `src/background/sync-engine.ts`, `src/background/alarm-manager.ts`, `src/shared/api/sync.ts`

### 阶段 6: Popup 界面

**目标**: 轻量级弹出窗口，提供状态概览和快捷操作

1. `LoginPanel.vue` — 未登录时显示，支持 Token + 账密两种模式
2. `SyncStatus.vue` — 上次同步时间、同步状态指示灯、立即同步按钮
3. `TabSummary.vue` — 打开标签页数、今日新增、已关闭数
4. `QuickActions.vue` — 打开 Dashboard、打开侧边栏、立即同步

**关键文件**: `src/popup/App.vue`, `src/popup/components/*.vue`

### 阶段 7: Side Panel 侧边栏

**目标**: 中等复杂度的侧边栏面板，提供标签页列表和快速操作

1. 标签页列表 + 搜索过滤
2. 单个标签页操作 (跳转、关闭但保留远端)
3. 工作组快速切换
4. 底部按钮: "在新标签页中打开完整管理面板"

**关键文件**: `src/sidepanel/App.vue`, `src/sidepanel/components/*.vue`

### 阶段 8: Dashboard 管理面板

**目标**: 完整功能的标签页管理 SPA

1. 布局: 左侧导航 + 顶部信息栏 + 主内容区
2. **TabsView**: 表格形式展示所有标签页，支持搜索、多条件筛选（状态/设备/工作组/时间范围）、排序、分页、批量操作（关闭/归档/加入工作组）
3. **WorkspacesView**: 工作组卡片网格展示，创建/编辑/删除工作组，选择标签页加入，全部/部分打开工作组
4. **HistoryView**: 已关闭/归档标签页的时间线或表格，搜索、重新打开
5. **DevicesView**: 已注册设备列表，每设备的标签页数和同步状态
6. **SettingsView**: 后端 URL、认证管理、同步间隔、设备名称、数据导出

**关键文件**: `src/dashboard/views/*.vue`, `src/dashboard/components/**/*.vue`, `src/dashboard/router/index.ts`

### 阶段 9: 工作组功能完善

**目标**: 完整的工作组管理与标签页组织

1. 创建工作组: 命名 + 颜色 + 选择标签页
2. 编辑工作组: 添加/移除标签页，重命名
3. 打开工作组: "全部打开" (新窗口) / "选择性打开" (勾选后打开)
4. 工作组同步到后端，跨设备共享
5. 工作组 API 集成

**关键文件**: `src/dashboard/components/workspaces/*.vue`, `src/shared/api/workspaces.ts`

### 阶段 10: 多设备支持与收尾

**目标**: 多设备共享与整体优化

1. 设备注册与心跳
2. Dashboard 中展示跨设备标签页 (带设备来源标识)
3. 从其他设备"导入"标签页 (在本地打开)
4. 错误处理完善: 网络错误、token 过期、后端不可用
5. 扩展图标状态 Badge (显示同步状态或未同步事件数)

**关键文件**: `src/shared/api/devices.ts`, `src/dashboard/views/DevicesView.vue`, `src/shared/utils/device-fingerprint.ts`

---

## 8. Service Worker 注意事项

MV3 Service Worker 可能在空闲 30 秒后被终止，需要注意：

1. **不能依赖内存状态** — 所有状态必须持久化到 `chrome.storage.local`
2. **使用 `chrome.alarms` 而非 `setInterval`** — alarms 在 SW 重启后仍然有效
3. **事件监听器必须在顶层注册** — 不能放在异步回调内部
4. **SW 唤醒后重新初始化** — 从 storage 恢复状态，重新绑定事件

---

## 9. 验证方案

### 阶段验证
- **阶段 1**: 扩展可加载到 `chrome://extensions`，popup 可弹出，sidepanel 可打开，dashboard 可在新标签页中打开
- **阶段 3**: 可使用 Token 和账号密码两种方式登录（需 mock 后端或使用 MSW）
- **阶段 4**: 打开/关闭/切换标签页时，控制台输出对应事件日志
- **阶段 5**: 与后端连通后，标签页变化可在后端数据库中看到
- **阶段 8**: Dashboard 可查询、筛选标签页，批量操作正常工作

### 开发期验证 (无后端)
由于后端尚未实现，开发期间使用以下策略：
1. Background 中的 API 调用包裹 try-catch，API 不可用时仅记录日志不影响本地功能
2. 本地标签页监控和状态管理可完全独立于后端运行
3. 可选: 使用 Mock Service Worker (MSW) 模拟后端响应进行 UI 开发

### 最终集成验证
1. 安装扩展 → 粘贴 Token 登录 → 验证认证成功
2. 打开多个标签页 → 检查后端是否收到同步数据
3. 关闭标签页 → 在 Dashboard 历史中查看 → 点击重新打开
4. 创建工作组 → 添加标签页 → 关闭后重新打开工作组
5. 在另一台电脑安装扩展 → 登录同一账号 → 查看跨设备标签页
