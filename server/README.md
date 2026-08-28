# Tab Sync Server - 轻量级浏览器标签页同步后端

基于 **Go + Gin + SQLite** 的轻量后端服务，为 Tab Sync 浏览器扩展提供设备注册、工作组管理和多设备同步能力。

## 特性

- **单文件部署** — Go 编译为单个可执行文件，内嵌 SQLite，无需外部数据库
- **API Key 认证** — Token 机制，用户可在管理后台自助生成与吊销
- **Docker 友好** — 多架构镜像（amd64 / arm64），一行命令部署
- **Web 管理后台** — 内置 `/setup` 页面：首次初始化、Token 管理、统计概览
- **版本协商** — 扩展与后端版本自动适配，不兼容时拒绝连接
- **可扩展存储层** — 数据访问层接口化，当前使用内嵌 SQLite（架构层预留多数据源接口，未来可切换 PostgreSQL / MySQL）
- **SSE 实时通道** — 浏览器扩展可建立 SSE 长连接接收实时推送；AI 远程 `tool-calling` 为预留接口

---

## 快速开始

### 前置要求

- 安装了 Docker 的服务器 / NAS / 树莓派
- 或：安装了 Go 1.22+ 的开发环境

### Docker 部署（推荐）

```bash
# 拉取并启动（amd64 / arm64 均支持）
docker run -d \
  --name tab-sync-server \
  -p 8080:8080 \
  -v tab-sync-data:/app/data \
  -e PORT=8080 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  ghcr.io/spidermemos/tab-sync-server:latest

# 查看日志
docker logs -f tab-sync-server
```

### 使用 docker-compose

```bash
# 1. 克隆仓库（或下载 docker-compose.yml）
# 2. 修改 docker-compose.yml 中的 JWT_SECRET
# 3. 启动
docker compose up -d

# 查看状态
docker compose ps
docker compose logs -f
```

### 手动编译部署

```bash
git clone https://github.com/zhang-brook/tab-sync.git
cd tab-sync/server

# 安装依赖
go mod tidy

# 编译、运行
# 非 Windows 系统
go build -o tab-sync-server ./cmd/server
# 或 make build
./tab-sync-server

# Windows 系统
go build -o tab-sync-server.exe ./cmd/server
tab-sync-server.exe
```

---

## 首次设置

服务启动后，在浏览器中完成初始化：

1. 访问 `http://localhost:8080/setup`
2. 输入管理员密码并确认
3. 系统自动生成 **Admin Token**（保管好，仅显示一次）
4. 进入管理后台，在「Token 管理」页为用户设备生成新的 API Token

> 如果部署在远程服务器，请将 `localhost` 替换为服务器 IP 或域名。

---

## 配置浏览器扩展

安装 Tab Sync 扩展后，按以下步骤配置轻量后端：

1. 点击扩展图标 → 设置（或打开 Dashboard → 设置）
2. 连接模式选择 **「轻量后端」**
3. 在后端地址填入服务 URL（如 `http://192.168.1.100:8080`）
4. 在 Token 输入框中粘贴从管理后台生成的 API Token
5. 点击「验证连接」确认配置正确

> 详细说明见扩展 Dashboard → 设置页。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8080` | 服务监听端口 |
| `DATA_DIR` | `./data` | 数据文件（SQLite 数据库）存储目录 |
| `SERVER_VERSION` | `1.0.0` | 服务端版本号 |
| `JWT_SECRET` | 随机生成 | 管理后台 JWT 签名密钥（**生产环境务必修改**） |
| `LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |
| `LOG_OUTPUT` | `stdout` | 日志输出：`stdout` / `stderr` / 文件路径 |
| `MIN_EXT_VERSION` | `1.0.0` | 最低兼容的浏览器扩展版本 |
| `MAX_EXT_VERSION` | `2.0.0` | 最高兼容的浏览器扩展版本 |
| `UPSTREAM_URL` | 空 | 织个网上游服务器地址（预留） |
| `UPSTREAM_TOKEN` | 空 | 织个网上游认证 Token（预留） |
| `UPSTREAM_SYNC_ENABLED` | `false` | 是否启用织个网上游同步（预留） |

---

## 反向代理 + HTTPS

将服务暴露到公网时，建议使用 Nginx 或 Caddy 做反向代理并启用 HTTPS。

### Nginx 示例

参考仓库中的 [`nginx.conf.example`](./nginx.conf.example)，按注释配置域名和 SSL 证书。

### Let's Encrypt 自动证书

```bash
# 使用 certbot 自动获取免费 SSL 证书
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

### Traefik 标签

如果使用 Traefik，在 `docker-compose.yml` 中添加 labels 即可自动配置路由和证书。

---

## 数据备份与恢复

SQLite 数据库文件位于 `data/tab-sync.db`。

### 备份

```bash
# 直接复制
cp data/tab-sync.db data/tab-sync.db.backup.$(date +%Y%m%d)

# Docker 部署
docker exec tab-sync-server cp /app/data/tab-sync.db /app/data/backup.db
docker cp tab-sync-server:/app/data/backup.db ./backup-$(date +%Y%m%d).db

# 定时备份（crontab 示例：每天凌晨 2 点）
# 0 2 * * * cp /path/to/data/tab-sync.db /backup/tab-sync-$(date +\%Y\%m\%d).db
```

### 恢复

```bash
# 停止服务 → 替换数据库文件 → 重启服务
docker compose stop
cp backup-20260723.db data/tab-sync.db
docker compose start
```

---

## API 文档

服务启动后，访问 `http://localhost:8080/api/docs` 查看在线 API 文档，包含所有端点的请求/响应示例。

