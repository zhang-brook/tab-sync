# Tab Sync Server - 轻量级浏览器标签页同步后端

基于 Go + SQLite 的轻量级后端服务，配合 SpiderMemos Tab Sync 浏览器扩展使用。

## 特性

- **单文件部署**：Go 编译为单个可执行文件，内嵌 SQLite，无需外部数据库
- **简单认证**：Token 机制，类似 API Key，用户自助生成
- **Docker 友好**：提供 Dockerfile，一行命令即可部署
- **多数据源预留**：架构层预留多数据源接口，未来可切换 PostgreSQL/MySQL
- **版本协商**：扩展与后端版本适配检查，保证兼容性
- **增量同步预留**：架构层预留与「织个网」云端增量同步接口
- **SSE 预留**：预留 SSE 通道，未来支持 AI 远程查询

## 快速开始

### Docker 部署

```bash
docker run -d \
  -p 8080:8080 \
  -v tab-sync-data:/app/data \
  spidermemos/tab-sync-server:latest
```

首次启动后访问 `http://localhost:8080/setup` 完成初始化配置。

### 手动编译

```bash
go mod tidy
go build -o tab-sync-server ./cmd/server
./tab-sync-server
```

## API 文档

启动后访问 `http://localhost:8080/api/docs` 查看完整 API 文档。

## 目录结构

```
tab-sync-server/
├── cmd/server/          # 入口程序
├── internal/
│   ├── config/          # 配置管理
│   ├── database/        # 数据库层（接口 + SQLite 实现）
│   ├── handler/         # HTTP 处理器（Controller）
│   ├── middleware/       # 中间件（认证、CORS、版本检查）
│   ├── model/           # 数据模型
│   ├── repository/      # 数据访问层（接口 + 实现）
│   ├── service/         # 业务逻辑层
│   └── sse/             # SSE 预留模块
├── web/                 # Web 管理界面（嵌入式）
├── Dockerfile
├── docker-compose.yml
└── Makefile
```
