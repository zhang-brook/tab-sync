package service

import (
	"time"

	"github.com/spidermemos/tab-sync/server/internal/database"
	"github.com/spidermemos/tab-sync/server/internal/model"
)

// DeviceService 设备管理服务
type DeviceService struct {
	db      *database.DB
	syncSvc *SyncService
}

// NewDeviceService 创建设备服务
func NewDeviceService(db *database.DB, syncSvc *SyncService) *DeviceService {
	return &DeviceService{db: db, syncSvc: syncSvc}
}

// Register 注册或更新设备（幂等）
func (s *DeviceService) Register(deviceID, name, browser, os string) (*model.Device, error) {
	var device model.Device
	result := s.db.Where("device_id = ?", deviceID).First(&device)

	isNew := false
	if result.Error != nil {
		// 设备不存在，创建新记录
		isNew = true
		device = model.Device{
			DeviceID: deviceID,
			Name:     name,
			Browser:  browser,
			OS:       os,
			LastSeen: time.Now(),
		}
		if err := s.db.Create(&device).Error; err != nil {
			return nil, err
		}
	} else {
		// 设备已存在，更新信息
		s.db.Model(&device).Updates(map[string]interface{}{
			"name":      name,
			"browser":   browser,
			"os":        os,
			"last_seen": time.Now(),
		})
	}

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		if isNew {
			s.syncSvc.RecordEvent("created", "device", deviceID, device)
		} else {
			s.syncSvc.RecordEvent("updated", "device", deviceID, map[string]string{
				"name":    name,
				"browser": browser,
				"os":      os,
			})
		}
	}

	return &device, nil
}

// List 获取设备列表
func (s *DeviceService) List() ([]model.Device, error) {
	var devices []model.Device
	err := s.db.Order("last_seen DESC").Find(&devices).Error
	return devices, err
}

// Update 更新设备名称
func (s *DeviceService) Update(deviceID, name string) (*model.Device, error) {
	var device model.Device
	if err := s.db.Where("device_id = ?", deviceID).First(&device).Error; err != nil {
		return nil, err
	}
	s.db.Model(&device).Update("name", name)
	return &device, nil
}

// Heartbeat 设备心跳
func (s *DeviceService) Heartbeat(deviceID string) error {
	return s.db.Model(&model.Device{}).
		Where("device_id = ?", deviceID).
		Update("last_seen", time.Now()).Error
}

// Deregister 注销设备
func (s *DeviceService) Deregister(deviceID string) error {
	err := s.db.Where("device_id = ?", deviceID).Delete(&model.Device{}).Error
	if err != nil {
		return err
	}

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("removed", "device", deviceID, map[string]string{"deviceId": deviceID})
	}

	return nil
}