### 端点概览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/tab-sync/version` | 版本信息（公开） |
| `POST` | `/v1/tab-sync/auth/verify-token` | Token 验证 |
| `POST` | `/v1/tab-sync/devices/register` | 设备注册/更新 |
| `GET` | `/v1/tab-sync/devices` | 设备列表 |
| `PATCH` | `/v1/tab-sync/devices/:deviceId` | 更新设备 |
| `DELETE` | `/v1/tab-sync/devices/:deviceId` | 注销设备 |
| `POST` | `/v1/tab-sync/devices/:deviceId/heartbeat` | 心跳上报 |
| `GET` | `/v1/tab-sync/workspaces` | 工作组列表（`includeSystem` / `includeTabs` 查询参数控制是否含系统分组与标签页明细，默认 `includeTabs=true`） |
| `GET` | `/v1/tab-sync/workspaces/:id/tabs` | 工作组的标签页列表（`recursive=true` 一次返回该组及整棵子树的标签页，按工作区分组，用于「包含子工作组」模式） |
| `GET` | `/v1/tab-sync/tabs` | 「已同步标签页」聚合分页（`page`/`pageSize`/`keyword`/`includeSystem`，直接跨所有工作组扁平返回，无需经工作组树拍平） |
| `POST` | `/v1/tab-sync/workspaces` | 创建工作组 |
| `PUT` | `/v1/tab-sync/workspaces/:id` | 更新工作组（改 `parentId` 时自动追加到新同级末尾） |
| `POST` | `/v1/tab-sync/workspaces/:id/move` | 移动工作组到参照节点的落点（`targetId` + `position: before/after/inner`，用于左侧树拖拽；顺序由后端计算） |
| `DELETE` | `/v1/tab-sync/workspaces/:id` | 删除工作组 |
| `GET` | `/v1/tab-sync/workspaces/tabs-summary` | 标签页摘要 |
| `POST` | `/v1/tab-sync/workspaces/:id/tabs/move` | 移动标签页 |
| `POST` | `/v1/tab-sync/sync/push` | 推送同步事件（预留） |
| `GET` | `/v1/tab-sync/sync/pull` | 拉取同步事件（增量，预留） |
| `GET` | `/v1/tab-sync/sse/events` | SSE 实时事件流（扩展长连接，预留） |
| `POST` | `/v1/tab-sync/tool-calling` | AI 远程工具调用（预留） |

标签管理（标签页标签 `tab` + 工作组标签 `workspace`，全局共享、多设备可见）：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/tab-sync/tags?scope=tab\|workspace` | 列出标签（按 scope 过滤） |
| `POST` | `/v1/tab-sync/tags` | 创建标签 |
| `DELETE` | `/v1/tab-sync/tags/:id` | 删除标签（事务内清理关联记录） |
| `POST` | `/v1/tab-sync/workspaces/:id/tabs/:tabId/tags` | 给工作组内标签页打标签 |
| `DELETE` | `/v1/tab-sync/workspaces/:id/tabs/:tabId/tags/:tagId` | 去掉标签页上的标签 |
| `POST` | `/v1/tab-sync/workspaces/:id/tags` | 给工作组打标签 |
| `DELETE` | `/v1/tab-sync/workspaces/:id/tags/:tagId` | 去掉工作组上的标签 |

管理接口（Admin Token 或 `/setup` 登录会话）：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/setup` | 完成首次初始化（设置管理员密码） |
| `GET` | `/api/setup/status` | 查询初始化状态 |
| `POST` | `/api/admin/login` | 管理后台登录（返回 JWT） |
| `GET` | `/v1/tab-sync/admin/tokens` | Token 列表 |
| `POST` | `/v1/tab-sync/admin/tokens` | 生成 API Token |
| `DELETE` | `/v1/tab-sync/admin/tokens/:tokenId` | 吊销 Token |
| `GET` | `/v1/tab-sync/admin/stats` | 统计概览 |

### 认证方式

需要认证的接口在请求头携带：

```
Authorization: Bearer <your-api-token>
```

---

## 架构与目录结构

```
server/
├── cmd/server/
│   ├── main.go              # 入口、路由注册
│   └── web/                 # 嵌入式 Web 页面（setup / docs）
├── internal/
│   ├── config/              # 配置管理（环境变量 + 默认值）
│   ├── database/            # 数据库层（SQLite + GORM 自动迁移）
│   ├── handler/             # HTTP 处理器（统一响应 CommonReturn）
│   ├── logger/              # 日志系统
│   ├── middleware/          # 中间件（Auth / CORS / TraceID / VersionCheck）
│   ├── model/               # 数据模型（GORM）
│   └── service/             # 业务逻辑层（设备 / 工作组 / 同步 / SSE）
├── Dockerfile                # 多架构 Docker 构建
├── docker-compose.yml        # Docker 编排（含 Nginx 示例）
├── nginx.conf.example        # Nginx 反向代理配置示例
├── Makefile                  # 构建/运行/测试命令
├── CHANGELOG.md              # 更新日志
└── README.md                 # 本文件
```

---

## 开发

```bash
# 安装依赖
go mod tidy

# 开发模式运行
make run
# 或：go run ./cmd/server

# 编译
make build            # 当前平台
make build-all        # 全平台（linux/darwin/windows，amd64/arm64）

# 多架构 Docker 构建并推送
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/spidermemos/tab-sync-server:latest --push .

# 测试
make test
```

---

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)。
