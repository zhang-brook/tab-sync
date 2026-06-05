# SpiderMemos Tab Sync - Chrome Extension Design Spec

## Context

用户需要一个浏览器标签页管理扩展，能够将本地浏览器的所有标签页信息（ID、URL、标题、图标、打开时间、最近访问时间）实时同步到自定义后端，支持多设备共享、工作组管理、历史标签页找回等功能。

**核心架构决策**: 后端作为唯一数据源，前端仅存认证/设置。Dashboard 所有操作走 API，chrome.storage.local 使用量从 MB 级降到 KB 级。此决策解决原架构两个核心问题：
1. **chrome.storage.local 爆炸**：`tab_records` 永不清除，所有标签页（打开+关闭+远端）全存本地，10MB 配额不够
2. **同步传输浪费**：每次事件内嵌完整 TabRecord，全量对账发送整个数据库

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

### 3.1 存储策略

```
chrome.storage.local (永久，KB 级):
  auth_token / refresh_token / auth_user
  device_id / device_name
  api_base_url / sync_interval

chrome.storage.session (会话内存，KB 级):
  tabId → UUID 映射（仅当前浏览器会话，重启自动清空）
```

**数据流变更**:
```
之前: UI → sendMessage → Background → chrome.storage.local 读取 → 返回
之后: UI → sendMessage → Background → fetch API → 后端查询 → 返回
                                        ↘ 网络失败 → 返回空/错误提示
```

### 3.2 组件通信架构

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
              └─────────┬────────┘                  └──────────┘
                        │
                        ▼
              ┌───────────────────┐
              │ chrome.storage.   │
              │ local (auth/set)  │
              │ session (tab map) │
              └───────────────────┘
```

**核心原则**: Background Service Worker 是唯一的数据管理者。所有 UI 页面（Popup / SidePanel / Dashboard）通过 `chrome.runtime.sendMessage` 与 Background 通信，不直接调用 `chrome.tabs.*` 或 `fetch()`。

### 3.3 标签页标识体系

| 场景 | 标识方式 | 说明 |
|------|---------|------|
| **浏览器会话内** | `chromeTabId` 为主键 | 本地操作直接用 tabId，无需查表 |
| **跨会话/跨设备** | `UUID` 为主键 | 后端存储和 API 通信使用 |
| **会话内映射** | `chrome.storage.session`: tabId → UUID | 内存级，浏览器重启自动清空 |

#### 浏览器重启对账流程

```
浏览器启动 / 扩展安装
       │
       ▼
┌──────────────────────────────┐
│ 1. chrome.tabs.query({})     │ 扫描所有打开的标签页
│    收集: tabId, url, title,  │
│          windowId, favIconUrl │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ 2. POST /sync/startup        │ 发给后端对账
│    Body: { deviceId, tabs[] }│
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ 3. 后端匹配逻辑:              │
│    - URL + 时间窗口匹配      │ 匹配到 → 复用已有 UUID
│      已有 TabRecord          │ 未匹配 → 生成新 UUID
│    - 返回 tabId → UUID 映射  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ 4. 写入 chrome.storage.session│
│    注册标签页事件监听         │
└──────────────────────────────┘
```

#### "先开标签页再装扩展" 场景

与首次安装完全相同，走上述对账流程。后端发现该设备无历史，所有标签页分配新 UUID。

#### chrome.storage.session 稳定性

| 场景 | 数据状态 | 处理 |
|------|---------|------|
| SW 被终止后重启（30s 闲置） | ✅ 保留 | 无需处理 |
| 浏览器重启 | ❌ 清空 | `onStartup` → 对账重建 |
| 扩展重载/更新 | ❌ 清空 | SW 启动检测 map 为空 → 对账重建 |
| 扩展禁用再启用 | ❌ 清空 | 同扩展重载 |

### 3.4 Tab 生命周期数据流

```
Chrome 标签页事件 (onCreated/onUpdated/onRemoved/onActivated)
       │
       ▼
┌──────────────────┐
│   Tab Monitor    │── 防抖 500ms/tab ──┐
└──────────────────┘                     │
                                         ▼
                               ┌──────────────────────┐
                               │ 更新 session 映射     │
                               │ POST /sync/events     │
                               │ (仅发送 delta 事件)   │
                               └──────────────────────┘
