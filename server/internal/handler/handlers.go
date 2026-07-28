package handler

import "github.com/spidermemos/tab-sync-server/internal/service"

// Handlers 聚合所有 HTTP 处理器
type Handlers struct {
	Auth       *AuthHandler
	Device     *DeviceHandler
	Workspace  *WorkspaceHandler
	Sync       *SyncHandler
	System     *SystemHandler
	Setup      *SetupHandler
	SSE        *SSEHandler
	Tag        *TagHandler
	RecycleBin *RecycleBinHandler
}

// NewHandlers 创建所有处理器实例
func NewHandlers(svc *service.Services) *Handlers {
	return &Handlers{
		Auth:       NewAuthHandler(svc.Auth),
		Device:     NewDeviceHandler(svc.Device),
		Workspace:  NewWorkspaceHandler(svc.Workspace),
		Sync:       NewSyncHandler(svc.Sync),
		System:     NewSystemHandler(svc.System),
		Setup:      NewSetupHandler(svc.System, svc.Auth),
		SSE:        NewSSEHandler(svc.SSE),
		Tag:        NewTagHandler(svc.Tag),
		RecycleBin: NewRecycleBinHandler(svc.RecycleBin),
	}
}
