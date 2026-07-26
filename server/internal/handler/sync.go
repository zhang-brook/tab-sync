package handler

import (
	"encoding/json"
	"io"

	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/service"
)

// SyncHandler 同步处理器
// 提供浏览器扩展与轻量后端之间的增量同步 API。
type SyncHandler struct {
	svc *service.SyncService
}

// NewSyncHandler 创建同步处理器
func NewSyncHandler(svc *service.SyncService) *SyncHandler {
	return &SyncHandler{svc: svc}
}

// PushEvents 接收浏览器扩展推送的同步事件
// POST /v1/tab-sync/sync/push
//
// 请求体：SyncPushPayload (JSON)
// 响应体：SyncPushResponse
func (h *SyncHandler) PushEvents(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		BadRequest(c, "读取请求体失败")
		return
	}

	var payload service.SyncPushPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		// 解析失败时降级为原始处理
		if err := h.svc.PushEvents(body); err != nil {
			InternalError(c, "同步事件处理失败")
			return
		}
		Success(c, gin.H{"received": true})
		return
	}

	// 结构化协议处理（预留：未来按 deviceID、eventType 分类处理）
	for _, event := range payload.Events {
		h.svc.RecordEvent(
			event.EventType,
			event.EntityType,
			event.EntityID,
			event.Payload,
		)
	}

	Success(c, gin.H{"received": true, "count": len(payload.Events)})
}

// PullEvents 拉取未同步的事件
// GET /v1/tab-sync/sync/pull?since={version}&limit={limit}
//
// 响应体：SyncPullResponse
func (h *SyncHandler) PullEvents(c *gin.Context) {
	var req service.SyncPullPayload
	if err := c.ShouldBindQuery(&req); err != nil {
		// since 参数可选，默认为 0
		req.Since = 0
	}
	if req.Limit <= 0 {
		req.Limit = 100
	}

	events, err := h.svc.PullEvents(req.Since)
	if err != nil {
		InternalError(c, "拉取同步事件失败")
		return
	}

	// 截取 limit
	hasMore := len(events) > req.Limit
	if hasMore {
		events = events[:req.Limit]
	}

	var latestVersion int64
	result := make([]service.SyncEventPayload, 0, len(events))
	for _, e := range events {
		result = append(result, service.SyncEventPayload{
			EventID:    e.EventID,
			EventType:  e.EventType,
			EntityType: e.EntityType,
			EntityID:   e.EntityID,
			Payload:    e.Payload,
			Version:    e.Version,
			CreatedAt:  e.CreatedAt,
		})
		if e.Version > latestVersion {
			latestVersion = e.Version
		}
	}

	Success(c, service.SyncPullResponse{
		Events:        result,
		LatestVersion: latestVersion,
		HasMore:       hasMore,
	})
}
