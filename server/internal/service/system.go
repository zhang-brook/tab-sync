package service

import (
	"crypto/sha256"
	"encoding/hex"
	"os"

	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/database"
	"github.com/spidermemos/tab-sync/server/internal/model"
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

// VersionRange 扩展版本兼容范围
type VersionRange struct {
	MinExtVersion string `json:"minExtVersion"`
	MaxExtVersion string `json:"maxExtVersion"`
	Description   string `json:"description"`
}

// GetVersionInfo 获取版本信息（含版本兼容性映射表）
func (s *SystemService) GetVersionInfo() map[string]interface{} {
	return map[string]interface{}{
		"serverVersion": s.cfg.Version,
		"minExtVersion": s.cfg.MinExtVersion,
		"maxExtVersion": s.cfg.MaxExtVersion,
		"apiVersion":    "v1",
		// 扩展 → 后端版本兼容性映射表
		"versionMap": []VersionRange{
			{
				MinExtVersion: "1.0.0",
				MaxExtVersion: "1.x.x",
				Description:   "初始版本，支持设备注册、工作组 CRUD、Token 认证",
			},
			{
				MinExtVersion: "1.1.0",
				MaxExtVersion: "1.x.x",
				Description:   "新增版本协商、连接模式切换",
			},
			{
				MinExtVersion: "2.0.0",
				MaxExtVersion: "2.x.x",
				Description:   "计划：SSE 远程查询、织个网上游对接",
			},
		},
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
// 将管理员密码哈希后存储到数据库，并持久化当前 JWT 签名密钥，
// 保证后续后端重启后管理员登录态依然有效。
func (s *SystemService) CompleteSetup(adminPassword string) error {
	var config model.ServerConfig
	// 复用单例配置行（不新建重复记录）
	if err := s.db.First(&config).Error; err != nil {
		config = model.ServerConfig{}
	}
	config.SetupDone = true
	config.AdminUser = "admin"
	config.AdminPassword = hashPassword(adminPassword)
	config.JWTSecret = s.cfg.JWTSecret
	return s.db.Save(&config).Error
}

// ResolveJWTSecret 解析并持久化 JWT 签名密钥，保证后端重启后管理员
// 登录态依然有效：
//  1. 若设置了 JWT_SECRET 环境变量，优先使用；
//  2. 否则尝试读取数据库中已持久化的密钥；
//  3. 若数据库无密钥（历史数据或未初始化），则生成随机密钥：
//     - 已初始化：写回单例配置行；
//     - 未初始化：保留在内存，待 CompleteSetup 时持久化。
func ResolveJWTSecret(db *database.DB, cfg *config.Config) {
	if env := os.Getenv("JWT_SECRET"); env != "" {
		cfg.JWTSecret = env
		return
	}
	var sc model.ServerConfig
	if err := db.First(&sc).Error; err == nil {
		if sc.JWTSecret != "" {
			cfg.JWTSecret = sc.JWTSecret
			return
		}
		// 已初始化但密钥未持久化（历史数据）：生成并写回
		sc.JWTSecret = config.GenerateRandomSecret()
		cfg.JWTSecret = sc.JWTSecret
		db.Save(&sc)
		return
	}
	// 尚未初始化：内存密钥已由 buildConfig 生成，待 CompleteSetup 持久化
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