```

### 3.5 同步状态机

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

### 3.6 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Tab 标识 | 扩展生成 UUID，而非 Chrome tabId | Chrome 的 tabId 重启后变化，无法跨设备 |
| 会话内映射 | `chrome.storage.session`（非 local） | 仅当前会话有效，重启自动清空，无需手动清理 |
| 数据源 | 后端为唯一数据源 | 避免 chrome.storage.local 爆炸，Dashboard 全部走 API |
| HTTP 客户端 | 原生 fetch 封装 | Service Worker 原生支持，比 Axios 减少 ~15KB 体积 |
| 状态管理 | Composables + 消息通信 | 状态在后端，Pinia 是多余层 |
| 启动对账 | POST /sync/startup（替代本地 scanAllTabs） | 浏览器重启后通过后端匹配 URL 恢复 UUID 映射 |
| 事件防抖 | 每标签页 500ms | 页面加载时 onUpdated 会触发 3-8 次，只关心最终状态 |
| 同步策略 | 增量事件同步 + 启动对账 | 事件驱动保证实时性，启动对账保证重启一致性 |
| 事件数据结构 | delta 精简（不再内嵌完整 TabRecord） | 减少传输量，created 时才发完整数据 |
| UI 组件库 | Element Plus 按需导入 | `unplugin-vue-components` 自动导入，减少打包体积 |
| Service Worker 状态 | 持久化到 chrome.storage（仅 auth/settings） | MV3 SW 空闲 30s 可能被终止，不能依赖内存 |
| 工作组标签页恢复 | 复用已有 TabRecord + URL 预注册机制 | 避免多次点击"打开工作组"产生重复标签页和重复记录 |

### 3.7 工作组标签页恢复去重机制

当用户点击"打开工作组"时，需要实现智能去重，避免多次点击导致重复打开标签页：

```
用户点击 "打开工作组"
       │
       ▼
┌──────────────────────────┐
│ 遍历工作组中每个 TabReference │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 1. 通过 tabRef.tabId 查询后端 TabRecord │
│ 2. 检查 TabRecord.status 是否为 'open' │
└──────────┬──────────────┬────────────┘
           │              │
        是(open)       否(closed/不存在)
           │              │
           ▼              ▼
┌─────────────────┐  ┌──────────────────────────┐
│ 尝试激活已打开的  │  │ 预注册 URL → 已有 UUID    │
│ Chrome 标签页     │  │ 调用 chrome.tabs.create() │
│ (chrome.tabs.    │  │ tab-monitor 中 handleTab  │
│  update active)  │  │ Created 检测到预注册，     │
└────────┬────────┘  │ 复用已有 TabRecord 而非    │
         │           │ 创建新记录                  │
      成功/失败       └──────────┬─────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐  ┌─────────────────────────┐
│ 成功: 跳过       │  │ 更新 TabRecord:           │
│ 失败: 转入重新   │  │  - chromeTabId = 新 tabId │
│ 打开流程 ─────────│─►│  - status = 'open'       │
└─────────────────┘  │  - 清除 closedAt          │
                     │  - 更新 lastAccessedAt     │
                     │ 更新 session 映射          │
                     └─────────────────────────┘
```

**核心要点**:
1. **已打开检测**: 通过后端查询 TabRecord 的 status 字段判断标签页是否已打开，避免重复创建
2. **URL 预注册**: 在 `tab-monitor.ts` 中维护一个内存级 `pendingReopens` Map (URL → UUID[])，在调用 `chrome.tabs.create()` 前注册，使 `handleTabCreated` 事件处理器能识别这是"恢复打开"而非"全新创建"
3. **TabRecord 复用**: 恢复打开的标签页复用原有 TabRecord (同一 UUID)，仅更新 chromeTabId / status / lastAccessedAt 等字段
4. **响应反馈**: OPEN_WORKSPACE 的响应中返回 `opened`(新打开数) 和 `alreadyOpen`(已存在数)，UI 展示友好提示

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
| `OPEN_WORKSPACE` | SidePanel/Dashboard | 一键恢复打开工作组标签页 (去重: 已打开的直接激活，已关闭的复用原记录重新打开) |
| `OPEN_DASHBOARD` | Popup/SidePanel | 在新标签页中打开 Dashboard |

**注意**: 消息协议保持不变，但 handler 内部实现改为调后端 API（不再读 chrome.storage.local）。

---

## 5. 后端设计

### 5.1 数据库设计

#### 新增表

```sql
-- 标签页记录快照表（从事件派生最终状态）
CREATE TABLE lifebase.tab_sync_record (
    id              BIGINT PRIMARY KEY,
    tab_id          VARCHAR(64) NOT NULL UNIQUE,  -- UUID
    device_id       VARCHAR(64) NOT NULL,
    tenant_code     VARCHAR(64) NOT NULL,
    user_code       VARCHAR(64) NOT NULL,
    url             TEXT NOT NULL,
    title           VARCHAR(512),
    fav_icon_url    TEXT,
    status          VARCHAR(16) NOT NULL DEFAULT 'open',  -- open/closed/archived
    window_id       INTEGER,
    opened_at       TIMESTAMP,
    last_accessed_at TIMESTAMP,
    closed_at       TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT FALSE,
    create_time     TIMESTAMP DEFAULT NOW(),
    update_time     TIMESTAMP DEFAULT NOW(),
    version         INTEGER DEFAULT 0
);
CREATE INDEX idx_tab_record_user_status ON lifebase.tab_sync_record(user_code, status);
CREATE INDEX idx_tab_record_device ON lifebase.tab_sync_record(device_id);

