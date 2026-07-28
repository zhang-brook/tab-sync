package service

import (
	"errors"
	"time"

	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync-server/internal/database"
	"github.com/spidermemos/tab-sync-server/internal/model"
)

// RecycleBinService 标签页回收站服务：
// 被从工作组移除的标签页暂存于此，可恢复（统一恢复到「未分组」）或彻底删除。
type RecycleBinService struct {
	db        *database.DB
	workspace *WorkspaceService
}

// NewRecycleBinService 构造回收站服务，需要工作组服务以恢复标签页到「未分组」工作组
func NewRecycleBinService(db *database.DB, workspaceSvc *WorkspaceService) *RecycleBinService {
	return &RecycleBinService{db: db, workspace: workspaceSvc}
}

// RecycleBinTabResponse 回收站标签页响应
type RecycleBinTabResponse struct {
	ID                   uint      `json:"id"`
	OriginalWorkspaceID   string   `json:"originalWorkspaceId"`
	OriginalWorkspaceName string   `json:"originalWorkspaceName"`
	URL                  string    `json:"url"`
	Title                string    `json:"title"`
	DisplayName          string    `json:"displayName"`
	FavIconURL           string    `json:"favIconUrl"`
	DeletedAt            time.Time `json:"deletedAt"`
}

// List 列出回收站中的全部标签页（按删除时间倒序）
func (s *RecycleBinService) List() ([]RecycleBinTabResponse, error) {
	var items []model.RecycleBinTab
	if err := s.db.Order("deleted_at DESC, id DESC").Find(&items).Error; err != nil {
		return nil, err
	}

	resp := make([]RecycleBinTabResponse, len(items))
	for i, it := range items {
		resp[i] = toRecycleBinResponse(it)
	}
	return resp, nil
}

// Add 将一条被移除的标签页加入回收站。
// 必须在调用方的事务 tx 中执行，避免与单连接 SQLite（MaxOpenConns=1）下
// 的事务产生连接争用导致死锁。
func (s *RecycleBinService) Add(tx *gorm.DB, originalWorkspaceID, originalWorkspaceName string, tab model.WorkspaceTab) error {
	item := model.RecycleBinTab{
		OriginalWorkspaceID:   originalWorkspaceID,
		OriginalWorkspaceName: originalWorkspaceName,
		URL:                   tab.URL,
		Title:                 tab.Title,
		DisplayName:           tab.DisplayName,
		FavIconURL:            tab.FavIconURL,
		SortOrder:             tab.SortOrder,
		DeletedAt:             time.Now(),
	}
	return tx.Create(&item).Error
}

// Restore 恢复指定标签页：统一恢复到「未分组」系统工作组
func (s *RecycleBinService) Restore(id uint) error {
	var item model.RecycleBinTab
	if err := s.db.Where("id = ?", id).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("回收站标签页不存在")
		}
		return err
	}

	ws, err := s.workspace.GetOrCreateUngroupedWorkspace()
	if err != nil {
		return err
	}

	newTab := model.WorkspaceTab{
		WorkspaceID: ws.WorkspaceID,
		URL:         item.URL,
		Title:       item.Title,
		DisplayName: item.DisplayName,
		FavIconURL:  item.FavIconURL,
		SortOrder:   0,
		AddedAt:     time.Now(),
	}
	if err := s.db.Create(&newTab).Error; err != nil {
		return err
	}

	// 移除回收站记录
	return s.db.Where("id = ?", id).Delete(&model.RecycleBinTab{}).Error
}

// Delete 彻底删除一条回收站标签页
func (s *RecycleBinService) Delete(id uint) error {
	return s.db.Where("id = ?", id).Delete(&model.RecycleBinTab{}).Error
}

// Empty 清空回收站
func (s *RecycleBinService) Empty() error {
	return s.db.Where("1 = 1").Delete(&model.RecycleBinTab{}).Error
}

func toRecycleBinResponse(it model.RecycleBinTab) RecycleBinTabResponse {
	return RecycleBinTabResponse{
		ID:                   it.ID,
		OriginalWorkspaceID:   it.OriginalWorkspaceID,
		OriginalWorkspaceName: it.OriginalWorkspaceName,
		URL:                  it.URL,
		Title:                it.Title,
		DisplayName:          it.DisplayName,
		FavIconURL:           it.FavIconURL,
		DeletedAt:            it.DeletedAt,
	}
}
