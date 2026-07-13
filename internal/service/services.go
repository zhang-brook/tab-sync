package service

import (
	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/database"
)

// Services 聚合所有服务
type Services struct {
	Auth      *AuthService
	Device    *DeviceService
	Workspace *WorkspaceService
	Sync      *SyncService
	System    *SystemService
	SSE       *SSEService
}

// NewServices 创建所有服务实例
func NewServices(db *database.DB, cfg *config.Config) *Services {
	authSvc := NewAuthService(db, cfg)
	deviceSvc := NewDeviceService(db)
	workspaceSvc := NewWorkspaceService(db)
	syncSvc := NewSyncService(db, cfg)
	systemSvc := NewSystemService(db, cfg)
	sseSvc := NewSSEService()

	return &Services{
		Auth:      authSvc,
		Device:    deviceSvc,
		Workspace: workspaceSvc,
		Sync:      syncSvc,
		System:    systemSvc,
		SSE:       sseSvc,
	}
}