-- 工作组表
CREATE TABLE lifebase.tab_sync_workspace (
    id              BIGINT PRIMARY KEY,
    workspace_id    VARCHAR(64) NOT NULL UNIQUE,  -- UUID
    tenant_code     VARCHAR(64) NOT NULL,
    user_code       VARCHAR(64) NOT NULL,
    name            VARCHAR(128) NOT NULL,
    color           VARCHAR(16),
    icon            VARCHAR(64),
    is_deleted      BOOLEAN DEFAULT FALSE,
    create_time     TIMESTAMP DEFAULT NOW(),
    update_time     TIMESTAMP DEFAULT NOW(),
    version         INTEGER DEFAULT 0
);

-- 工作组-标签页关联表
CREATE TABLE lifebase.tab_sync_workspace_tab (
    id              BIGINT PRIMARY KEY,
    workspace_id    VARCHAR(64) NOT NULL,
    tab_id          VARCHAR(64) NOT NULL,     -- TabRecord UUID
    url             TEXT NOT NULL,             -- 快照
    title           VARCHAR(512),              -- 快照
    fav_icon_url    TEXT,                      -- 快照
    added_at        TIMESTAMP DEFAULT NOW(),
    UNIQUE(workspace_id, tab_id)
);
```

#### 已有表（不变）

- `lifebase.tab_sync_event` — 事件流水表（保留，用于增量同步和拉取）
- `lifebase.tab_sync_device` — 设备注册表

### 5.2 OpenAPI 接口设计

#### 基础信息
- Base URL: `{configurable}/v1`
- 认证: 除登录接口外，所有请求需携带 `Authorization: Bearer <token>`
- 所有请求携带 `X-Device-Id` header

#### 5.2.1 认证接口

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

#### 5.2.2 设备接口

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

#### 5.2.3 同步接口

```
POST /v1/tab-sync/sync/startup
  说明: 浏览器启动/扩展安装时的全量对账
  Body: {
    deviceId: string,
    tabs: [{ chromeTabId, url, title, windowId, favIconUrl }]
  }
  Response: {
    mappings: { [chromeTabId]: uuid },   // tabId → UUID 映射
    newTabs: TabRecord[]                  // 新建的 TabRecord
  }

POST /v1/tab-sync/sync/events
  说明: 增量事件同步（event 结构已精简为 delta）
  Body: { deviceId: string, events: TabEvent[] }
  Response 200: { processed: number, conflicts: TabEvent[] }

GET /v1/tab-sync/sync/pull?deviceId={id}&since={ISO}
  说明: 拉取其他设备的变更事件
  Response 200: { events: TabEvent[], serverTimestamp: ISO }
```

~~`POST /sync/full`~~ — **已废弃**，由 `/sync/startup` 替代。

#### 5.2.4 标签页接口

```
GET /v1/tab-sync/tabs?status=open|closed&search=&deviceId=&workspaceId=&page=1&limit=50
  说明: 分页查询标签页
  Response 200: { tabs: TabRecord[], total: number, page: number }

GET /v1/tab-sync/tabs/:tabId
  Response 200: { tab: TabRecord }

DELETE /v1/tab-sync/tabs/:tabId
  Response 200: { success: true }
  说明: 从服务端永久删除记录
```

#### 5.2.5 工作组接口

```
GET /v1/tab-sync/workspaces
  Response 200: { workspaces: Workspace[] }

POST /v1/tab-sync/workspaces
  Body: { name: string, color: string, icon?: string, tabIds: string[] }
  Response 201: { workspace: Workspace }

GET /v1/tab-sync/workspaces/:id
  Response 200: { workspace: Workspace }

PUT /v1/tab-sync/workspaces/:id
  Body: { name?, color?, icon?, tabIds? }
  Response 200: { workspace: Workspace }

