package handler

import (
	"errors"
	"io"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/spidermemos/tab-sync/server/internal/service"
)

// restorePayload 恢复请求体；workspaceId 为空时回退到「未分组」
type restorePayload struct {
	WorkspaceID string `json:"workspaceId"`
}

// RecycleBinHandler 回收站相关接口
type RecycleBinHandler struct {
	svc *service.RecycleBinService
}

// NewRecycleBinHandler 创建回收站处理器
func NewRecycleBinHandler(svc *service.RecycleBinService) *RecycleBinHandler {
	return &RecycleBinHandler{svc: svc}
}

// List 分页获取回收站标签页列表。
// 查询参数：page/pageSize（默认 1/20）、sort（name/deletedAt/addedAt，默认删除时间）、order（asc/desc，默认 desc）。
func (h *RecycleBinHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}

	result, err := h.svc.List(page, pageSize, c.Query("sort"), c.Query("order"))
	if err != nil {
		InternalError(c, "获取回收站失败")
		return
	}
	Success(c, result)
}

// Restore 恢复一条回收站标签页（可指定目标工作组）
func (h *RecycleBinHandler) Restore(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		BadRequest(c, "无效的回收站条目 ID")
		return
	}
	var payload restorePayload
	// 旧客户端不带请求体，按「未分组」处理
	if err := c.ShouldBindJSON(&payload); err != nil && !errors.Is(err, io.EOF) {
		BadRequest(c, "请求体格式错误")
		return
	}
	if _, err := h.svc.Restore([]uint{uint(id)}, payload.WorkspaceID); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"success": true})
}

// RestoreBatch 批量恢复回收站标签页到指定工作组
func (h *RecycleBinHandler) RestoreBatch(c *gin.Context) {
	var payload struct {
		IDs         []uint `json:"ids"`
		WorkspaceID string `json:"workspaceId"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || len(payload.IDs) == 0 {
		BadRequest(c, "请选择要恢复的标签页")
		return
	}
	restored, err := h.svc.Restore(payload.IDs, payload.WorkspaceID)
	if err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"success": true, "restored": restored})
}

// Delete 彻底删除一条回收站标签页
func (h *RecycleBinHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		BadRequest(c, "无效的回收站条目 ID")
		return
	}
	if err := h.svc.Delete(uint(id)); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"success": true})
}

// Empty 清空回收站
func (h *RecycleBinHandler) Empty(c *gin.Context) {
	if err := h.svc.Empty(); err != nil {
		InternalError(c, "清空回收站失败")
		return
	}
	Success(c, gin.H{"success": true})
}
