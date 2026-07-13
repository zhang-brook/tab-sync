package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/service"
)

// SetupHandler 首次设置向导处理器
type SetupHandler struct {
	systemSvc *service.SystemService
	authSvc   *service.AuthService
}

// NewSetupHandler 创建设置向导处理器
func NewSetupHandler(systemSvc *service.SystemService, authSvc *service.AuthService) *SetupHandler {
	return &SetupHandler{systemSvc: systemSvc, authSvc: authSvc}
}

// RenderSetupPage 渲染设置向导页面
func (h *SetupHandler) RenderSetupPage(c *gin.Context) {
	if h.systemSvc.IsSetupDone() {
		c.String(200, "服务已初始化，请使用浏览器扩展连接此服务。")
		return
	}
	// TODO: 渲染嵌入式 Web 设置向导页面
	c.String(200, "Tab Sync Server 设置向导（开发中）")
}

// SetupRequest 初始化请求
type SetupRequest struct {
	AdminPassword string `json:"adminPassword" binding:"required"`
}

// CompleteSetup 完成初始化
func (h *SetupHandler) CompleteSetup(c *gin.Context) {
	if h.systemSvc.IsSetupDone() {
		BadRequest(c, "服务已初始化，不能重复设置")
		return
	}

	var req SetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "请提供管理员密码")
		return
	}

	if err := h.systemSvc.CompleteSetup(req.AdminPassword); err != nil {
		InternalError(c, "初始化失败")
		return
	}

	// 自动生成第一个 Token（管理员 Token）
	token, err := h.authSvc.GenerateToken("默认管理员 Token", true)
	if err != nil {
		InternalError(c, "生成 Token 失败")
		return
	}

	Success(c, gin.H{
		"message":    "初始化成功",
		"adminToken": token.Token,
		"tokenId":    token.TokenID,
		"hint":       "请妥善保管此 Token，它仅显示一次",
	})
}
