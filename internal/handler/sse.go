package handler

import (
	"fmt"
	"io"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/service"
)

// SSEHandler SSE 处理器（预留，用于 AI 远程查询 tool_calling）
type SSEHandler struct {
	svc *service.SSEService
}

// NewSSEHandler 创建 SSE 处理器
func NewSSEHandler(svc *service.SSEService) *SSEHandler {
	return &SSEHandler{svc: svc}
}

// Stream 建立 SSE 连接
func (h *SSEHandler) Stream(c *gin.Context) {
	clientID := c.GetString("device_id")
	if clientID == "" {
		clientID = fmt.Sprintf("client-%d", time.Now().UnixNano())
	}

	ch := h.svc.RegisterClient(clientID)
	defer h.svc.UnregisterClient(clientID)

	c.Stream(func(w io.Writer) bool {
		// 发送心跳保持连接
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		// 先发送一个连接成功事件
		c.SSEvent("connected", gin.H{
			"clientId":  clientID,
			"timestamp": time.Now().Unix(),
		})

		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					return false
				}
				c.SSEvent("message", string(msg))
			case <-ticker.C:
				// 心跳
				c.SSEvent("heartbeat", gin.H{
					"timestamp": time.Now().Unix(),
				})
			case <-c.Request.Context().Done():
				return false
			}
		}
	})
}
