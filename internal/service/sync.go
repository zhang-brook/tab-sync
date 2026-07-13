package service

import (
	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/database"
)

// SyncService 同步服务（预留，未来实现增量同步到织个网）
type SyncService struct {
	db  *database.DB
	cfg *config.Config
}

// NewSyncService 创建同步服务
func NewSyncService(db *database.DB, cfg *config.Config) *SyncService {
	return &SyncService{db: db, cfg: cfg}
}

// PushEvents 接收浏览器扩展推送的同步事件（预留）
func (s *SyncService) PushEvents(events []byte) error {
	// TODO: 实现同步事件接收逻辑
	return nil
}

// PullEvents 拉取未同步的事件（预留）
func (s *SyncService) PullEvents(since int64) ([]byte, error) {
	// TODO: 实现增量拉取逻辑
	return nil, nil
}

// SyncToUpstream 同步数据到织个网上游（预留）
func (s *SyncService) SyncToUpstream() error {
	// TODO: 实现上游同步逻辑
	return nil
}
