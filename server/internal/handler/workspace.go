package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/service"
)

// WorkspaceHandler 工作组处理器
type WorkspaceHandler struct {
	svc *service.WorkspaceService
}

// NewWorkspaceHandler 创建工作区处理器
func NewWorkspaceHandler(svc *service.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{svc: svc}
}

// List 获取工作组列表
func (h *WorkspaceHandler) List(c *gin.Context) {
	workspaces, err := h.svc.List()
	if err != nil {
		InternalError(c, "获取工作组列表失败")
		return
	}
	Success(c, gin.H{"workspaces": workspaces})
}

// Create 创建工作区
func (h *WorkspaceHandler) Create(c *gin.Context) {
	var payload service.CreateWorkspacePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		BadRequest(c, "请提供完整的工作区信息")
		return
	}

	result, err := h.svc.Create(payload)
	if err != nil {
		InternalError(c, "创建工作区失败")
		return
	}

	Created(c, result)
}

// Update 更新工作区
func (h *WorkspaceHandler) Update(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		BadRequest(c, "请提供工作区 ID")
		return
	}

	var payload service.UpdateWorkspacePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		BadRequest(c, "请求数据格式错误")
		return
	}

	result, err := h.svc.Update(id, payload)
	if err != nil {
		InternalError(c, "更新工作区失败")
		return
	}

	Success(c, gin.H{"workspace": result})
}

// Delete 删除工作区
func (h *WorkspaceHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.svc.Delete(id); err != nil {
		InternalError(c, "删除工作区失败")
		return
	}
	Success(c, gin.H{"success": true})
}

// TabsSummary 获取工作组标签页摘要
func (h *WorkspaceHandler) TabsSummary(c *gin.Context) {
	summaries, err := h.svc.TabsSummary()
	if err != nil {
		InternalError(c, "获取标签页摘要失败")
		return
	}
	Success(c, gin.H{"summaries": summaries})
}

// MoveTabRequest 移动标签页请求
type MoveTabRequest struct {
	TabID    string `json:"tabId" binding:"required"`
	NewIndex int    `json:"newIndex"`
}

// MoveTab 移动标签页
func (h *WorkspaceHandler) MoveTab(c *gin.Context) {
	workspaceID := c.Param("id")
	var req MoveTabRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "请提供 tabId 和 newIndex")
		return
	}

	if err := h.svc.MoveTab(workspaceID, req.TabID, req.NewIndex); err != nil {
		InternalError(c, "移动标签页失败")
		return
	}

	Success(c, gin.H{"success": true})
}

// UpdateTab 更新工作组内单个标签页属性（当前支持手动设置添加时间 addedAt）
func (h *WorkspaceHandler) UpdateTab(c *gin.Context) {
	workspaceID := c.Param("id")
	tabID := c.Param("tabId")

	var payload service.UpdateTabPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		BadRequest(c, "请求数据格式错误")
		return
	}

	if err := h.svc.UpdateTab(workspaceID, tabID, payload); err != nil {
		BadRequest(c, "更新标签页失败: "+err.Error())
		return
	}

	Success(c, gin.H{"success": true})
}
