# 步骤 3：API 兼容层

> **目标**：确保轻量后端 API 响应格式与织个网后端完全兼容，扩展端无需大幅改动 API 调用代码。

## 状态

- [ ] 3.1 确认 CommonReturn 响应格式一致性
- [ ] 3.2 验证所有 API 端点的请求/响应格式
- [ ] 3.3 编写 API 兼容性对比文档
- [ ] 3.4 实现 API 文档页面（嵌入式 Swagger / 自定义文档页）
- [ ] 3.5 版本号映射表

---

## 详细说明

### 3.1 CommonReturn 响应格式

织个网后端的 `CommonReturn` 格式：
```json
{
  "code": 0,
  "success": true,
  "data": { ... },
  "message": "操作成功",
  "developerMessage": "Operation successful",
  "traceId": "abc-123-def"
}
```

轻量后端的 `CommonReturn` 格式（已实现）：
```go
type CommonReturn struct {
    Code             int         `json:"code"`
    Success          bool        `json:"success"`
    Data             interface{} `json:"data,omitempty"`
    Message          string      `json:"message,omitempty"`
    DeveloperMessage string      `json:"developerMessage,omitempty"`
    TraceID          string      `json:"traceId,omitempty"`
}
```

**兼容性检查**：
- ✅ `code` — 一致（成功为 0，错误为 HTTP 状态码）
- ✅ `success` — 一致
- ✅ `data` — 一致
- ⚠️ `message` / `developerMessage` — 轻量后端当前仅填充 `message`，`developerMessage` 为空
- ⚠️ `traceId` — 轻量后端当前未生成，需添加 TraceID 中间件

### 3.2 API 端点兼容性对比

| 端点 | 方法 | 织个网后端 | 轻量后端 | 兼容性 |
|------|------|-----------|---------|--------|
| `/v1/tab-sync/auth/verify-token` | POST | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/auth/login` | POST | ✅ | ❌ 不需要 | ⚠️ 扩展需移除 |
| `/v1/tab-sync/auth/refresh` | POST | ✅ | ❌ 不需要 | ⚠️ 扩展需移除 |
| `/v1/tab-sync/auth/logout` | POST | ✅ | ❌ 不需要 | ⚠️ 扩展需移除 |
| `/v1/tab-sync/version` | GET | ❌ | ✅ | 🆕 新增 |
| `/v1/tab-sync/devices/register` | POST | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/devices` | GET | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/devices/:id` | PATCH | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/devices/:id/heartbeat` | POST | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/devices/:id` | DELETE | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/workspaces` | GET | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/workspaces` | POST | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/workspaces/:id` | PUT | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/workspaces/:id` | DELETE | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/workspaces/tabs-summary` | GET | ✅ | ✅ | ✅ 兼容 |
| `/v1/tab-sync/workspaces/:id/tabs/move` | POST | ✅ | ✅ | ✅ 兼容 |

### 3.3 响应数据格式对比

#### 设备注册响应

**织个网后端**：
```json
{
  "device": {
    "id": "uuid",
    "name": "Chrome",
    "browser": "Chrome",
    "os": "Windows",
    "lastSeen": "2024-01-01T00:00:00Z"
  }
}
```

**轻量后端**：
```json
{
  "device": {
    "id": "uuid",
    "name": "Chrome",
    "browser": "Chrome",
    "os": "Windows",
    "lastSeen": "2024-01-01T00:00:00+08:00"
  }
}
```

⚠️ 时区格式略有不同（Z vs +08:00），但不影响 JSON 解析。

#### 工作组创建响应

**织个网后端**：
```json
{
  "workspace": { ... },
  "mappings": { "123": "uuid-xxx" }
}
```

**轻量后端**：
```json
{
  "workspace": { ... },
  "mappings": { "123": "uuid-xxx" }
}
```

✅ 格式一致。

### 3.4 API 文档页面

轻量后端需提供一个 API 文档页面：
- 启动后访问 `http://localhost:8080/api/docs` 可查看完整 API 文档
- 可以嵌入 Swagger UI（使用 `swaggo/swag`）或自建简单文档页
- 文档应包含：端点列表、请求/响应示例、认证说明

### 3.5 版本号映射表

维护一个扩展版本与后端版本的适配表格：

| 扩展版本 | 最低后端版本 | 最高后端版本 | 说明 |
|---------|-------------|-------------|------|
| 1.0.x | 1.0.0 | 1.x.x | 初始版本 |
| 1.1.x | 1.0.0 | 1.x.x | 新增版本协商 |
| 2.0.x | 2.0.0 | 2.x.x | 新增 SSE 支持（计划） |

此表格应维护在轻量后端的 `internal/handler/system.go` 的 `GetVersion` 响应中。

---

## 关键注意点

1. **织个网后端使用雪花 ID，轻量后端使用自增 ID**：响应中 ID 字段应使用 UUID（workspaceId / deviceId），不应暴露数据库内部 ID
2. **日期时间格式**：统一使用 RFC 3339 / ISO 8601
3. **空值处理**：JSON 响应中 `null` vs 省略字段的一致性

## 产出物

- [ ] TraceID 中间件
- [ ] API 文档页面
- [ ] 兼容性对比文档
- [ ] 版本号映射表
