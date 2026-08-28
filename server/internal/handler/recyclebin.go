package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/spidermemos/tab-sync/server/internal/service"
)

// RecycleBinHandler 回收站相关接口
type RecycleBinHandler struct {
	svc *service.RecycleBinService
}

// NewRecycleBinHandler 创建回收站处理器
func NewRecycleBinHandler(svc *service.RecycleBinService) *RecycleBinHandler {
	return &RecycleBinHandler{svc: svc}
}

// List 获取回收站标签页列表
func (h *RecycleBinHandler) List(c *gin.Context) {
	items, err := h.svc.List()
	if err != nil {
		InternalError(c, "获取回收站失败")
		return
	}
	Success(c, items)
}

// Restore 恢复一条回收站标签页（统一恢复到「未分组」）
func (h *RecycleBinHandler) Restore(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		BadRequest(c, "无效的回收站条目 ID")
		return
	}
	if err := h.svc.Restore(uint(id)); err != nil {
		InternalError(c, err.Error())
		return
	}
	Success(c, gin.H{"success": true})
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
