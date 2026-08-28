package handler

import (
	"fmt"
	"io"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync/server/internal/service"
)

// ToolCallRequest AI 远程查询请求（预留协议）
// 由织个网上游下发，通过 SSE 转发到浏览器扩展执行。
type ToolCallRequest struct {
	// 请求 ID（用于匹配响应）
	RequestID string `json:"requestId"`
	// 目标设备 ID
	DeviceID string `json:"deviceId"`
	// 工具名称（如 "browse_open", "tab_search", "tab_get"）
	Tool string `json:"tool"`
	// 工具参数 JSON
	Arguments map[string]interface{} `json:"arguments"`
}

// ToolCallResponse AI 远程查询响应（预留协议）
type ToolCallResponse struct {
	// 对应的请求 ID
	RequestID string `json:"requestId"`
	// 设备 ID
	DeviceID string `json:"deviceId"`
	// 执行结果 JSON
	Result interface{} `json:"result,omitempty"`
	// 错误信息（如有）
	Error string `json:"error,omitempty"`
}

// SSEHandler SSE 处理器
// 管理浏览器扩展的长连接 + AI 远程查询转发（预留）。
type SSEHandler struct {
	svc *service.SSEService
}

// NewSSEHandler 创建 SSE 处理器
func NewSSEHandler(svc *service.SSEService) *SSEHandler {
	return &SSEHandler{svc: svc}
}

// Stream 建立 SSE 连接（浏览器扩展 ↔ 轻量后端）
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

// HandleToolCall 接收织个网上游下发的 tool_call 请求并路由到目标设备（预留）
// POST /v1/tab-sync/tool-calling
//
// 请求体：ToolCallRequest
// 处理流程（预留）：
//  1. 验证上游来源（通过 Token 或 IP 白名单）
//  2. 将请求序列化为 JSON 并通过 SSE channel 发送到目标设备
//  3. 等待设备响应（带超时）
//  4. 返回 ToolCallResponse 给上游
//
// 当前为架构预留，不实现具体路由逻辑。
func (h *SSEHandler) HandleToolCall(c *gin.Context) {
	var req ToolCallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "无效的 tool_call 请求")
		return
	}

	// 验证必填字段
	if req.RequestID == "" || req.DeviceID == "" || req.Tool == "" {
		BadRequest(c, "缺少必填字段：requestId, deviceId, tool")
		return
	}

	// TODO: 实现工具调用路由
	// 1. 检查目标设备是否在线
	// 2. 如果不在线，返回 404 "设备不在线"
	// 3. 将请求序列化并通过 SSE channel 发送
	// 4. 等待设备响应（超时 30s）
	// 5. 返回响应或错误

	Success(c, ToolCallResponse{
		RequestID: req.RequestID,
		DeviceID:  req.DeviceID,
		Error:     "tool_calling 功能预留中，尚未实现",
	})
}
