package service

import (
	"errors"

	"github.com/spidermemos/tab-sync-server/internal/database"
	"github.com/spidermemos/tab-sync-server/internal/model"
	"gorm.io/gorm"
)

// TagService 标签服务（全局标签，按 scope 区分标签页/工作组用途）
type TagService struct {
	db *database.DB
}

// NewTagService 创建标签服务
func NewTagService(db *database.DB) *TagService {
	return &TagService{db: db}
}

// List 列出标签，可按 scope（tab | workspace）过滤
func (s *TagService) List(scope string) ([]TagResponse, error) {
	tags := make([]model.Tag, 0)
	q := s.db.Order("name ASC")
	if scope != "" {
		q = q.Where("scope = ?", scope)
	}
	if err := q.Find(&tags).Error; err != nil {
		return nil, err
	}
	out := make([]TagResponse, 0, len(tags))
	for _, t := range tags {
		out = append(out, TagResponse{ID: t.ID, Name: t.Name, Color: t.Color, Scope: t.Scope})
	}
	return out, nil
}

// Create 创建标签
func (s *TagService) Create(name, color, scope string) (*TagResponse, error) {
	tag := model.Tag{Name: name, Color: color, Scope: scope}
	if err := s.db.Create(&tag).Error; err != nil {
		return nil, err
	}
	return &TagResponse{ID: tag.ID, Name: tag.Name, Color: tag.Color, Scope: tag.Scope}, nil
}

// Delete 删除标签（事务内清理关联记录）
func (s *TagService) Delete(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tag_id = ?", id).Delete(&model.TabTag{}).Error; err != nil {
			return err
		}
		if err := tx.Where("tag_id = ?", id).Delete(&model.WorkspaceTag{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.Tag{}, id).Error
	})
}

// AddToTab 给工作组内标签页打标签（校验归属）
func (s *TagService) AddToTab(workspaceID string, tabID, tagID uint) error {
	var count int64
	if err := s.db.Model(&model.WorkspaceTab{}).
		Where("id = ? AND workspace_id = ?", tabID, workspaceID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("标签页不存在或不属于该工作组")
	}
	var exist int64
	s.db.Model(&model.TabTag{}).
		Where("workspace_tab_id = ? AND tag_id = ?", tabID, tagID).
		Count(&exist)
	if exist > 0 {
		return nil
	}
	return s.db.Create(&model.TabTag{WorkspaceTabID: tabID, WorkspaceID: workspaceID, TagID: tagID}).Error
}

// RemoveFromTab 去掉标签页上的标签
func (s *TagService) RemoveFromTab(workspaceID string, tabID, tagID uint) error {
	return s.db.Where("workspace_tab_id = ? AND workspace_id = ? AND tag_id = ?", tabID, workspaceID, tagID).
		Delete(&model.TabTag{}).Error
}

// AddToWorkspace 给工作组打标签（校验工作组存在）
func (s *TagService) AddToWorkspace(workspaceID string, tagID uint) error {
	var ws model.Workspace
	if err := s.db.Where("workspace_id = ? AND is_deleted = ?", workspaceID, false).First(&ws).Error; err != nil {
		return err
	}
	var exist int64
	s.db.Model(&model.WorkspaceTag{}).
		Where("workspace_id = ? AND tag_id = ?", workspaceID, tagID).
		Count(&exist)
	if exist > 0 {
		return nil
	}
	return s.db.Create(&model.WorkspaceTag{WorkspaceID: workspaceID, TagID: tagID}).Error
}

// RemoveFromWorkspace 去掉工作组上的标签
func (s *TagService) RemoveFromWorkspace(workspaceID string, tagID uint) error {
	return s.db.Where("workspace_id = ? AND tag_id = ?", workspaceID, tagID).
		Delete(&model.WorkspaceTag{}).Error
}
