package handler

import (
	"io"

	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/service"
)

// SyncHandler 同步处理器
type SyncHandler struct {
	svc *service.SyncService
}

// NewSyncHandler 创建同步处理器
func NewSyncHandler(svc *service.SyncService) *SyncHandler {
	return &SyncHandler{svc: svc}
}

// PushEvents 接收浏览器扩展推送的同步事件（预留）
func (h *SyncHandler) PushEvents(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		BadRequest(c, "读取请求体失败")
		return
	}

	if err := h.svc.PushEvents(body); err != nil {
		InternalError(c, "同步事件处理失败")
		return
	}

	Success(c, gin.H{"received": true})
}

// PullEvents 拉取未同步的事件（预留）
func (h *SyncHandler) PullEvents(c *gin.Context) {
	var req struct {
		Since int64 `form:"since"`
	}
	if err := c.ShouldBindQuery(&req); err != nil {
		// since 参数可选，默认为 0
		req.Since = 0
	}

	events, err := h.svc.PullEvents(req.Since)
	if err != nil {
		InternalError(c, "拉取同步事件失败")
		return
	}

	Success(c, gin.H{"events": events})
}
