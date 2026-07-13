package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CommonReturn 统一响应体（与织个网后端 CommonReturn 格式兼容）
type CommonReturn struct {
	Code             int         `json:"code"`
	Success          bool        `json:"success"`
	Data             interface{} `json:"data,omitempty"`
	Message          string      `json:"message,omitempty"`
	DeveloperMessage string      `json:"developerMessage,omitempty"`
	TraceID          string      `json:"traceId,omitempty"`
}

// Success 成功响应
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, CommonReturn{
		Code:    0,
		Success: true,
		Data:    data,
	})
}

// Created 创建成功响应 (201)
func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, CommonReturn{
		Code:    0,
		Success: true,
		Data:    data,
	})
}

// NoContent 无内容成功响应 (204)
func NoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

// Error 错误响应
func Error(c *gin.Context, httpStatus int, message string) {
	c.JSON(httpStatus, CommonReturn{
		Code:             httpStatus,
		Success:          false,
		Message:          message,
		DeveloperMessage: message,
	})
}

// BadRequest 400 错误
func BadRequest(c *gin.Context, message string) {
	Error(c, http.StatusBadRequest, message)
}

// Unauthorized 401 错误
func Unauthorized(c *gin.Context, message string) {
	Error(c, http.StatusUnauthorized, message)
}

// NotFound 404 错误
func NotFound(c *gin.Context, message string) {
	Error(c, http.StatusNotFound, message)
}

// InternalError 500 错误
func InternalError(c *gin.Context, message string) {
	Error(c, http.StatusInternalServerError, message)
}
