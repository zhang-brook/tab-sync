package service

import (
	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/database"
)

// Services 聚合所有服务
type Services struct {
	Auth       *AuthService
	Device     *DeviceService
	Workspace  *WorkspaceService
	Sync       *SyncService
	System     *SystemService
	SSE        *SSEService
	Tag        *TagService
	RecycleBin *RecycleBinService
}

// NewServices 创建所有服务实例
// SyncService 先于 WorkspaceService / DeviceService 创建，因为它们依赖 SyncService 记录变更事件。
func NewServices(db *database.DB, cfg *config.Config) *Services {
	syncSvc := NewSyncService(db, cfg)
	authSvc := NewAuthService(db, cfg)
	deviceSvc := NewDeviceService(db, syncSvc)
	workspaceSvc := NewWorkspaceService(db, syncSvc)
	recycleBinSvc := NewRecycleBinService(db, workspaceSvc)
	workspaceSvc.RecycleBin = recycleBinSvc
	systemSvc := NewSystemService(db, cfg)
	sseSvc := NewSSEService(cfg)
	tagSvc := NewTagService(db)

	return &Services{
		Auth:       authSvc,
		Device:     deviceSvc,
		Workspace:  workspaceSvc,
		Sync:       syncSvc,
		System:     systemSvc,
		SSE:        sseSvc,
		Tag:        tagSvc,
		RecycleBin: recycleBinSvc,
	}
}