DELETE /v1/tab-sync/workspaces/:id
  Response 200: { success: true }
```

#### 5.2.6 数据重建接口

```
POST /v1/tab-sync/data/rebuild
  说明: 用本地标签页覆盖服务端当前设备的 open 状态记录
        不影响 closed 状态和已分组标签页
  Body: {
    deviceId: string,
    tabs: [{ url, title, windowId, favIconUrl }]
  }
  Response: { replaced: number, created: number }
```

### 5.3 数据类型定义

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

// TabEvent 精简版：不再内嵌完整 TabRecord，只发送变化字段
interface TabEvent {
  id: string               // 事件 UUID
  type: 'created' | 'updated' | 'removed' | 'activated'
  tabId: string            // TabRecord UUID
  deviceId: string
  timestamp: string        // ISO 时间
  // 仅 created 时需要完整数据:
  tabRecord?: TabRecord
  // updated 时仅发送变化的字段:
  delta?: {
    url?: string
    title?: string
    favIconUrl?: string
    windowId?: number
  }
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

**注意**: 不需要 `unlimitedStorage` 权限，chrome.storage.local 仅存 KB 级认证/设置数据。

---

## 7. 错误处理与降级

### 7.1 后端不可用时

```
Dashboard 视图 → 展示空状态 + "无法连接服务器，请检查设置"
Popup → 显示"后端未连接"状态
标签页监控 → 正常工作（事件在本地队列，网络恢复后自动同步）
```

### 7.2 网络恢复

```
定时同步触发 → 检测网络可用 → 清空事件队列 → 更新 session 映射
```

### 7.3 启动对账失败

```
/sync/startup 失败 → 使用纯本地 UUID 分配 → 标记为"待同步"
下次定时同步时 → 重试 startup 对账
```

---

## 8. 数据重建（Rebuild）机制

### 8.1 触发方式

Dashboard Settings 中提供"重建数据"按钮，用户手动触发。

### 8.2 流程

```
用户点击"重建数据"
  → 扫描当前所有 open tabs
  → POST /data/rebuild { deviceId, tabs }
  → 后端:
      1. 删除该设备所有 status=open 的 TabRecord
      2. 用请求中的 tabs 创建新 TabRecord
      3. closed/archived 状态的记录不受影响
      4. 已归属工作组的 closed 记录不受影响
  → 前端刷新 Dashboard
