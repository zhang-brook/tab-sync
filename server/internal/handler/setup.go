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

// GetSetupStatus 查询初始化状态（前端页面加载时检测）
func (h *SetupHandler) GetSetupStatus(c *gin.Context) {
	done := h.systemSvc.IsSetupDone()
	Success(c, gin.H{
		"setupDone": done,
	})
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

	// 生成管理后台 JWT 会话
	jwt, err := h.authSvc.GenerateJWT("admin")
	if err != nil {
		InternalError(c, "生成会话失败")
		return
	}

	Created(c, gin.H{
		"message":    "初始化成功",
		"adminToken": token.Token,
		"tokenId":    token.TokenID,
		"jwt":        jwt,
		"hint":       "请妥善保管此 Token，它仅显示一次",
	})
}

// AdminLoginRequest 管理后台登录请求
type AdminLoginRequest struct {
	Password string `json:"password" binding:"required"`
}

// AdminLogin 管理后台登录
func (h *SetupHandler) AdminLogin(c *gin.Context) {
	if !h.systemSvc.IsSetupDone() {
		BadRequest(c, "服务尚未初始化，请先完成设置向导")
		return
	}

	var req AdminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "请提供管理员密码")
		return
	}

	if !h.systemSvc.VerifyAdminPassword(req.Password) {
		Unauthorized(c, "密码错误")
		return
	}

	jwt, err := h.authSvc.GenerateJWT("admin")
	if err != nil {
		InternalError(c, "生成会话失败")
		return
	}

	Success(c, gin.H{
		"jwt":     jwt,
		"message": "登录成功",
	})
}
