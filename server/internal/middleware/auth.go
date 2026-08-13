package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/service"
)

// TokenAuth Token 认证中间件
// 从 Authorization: Bearer <token> 头中提取并验证 Token
func TokenAuth(authSvc *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"success": false,
				"message": "未提供认证 Token",
			})
			c.Abort()
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"success": false,
				"message": "认证格式错误，请使用 Bearer Token",
			})
			c.Abort()
			return
		}

		token, err := authSvc.VerifyToken(tokenStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"success": false,
				"message": "Token 无效或已过期",
			})
			c.Abort()
			return
		}

		// 将 Token 信息注入上下文
		c.Set("token_id", token.TokenID)
		c.Set("token_name", token.Name)
		c.Set("is_admin", token.IsAdmin)

		// 从 Header 中提取设备 ID
		deviceID := c.GetHeader("X-Device-Id")
		if deviceID != "" {
			c.Set("device_id", deviceID)
		}

		c.Next()
	}
}

// AdminOrJWTAuth 管理员认证中间件（支持 Admin Token 或 JWT 会话）
// 管理后台 Web 界面使用 JWT，API 调用使用 Admin Token。
// 状态码约定：凭证缺失/无效/过期返回 401（前端据此跳转登录页），
// 凭证有效但权限不足返回 403。
func AdminOrJWTAuth(authSvc *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"success": false,
				"message": "未提供认证信息",
			})
			c.Abort()
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		// 先尝试作为访问 Token 验证：有效但非管理员 Token 属权限不足
		if token, err := authSvc.VerifyToken(tokenStr); err == nil {
			if token.IsAdmin {
				c.Next()
				return
			}
			c.JSON(http.StatusForbidden, gin.H{
				"code":    403,
				"success": false,
				"message": "需要管理员权限",
			})
			c.Abort()
			return
		}

		// 再尝试作为 JWT 会话验证
		if claims, err := authSvc.ValidateJWT(tokenStr); err == nil {
			sub, _ := claims.GetSubject()
			if sub == "admin" {
				c.Next()
				return
			}
			c.JSON(http.StatusForbidden, gin.H{
				"code":    403,
				"success": false,
				"message": "需要管理员权限",
			})
			c.Abort()
			return
		}

		// 凭证无效或已过期：视为未登录，前端据此跳转登录页
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"success": false,
			"message": "认证无效或已过期，请重新登录",
		})
		c.Abort()
	}
}
