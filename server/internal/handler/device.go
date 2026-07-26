package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/model"
	"github.com/spidermemos/tab-sync-server/internal/service"
)

// DeviceHandler 设备处理器
type DeviceHandler struct {
	svc *service.DeviceService
}

// NewDeviceHandler 创建设备处理器
func NewDeviceHandler(svc *service.DeviceService) *DeviceHandler {
	return &DeviceHandler{svc: svc}
}

// RegisterDeviceRequest 注册设备请求
type RegisterDeviceRequest struct {
	DeviceID string `json:"deviceId" binding:"required"`
	Name     string `json:"name" binding:"required"`
	Browser  string `json:"browser"`
	OS       string `json:"os"`
}

// Register 注册设备
func (h *DeviceHandler) Register(c *gin.Context) {
	var req RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "请提供完整的设备信息")
		return
	}

	device, err := h.svc.Register(req.DeviceID, req.Name, req.Browser, req.OS)
	if err != nil {
		InternalError(c, "注册设备失败")
		return
	}

	Created(c, gin.H{
		"device": deviceToMap(device),
	})
}

// List 获取设备列表
func (h *DeviceHandler) List(c *gin.Context) {
	devices, err := h.svc.List()
	if err != nil {
		InternalError(c, "获取设备列表失败")
		return
	}

	result := make([]gin.H, len(devices))
	for i, d := range devices {
		result[i] = deviceToMap(&d)
	}

	Success(c, gin.H{"devices": result})
}

// Update 更新设备
func (h *DeviceHandler) Update(c *gin.Context) {
	deviceID := c.Param("deviceId")
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequest(c, "请提供设备名称")
		return
	}

	device, err := h.svc.Update(deviceID, req.Name)
	if err != nil {
		NotFound(c, "设备不存在")
		return
	}

	Success(c, gin.H{"device": deviceToMap(device)})
}

// Heartbeat 设备心跳
func (h *DeviceHandler) Heartbeat(c *gin.Context) {
	deviceID := c.Param("deviceId")
	if err := h.svc.Heartbeat(deviceID); err != nil {
		InternalError(c, "心跳更新失败")
		return
	}
	Success(c, gin.H{"ok": true})
}

// Deregister 注销设备
func (h *DeviceHandler) Deregister(c *gin.Context) {
	deviceID := c.Param("deviceId")
	if err := h.svc.Deregister(deviceID); err != nil {
		InternalError(c, "注销设备失败")
		return
	}
	Success(c, gin.H{"ok": true})
}

// deviceToMap 设备模型转响应 map
func deviceToMap(d *model.Device) gin.H {
	return gin.H{
		"id":       d.DeviceID,
		"name":     d.Name,
		"browser":  d.Browser,
		"os":       d.OS,
		"lastSeen": d.LastSeen.Format("2006-01-02T15:04:05Z07:00"),
	}
}
