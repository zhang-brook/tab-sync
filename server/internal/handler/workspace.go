package handler

import (
	"errors"
	"net/http"
	"strings"

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
// 查询参数 includeSystem=true 时包含系统工作组（如「未分组」），默认仅返回用户可管理的普通工作组
// 查询参数 includeTabs=true 时同时返回每个工作组的标签页，默认仅返回工作组元信息（不含标签页）。
// 管理页面左侧工作组树使用 includeTabs=false 以避免全量拉取标签页，右侧列表按需调用 GetTabs。
func (h *WorkspaceHandler) List(c *gin.Context) {
	includeSystem := c.Query("includeSystem") == "true"
	includeTabs := c.Query("includeTabs") != "false"
	workspaces, err := h.svc.List(includeSystem, includeTabs)
	if err != nil {
		InternalError(c, "获取工作组列表失败")
		return
	}
	Success(c, gin.H{"workspaces": workspaces})
}

// GetTabs 获取工作组的标签页列表（管理页面右侧列表按需拉取）
// 查询参数 recursive=true 时返回该工作组自身及整棵子树的标签页（按工作区分组，一次请求），
// 用于「包含子工作组」模式，避免前端逐个工作组批量请求。
func (h *WorkspaceHandler) GetTabs(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		BadRequest(c, "请提供工作区 ID")
		return
	}
	if c.Query("recursive") == "true" {
		groups, err := h.svc.GetTabsTree(id)
		if err != nil {
			if errors.Is(err, service.ErrWorkspaceNotFound) {
				NotFound(c, "工作组不存在")
				return
			}
			InternalError(c, "获取工作组标签页失败")
			return
		}
		c.JSON(http.StatusOK, gin.H{"groups": groups})
		return
	}
	tabs, err := h.svc.GetTabs(id)
	if err != nil {
		if errors.Is(err, service.ErrWorkspaceNotFound) {
			NotFound(c, "工作组不存在")
			return
		}
		InternalError(c, "获取工作组标签页失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"tabs": tabs})
}

// Create 创建工作区
func (h *WorkspaceHandler) Create(c *gin.Context) {
	var payload service.CreateWorkspacePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		BadRequest(c, "请提供完整的工作区信息")
		return
	}

	if len(payload.Description) > 500 {
		BadRequest(c, "工作区描述不能超过 500 个字符")
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

	if payload.Description != nil && len(*payload.Description) > 500 {
		BadRequest(c, "工作区描述不能超过 500 个字符")
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
	// 默认分组由前端以查询参数传入，避免其被删后「加入并关闭」等快捷操作失效
	defaultWorkspaceID := c.Query("defaultWorkspaceId")
	if err := h.svc.Delete(id, defaultWorkspaceID); err != nil {
		BadRequest(c, err.Error())
		return
	}
	Success(c, gin.H{"success": true})
}

// DeleteTab 删除工作组中的单个标签页（统一进入回收站）
func (h *WorkspaceHandler) DeleteTab(c *gin.Context) {
	workspaceID := c.Param("id")
	tabID := c.Param("tabId")
	if err := h.svc.DeleteTab(workspaceID, tabID); err != nil {
		if strings.Contains(err.Error(), "不存在") {
			NotFound(c, err.Error())
			return
		}
		BadRequest(c, err.Error())
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

// AddTabByURL 通过 URL 向工作组添加标签页
func (h *WorkspaceHandler) AddTabByURL(c *gin.Context) {
	workspaceID := c.Param("id")

	var payload service.AddTabByURLPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		BadRequest(c, "请提供有效的 URL")
		return
	}

	tab, err := h.svc.AddTabByURL(workspaceID, payload)
	if err != nil {
		BadRequest(c, "添加标签页失败: "+err.Error())
		return
	}

	Created(c, gin.H{"tab": tab})
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
