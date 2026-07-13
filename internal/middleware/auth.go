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

// AdminAuth 管理员认证中间件
func AdminAuth(authSvc *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		if !authSvc.IsAdmin(tokenStr) {
			c.JSON(http.StatusForbidden, gin.H{
				"code":    403,
				"success": false,
				"message": "需要管理员权限",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
