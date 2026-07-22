package service

import (
	"crypto/sha256"
	"encoding/hex"

	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/database"
	"github.com/spidermemos/tab-sync-server/internal/model"
)

// SystemService 系统服务
type SystemService struct {
	db  *database.DB
	cfg *config.Config
}

// NewSystemService 创建系统服务
func NewSystemService(db *database.DB, cfg *config.Config) *SystemService {
	return &SystemService{db: db, cfg: cfg}
}

// GetVersionInfo 获取版本信息
func (s *SystemService) GetVersionInfo() map[string]interface{} {
	return map[string]interface{}{
		"server_version":  s.cfg.Version,
		"min_ext_version": s.cfg.MinExtVersion,
		"max_ext_version": s.cfg.MaxExtVersion,
		"api_version":     "v1",
	}
}

// IsSetupDone 检查是否已完成初始化
func (s *SystemService) IsSetupDone() bool {
	var config model.ServerConfig
	result := s.db.First(&config)
	if result.Error != nil {
		return false
	}
	return config.SetupDone
}

// CompleteSetup 完成初始化设置
// 将管理员密码哈希后存储到数据库
func (s *SystemService) CompleteSetup(adminPassword string) error {
	config := model.ServerConfig{
		SetupDone:     true,
		AdminUser:     "admin",
		AdminPassword: hashPassword(adminPassword),
	}
	return s.db.Create(&config).Error
}

// VerifyAdminPassword 验证管理员密码
func (s *SystemService) VerifyAdminPassword(password string) bool {
	var config model.ServerConfig
	result := s.db.First(&config)
	if result.Error != nil {
		return false
	}
	return config.AdminPassword == hashPassword(password)
}

// GetStats 获取统计信息
func (s *SystemService) GetStats() map[string]interface{} {
	var deviceCount, workspaceCount, tabCount int64
	s.db.Model(&model.Device{}).Count(&deviceCount)
	s.db.Model(&model.Workspace{}).Where("is_deleted = ?", false).Count(&workspaceCount)
	s.db.Model(&model.WorkspaceTab{}).Count(&tabCount)

	return map[string]interface{}{
		"devices":    deviceCount,
		"workspaces": workspaceCount,
		"tabs":       tabCount,
	}
}

// hashPassword 使用 SHA-256 哈希密码
func hashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}
