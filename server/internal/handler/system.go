package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync/server/internal/service"
)

// SystemHandler 系统处理器
type SystemHandler struct {
	svc *service.SystemService
}

// NewSystemHandler 创建系统处理器
func NewSystemHandler(svc *service.SystemService) *SystemHandler {
	return &SystemHandler{svc: svc}
}

// GetVersion 获取版本信息（扩展启动时握手协商）
func (h *SystemHandler) GetVersion(c *gin.Context) {
	info := h.svc.GetVersionInfo()
	Success(c, info)
}

// GetStats 获取统计信息
func (h *SystemHandler) GetStats(c *gin.Context) {
	stats := h.svc.GetStats()
	Success(c, stats)
}

// GetDashboardStats 获取管理面板概览统计（仅数量，避免前端全量拉取列表）
func (h *SystemHandler) GetDashboardStats(c *gin.Context) {
	stats, err := h.svc.GetDashboardStats()
	if err != nil {
		InternalError(c, "获取概览统计失败")
		return
	}
	Success(c, stats)
}