```

### 8.3 设计意图

用户可能在不同设备上有不同的标签页组合。重建只影响当前设备的 open 状态，不会丢失历史记录和工作组数据。

---

## 9. Service Worker 注意事项

MV3 Service Worker 可能在空闲 30 秒后被终止，需要注意：

1. **不能依赖内存状态** — 认证/设置持久化到 `chrome.storage.local`，标签页映射使用 `chrome.storage.session`（SW 终止后数据保留，浏览器重启才清空）
2. **使用 `chrome.alarms` 而非 `setInterval`** — alarms 在 SW 重启后仍然有效
3. **事件监听器必须在顶层注册** — 不能放在异步回调内部
4. **SW 唤醒后重新初始化** — 从 storage 恢复状态，检测 session map 是否为空，为空则触发对账重建

---

## 10. 实施计划

### Task 1: 后端 - 数据库 + 新 API

1. 创建 `tab_sync_record`, `tab_sync_workspace`, `tab_sync_workspace_tab` 表
2. 实现 `POST /sync/startup` 对账逻辑
3. 实现 `GET /tabs` 分页查询
4. 实现 workspace CRUD
5. 实现 `POST /data/rebuild`
6. 修改 `syncEvents` 处理 delta 事件 + 更新 record 快照

### Task 2: 前端 - 类型与存储层精简

1. 精简 `STORAGE_KEYS`（移除 `TAB_RECORDS`, `TAB_ID_MAP`, `PENDING_EVENTS`, `WORKSPACES`, `SYNC_STATE`）
2. 精简 `StorageSchema` 接口和默认值
3. 精简 `TabEvent` 类型（delta 替代完整 TabRecord，见 5.3）
4. 移除 `SyncState` 类型（同步状态由后端维护）
5. 新增 API 封装：
   - `src/shared/api/tabs.ts` — `getTabs(params)` 分页查询
   - `src/shared/api/workspaces.ts` — CRUD
   - `src/shared/api/sync.ts` — 新增 `syncStartup()`, `rebuildData()`，移除 `syncFull()`
6. 更新 `openapi.yaml` 补充新接口定义

### Task 3: 前端 - Background 改造

1. `index.ts`: 启动时调用 `syncStartup` 对账，替换 `scanAllTabs`
2. `tab-monitor.ts`:
   - 移除 `scanAllTabs` 中的 storage 写入逻辑
   - `pushEvent` 改为只发 delta，更新 `chrome.storage.session` 映射
   - `pendingReopens` 逻辑保留（工作组恢复）
3. `sync-engine.ts`:
   - 移除 `performFullSync`
   - 新增 `performStartupSync`
   - `performIncrementalSync` 保留但 event 结构精简
   - 移除 `applyRemoteEvents` 中写本地 storage 的逻辑
4. `message-handler.ts`:
   - `handleGetTabs` / `handleGetState` 改为调后端 API
   - `handleGetWorkspaces` / `handleCreateWorkspace` / `handleUpdateWorkspace` / `handleDeleteWorkspace` 改为调后端 API

### Task 4: 前端 - Dashboard 改造

1. **TabsView.vue** — `loadTabs()` 改为调后端 API（带分页参数）
2. **HistoryView.vue** — `loadHistory()` 改为 `GET /tabs?status=closed`
3. **WorkspacesView.vue** — CRUD 全部改为调后端 API
4. **DevicesView.vue** — 增加后端 API 状态指示（不可用时提示）
5. **SettingsView.vue** — 增加"重建数据"按钮，调用 `POST /data/rebuild`

### Task 5: 清理与验证

1. 删除所有遗留的 `tab_records`/`workspaces` 本地读写代码
2. 删除 `SyncState` 相关残留
3. 确认 `manifest.ts` 无 `unlimitedStorage`（不需要此权限）
4. 端到端验证流程：安装 → 开标签页 → Dashboard 查询 → 关闭 → 历史查看 → 重启对账

---

## 11. 遗留代码清理 Checklist

重构完成后逐项检查：

- [ ] `STORAGE_KEYS` 中无 `TAB_RECORDS`, `TAB_ID_MAP`, `PENDING_EVENTS`, `WORKSPACES`, `SYNC_STATE`
- [ ] `StorageSchema` 接口中无对应字段
- [ ] `chrome-storage.ts` 默认值中无对应字段
- [ ] `sync-engine.ts` 中无 `performFullSync`
- [ ] `sync-engine.ts` 中无 `applyRemoteEvents` 写本地 storage
- [ ] `tab-monitor.ts` 中 `scanAllTabs` 不再写 tab_records
- [ ] `tab-monitor.ts` 中 `pushEvent` 不再传完整 TabRecord
- [ ] `message-handler.ts` 的 `handleGetTabs` 不走 storage
- [ ] `message-handler.ts` 的 workspace handler 不走 storage
- [ ] `types/sync.ts` 中 `SyncState` 移除或精简
- [ ] `api/sync.ts` 中 `syncFull` 移除
- [ ] `openapi.yaml` 与后端实际接口一致
- [ ] `manifest.ts` 中无 `unlimitedStorage`
- [ ] 无 import 残留引用已删除的 storage keys
- [ ] TypeScript 编译通过，无类型错误

---

## 12. 验证方案

### 阶段验证

- **Task 1**: 后端数据库表创建成功，API 可正常响应
- **Task 2**: TypeScript 类型检查通过，无编译错误
- **Task 3**: 扩展启动对账成功，session 映射正确，标签页变化事件精简发出
- **Task 4**: Dashboard 可通过后端 API 查询、筛选标签页，批量操作正常工作
- **Task 5**: 上述 Checklist 全部通过

### 开发期验证 (无后端)

由于后端可能尚未实现，开发期间使用以下策略：
1. Background 中的 API 调用包裹 try-catch，API 不可用时仅记录日志不影响本地功能
2. 本地标签页监控可完全独立于后端运行（事件本地缓存，网络恢复后同步）
3. UI 层做好空状态和错误提示
4. 可选: 使用 Mock Service Worker (MSW) 模拟后端响应进行 UI 开发

### 最终集成验证

1. 安装扩展 → 粘贴 Token 登录 → 验证认证成功
2. 打开多个标签页 → 检查后端是否收到同步数据（delta 事件）
3. 关闭标签页 → 在 Dashboard 历史中查看 → 点击重新打开
4. 创建工作组 → 添加标签页 → 关闭后重新打开工作组（验证去重机制）
5. 浏览器重启 → 验证对账流程正确恢复 UUID 映射
6. 在另一台电脑安装扩展 → 登录同一账号 → 查看跨设备标签页
7. Dashboard Settings 中点击"重建数据" → 验证重建不影响历史和分组
