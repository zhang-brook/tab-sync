package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync/server/internal/service"
)

// AuthHandler 认证处理器
type AuthHandler struct {
	svc *service.AuthService
}

// NewAuthHandler 创建认证处理器
func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// VerifyTokenRequest 验证 Token 请求
type VerifyTokenRequest struct {
	Token string `json:"token" binding:"required"`
}

// VerifyToken 验证 Token 有效性
func (h *AuthHandler) VerifyToken(c *gin.Context) {
	var req VerifyTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "请提供 token 参数")
		return
	}

	token, err := h.svc.VerifyToken(req.Token)
	if err != nil {
		Unauthorized(c, err.Error())
		return
	}

	Success(c, gin.H{
		"valid": true,
		"user": gin.H{
			"id":       token.TokenID,
			"username": token.Name,
		},
	})
}

// GenerateTokenRequest 生成 Token 请求
type GenerateTokenRequest struct {
	Name    string `json:"name" binding:"required"`
	IsAdmin bool   `json:"isAdmin"`
}

// GenerateToken 生成新的认证 Token
func (h *AuthHandler) GenerateToken(c *gin.Context) {
	var req GenerateTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "请提供 Token 名称")
		return
	}

	token, err := h.svc.GenerateToken(req.Name, req.IsAdmin)
	if err != nil {
		InternalError(c, "生成 Token 失败")
		return
	}

	Created(c, gin.H{
		"tokenId": token.TokenID,
		"token":   token.Token,
		"name":    token.Name,
		"isAdmin": token.IsAdmin,
	})
}

// RevokeToken 吊销 Token
func (h *AuthHandler) RevokeToken(c *gin.Context) {
	tokenID := c.Param("tokenId")
	if tokenID == "" {
		BadRequest(c, "请提供 tokenId")
		return
	}

	if err := h.svc.RevokeToken(tokenID); err != nil {
		Error(c, http.StatusNotFound, err.Error())
		return
	}

	Success(c, gin.H{"revoked": true})
}

// ListTokens 列出所有 Token
func (h *AuthHandler) ListTokens(c *gin.Context) {
	tokens, err := h.svc.ListTokens()
	if err != nil {
		InternalError(c, "获取 Token 列表失败")
		return
	}
	Success(c, gin.H{"tokens": tokens})
}
