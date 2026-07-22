package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TraceIDKey 在 gin.Context 中存储 TraceID 的 key
const TraceIDKey = "trace_id"

// TraceID 中间件：为每个请求生成唯一 traceId
// 注入 gin.Context，同时在响应头 X-Trace-Id 中返回，方便客户端排查问题
func TraceID() gin.HandlerFunc {
	return func(c *gin.Context) {
		traceID := uuid.New().String()
		c.Set(TraceIDKey, traceID)
		c.Header("X-Trace-Id", traceID)
		c.Next()
	}
}
