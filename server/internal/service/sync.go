package service

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/database"
	"github.com/spidermemos/tab-sync/server/internal/model"
	"gorm.io/gorm"
)

// SyncService 同步服务
// 负责：记录本地变更事件 (SyncEvent)、批量推送到织个网上游（预留）。
type SyncService struct {
	db  *database.DB
	cfg *config.Config
}

// NewSyncService 创建同步服务
func NewSyncService(db *database.DB, cfg *config.Config) *SyncService {
	return &SyncService{db: db, cfg: cfg}
}

// RecordEvent 记录本地变更事件
// eventType: "created" / "updated" / "removed"
// entityType: "workspace" / "tab" / "device"
// entityID: 实体 UUID
// payload: 变更数据（将被序列化为 JSON）
func (s *SyncService) RecordEvent(eventType, entityType, entityID string, payload interface{}) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("序列化 SyncEvent payload 失败: %w", err)
	}

	// 在事务内生成当前最大版本号 +1 并插入，避免并发写入产生重复版本号
	return s.db.Transaction(func(tx *gorm.DB) error {
		var maxVersion int64
		if err := tx.Model(&model.SyncEvent{}).
			Select("COALESCE(MAX(version), 0)").
			Scan(&maxVersion).Error; err != nil {
			return err
		}

		event := model.SyncEvent{
			EventID:    uuid.New().String(),
			EventType:  eventType,
			EntityType: entityType,
			EntityID:   entityID,
			Payload:    string(payloadBytes),
			Version:    maxVersion + 1,
			CreatedAt:  time.Now(),
		}

		return tx.Create(&event).Error
	})
}

// GetUnsyncedEvents 获取未同步到上游的事件列表
// limit: 最大返回条数（0 或负数表示不限制）
func (s *SyncService) GetUnsyncedEvents(limit int) ([]model.SyncEvent, error) {
	var events []model.SyncEvent
	query := s.db.Where("synced_at IS NULL").Order("version ASC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	err := query.Find(&events).Error
	return events, err
}

// MarkSynced 标记事件为已同步到上游
// eventIDs: 事件 UUID 列表
func (s *SyncService) MarkSynced(eventIDs []string) error {
	if len(eventIDs) == 0 {
		return nil
	}

	now := time.Now()
	return s.db.Model(&model.SyncEvent{}).
		Where("event_id IN ?", eventIDs).
		Update("synced_at", now).Error
}

// PushToUpstream 同步数据到织个网上游（预留）
// 当 UPSTREAM_SYNC_ENABLED=true 时，将未同步事件批量推送到织个网云端。
// 当前为预留实现，仅返回 nil。
func (s *SyncService) PushToUpstream(events []model.SyncEvent) error {
	// TODO: 实现上游同步逻辑
	// 1. 检查 cfg.UpstreamSyncEnabled
	// 2. 构造推送请求
	// 3. POST {UPSTREAM_URL}/v1/sync/push
	// 4. 处理响应并标记已同步
	_ = events
	return nil
}

// PullEvents 拉取未同步的事件（供浏览器扩展拉取增量变更）
// since: 起始版本号（0 表示从最早开始）
func (s *SyncService) PullEvents(since int64) ([]model.SyncEvent, error) {
	var events []model.SyncEvent
	err := s.db.Where("version > ? AND synced_at IS NULL", since).
		Order("version ASC").
		Find(&events).Error
	return events, err
}

// PushEvents 接收浏览器扩展推送的同步事件
// rawEvents: JSON 数组形式的原始事件数据
func (s *SyncService) PushEvents(rawEvents []byte) error {
	// TODO: 解析浏览器扩展推送的批量事件，写入 SyncEvent 表
	// 当前为预留实现
	_ = rawEvents
	return nil
}
