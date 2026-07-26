package service

import "time"

// ===================== 增量同步协议 =====================
// 用于浏览器扩展 ↔ 轻量后端 之间的双向同步。
// 织个网上游对接后，扩展为 浏览器扩展 ↔ 轻量后端 ↔ 织个网云端 三级同步。

// SyncPushPayload 浏览器扩展推送的批量同步事件
type SyncPushPayload struct {
	// 设备 ID
	DeviceID string `json:"deviceId"`
	// 扩展版本号
	ExtVersion string `json:"extVersion"`
	// 事件列表
	Events []SyncEventPayload `json:"events"`
}

// SyncPullPayload 拉取同步事件的请求
type SyncPullPayload struct {
	// 设备 ID
	DeviceID string `json:"deviceId"`
	// 上次同步的版本号（0 表示首次拉取）
	Since int64 `json:"since" form:"since"`
	// 单次最大返回条数
	Limit int `json:"limit" form:"limit"`
}

// SyncEventPayload 单个同步事件（序列化友好）
type SyncEventPayload struct {
	// 事件 ID
	EventID string `json:"eventId"`
	// 事件类型：created / updated / removed
	EventType string `json:"eventType"`
	// 实体类型：workspace / tab / device
	EntityType string `json:"entityType"`
	// 实体 ID
	EntityID string `json:"entityId"`
	// 事件载荷 JSON
	Payload interface{} `json:"payload"`
	// 版本号（递增）
	Version int64 `json:"version"`
	// 创建时间
	CreatedAt time.Time `json:"createdAt"`
}

// SyncPullResponse 拉取同步事件的响应
type SyncPullResponse struct {
	// 事件列表
	Events []SyncEventPayload `json:"events"`
	// 最新版本号（客户端可缓存以用于下次拉取）
	LatestVersion int64 `json:"latestVersion"`
	// 是否有更多事件
	HasMore bool `json:"hasMore"`
}

// SyncPushResponse 推送同步事件的响应
type SyncPushResponse struct {
	// 已接受的版本号列表
	AcceptedVersions []int64 `json:"acceptedVersions"`
}

// ===================== 上游同步协议（织个网对接预留） =====================

// UpstreamPushPayload 推送到织个网云端的批量事件
type UpstreamPushPayload struct {
	// 源设备 ID
	DeviceID string `json:"deviceId"`
	// 事件列表
	Events []SyncEventPayload `json:"events"`
}

// UpstreamPushResponse 织个网云端推送响应
type UpstreamPushResponse struct {
	// 已接受的版本号列表
	AcceptedVersions []int64 `json:"acceptedVersions"`
	// 下游需要拉取的远程事件版本号起点
	NeedPullFrom int64 `json:"needPullFrom,omitempty"`
}
