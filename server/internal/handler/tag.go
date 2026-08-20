package handler

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync-server/internal/service"
)

// TagHandler 标签处理器
type TagHandler struct {
	svc *service.TagService
}

// NewTagHandler 创建标签处理器
func NewTagHandler(svc *service.TagService) *TagHandler {
	return &TagHandler{svc: svc}
}

// List 列出标签
func (h *TagHandler) List(c *gin.Context) {
	tags, err := h.svc.List(c.Query("scope"))
	if err != nil {
		InternalError(c, "获取标签失败")
		return
	}
	Success(c, gin.H{"tags": tags})
}

// Create 创建标签
func (h *TagHandler) Create(c *gin.Context) {
	var body struct {
		Name        string `json:"name"`
		Color       string `json:"color"`
		Scope       string `json:"scope"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		BadRequest(c, "参数错误")
		return
	}
	if body.Name == "" {
		BadRequest(c, "标签名不能为空")
		return
	}
	if body.Scope == "" {
		body.Scope = "tab"
	}
	tag, err := h.svc.Create(body.Name, body.Color, body.Scope, body.Description)
	if err != nil {
		InternalError(c, "创建标签失败")
		return
	}
	Created(c, tag)
}

// Update 更新标签（名称/颜色/描述）
func (h *TagHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		BadRequest(c, "无效的标签 ID")
		return
	}
	var body struct {
		Name        string `json:"name"`
		Color       string `json:"color"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		BadRequest(c, "参数错误")
		return
	}
	if body.Name == "" && body.Color == "" && body.Description == nil {
		BadRequest(c, "至少需要提供 name、color 或 description")
		return
	}
	desc := ""
	if body.Description != nil {
		desc = *body.Description
	}
	tag, err := h.svc.Update(uint(id), body.Name, body.Color, desc)
	if err != nil {
		InternalError(c, "更新标签失败")
		return
	}
	Success(c, tag)
}

// Delete 删除标签
func (h *TagHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		BadRequest(c, "无效的标签 ID")
		return
	}
	if err := h.svc.Delete(uint(id)); err != nil {
		InternalError(c, "删除标签失败")
		return
	}
	Success(c, gin.H{"success": true})
}

// AddToTab 给标签页打标签
func (h *TagHandler) AddToTab(c *gin.Context) {
	wsID := c.Param("id")
	tabID, err := strconv.ParseUint(c.Param("tabId"), 10, 64)
	if err != nil {
		BadRequest(c, "无效的标签页 ID")
		return
	}
	var body struct {
		TagID uint `json:"tagId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.TagID == 0 {
		BadRequest(c, "参数错误")
		return
	}
	if err := h.svc.AddToTab(wsID, uint(tabID), body.TagID); err != nil {
		BadRequest(c, err.Error())
		return
	}
	Success(c, gin.H{"success": true})
}

// RemoveFromTab 去掉标签页上的标签
func (h *TagHandler) RemoveFromTab(c *gin.Context) {
	wsID := c.Param("id")
	tabID, _ := strconv.ParseUint(c.Param("tabId"), 10, 64)
	tagID, _ := strconv.ParseUint(c.Param("tagId"), 10, 64)
	if err := h.svc.RemoveFromTab(wsID, uint(tabID), uint(tagID)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			NotFound(c, "标签页或标签关联不存在")
			return
		}
		InternalError(c, "移除标签失败")
		return
	}
	Success(c, gin.H{"success": true})
}

// AddToWorkspace 给工作组打标签
func (h *TagHandler) AddToWorkspace(c *gin.Context) {
	wsID := c.Param("id")
	var body struct {
		TagID uint `json:"tagId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.TagID == 0 {
		BadRequest(c, "参数错误")
		return
	}
	if err := h.svc.AddToWorkspace(wsID, body.TagID); err != nil {
		BadRequest(c, err.Error())
		return
	}
	Success(c, gin.H{"success": true})
}

// RemoveFromWorkspace 去掉工作组上的标签
func (h *TagHandler) RemoveFromWorkspace(c *gin.Context) {
	wsID := c.Param("id")
	tagID, _ := strconv.ParseUint(c.Param("tagId"), 10, 64)
	if err := h.svc.RemoveFromWorkspace(wsID, uint(tagID)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			NotFound(c, "工作组或标签关联不存在")
			return
		}
		InternalError(c, "移除标签失败")
		return
	}
	Success(c, gin.H{"success": true})
}

// GetTabsByTag 获取某个标签下包含的所有云端标签页
func (h *TagHandler) GetTabsByTag(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		BadRequest(c, "无效的标签 ID")
		return
	}
	tabs, err := h.svc.GetTabsByTag(uint(id))
	if err != nil {
		InternalError(c, "获取标签页失败")
		return
	}
	Success(c, gin.H{"tabs": tabs})
}
