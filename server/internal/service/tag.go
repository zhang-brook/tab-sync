package service

import (
	"errors"

	"github.com/spidermemos/tab-sync/server/internal/database"
	"github.com/spidermemos/tab-sync/server/internal/model"
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
	// 统计每个标签关联的标签页数量（仅 tab 类标签有实际关联）
	// 以 tabs 为准联查存活标签页，避免历史残留的孤儿关联行把计数算大
	type tabCountRow struct {
		TagID uint
		Count int64
	}
	rows := make([]tabCountRow, 0)
	if err := s.db.Table("tab_tags_rel").
		Select("tab_tags_rel.tag_id AS tag_id, COUNT(*) AS count").
		Joins("JOIN tabs ON tabs.id = tab_tags_rel.tab_id").
		Joins("JOIN workspaces ON workspaces.workspace_id = tabs.workspace_id").
		Where("workspaces.is_deleted = ?", false).
		Group("tab_tags_rel.tag_id").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	counts := make(map[uint]int64, len(rows))
	for _, r := range rows {
		counts[r.TagID] = r.Count
	}
	out := make([]TagResponse, 0, len(tags))
	for _, t := range tags {
		out = append(out, TagResponse{ID: t.ID, Name: t.Name, Color: t.Color, Scope: t.Scope, Description: t.Description, TabCount: counts[t.ID]})
	}
	return out, nil
}

// Create 创建标签；同 scope 下若已存在同名（不区分大小写）标签，则直接复用已有记录，
// 避免落库时产生重复标签。
func (s *TagService) Create(name, color, scope, description string) (*TagResponse, error) {
	var existing model.Tag
	if err := s.db.Where("scope = ? AND LOWER(name) = LOWER(?)", scope, name).First(&existing).Error; err == nil {
		return &TagResponse{ID: existing.ID, Name: existing.Name, Color: existing.Color, Scope: existing.Scope, Description: existing.Description}, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	tag := model.Tag{Name: name, Color: color, Scope: scope, Description: description}
	if err := s.db.Create(&tag).Error; err != nil {
		return nil, err
	}
	return &TagResponse{ID: tag.ID, Name: tag.Name, Color: tag.Color, Scope: tag.Scope, Description: tag.Description}, nil
}

// Update 更新标签（名称/颜色/描述）
func (s *TagService) Update(id uint, name, color, description string) (*TagResponse, error) {
	tag := model.Tag{}
	if err := s.db.First(&tag, id).Error; err != nil {
		return nil, err
	}
	if name != "" {
		tag.Name = name
	}
	// 空字符串表示清除颜色
	tag.Color = color
	// 空字符串表示清除描述
	tag.Description = description
	if err := s.db.Save(&tag).Error; err != nil {
		return nil, err
	}
	return &TagResponse{ID: tag.ID, Name: tag.Name, Color: tag.Color, Scope: tag.Scope, Description: tag.Description}, nil
}

// Delete 删除标签（事务内清理关联记录）
func (s *TagService) Delete(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tag_id = ?", id).Delete(&model.TabTagRelation{}).Error; err != nil {
			return err
		}
		if err := tx.Where("tag_id = ?", id).Delete(&model.WorkspaceTagRelation{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.Tag{}, id).Error
	})
}

// AddToTab 给工作组内标签页打标签（校验归属）
func (s *TagService) AddToTab(workspaceID string, tabID, tagID uint) error {
	var count int64
	if err := s.db.Model(&model.Tab{}).
		Where("id = ? AND workspace_id = ?", tabID, workspaceID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("标签页不存在或不属于该工作组")
	}
	var exist int64
	s.db.Model(&model.TabTagRelation{}).
		Where("tab_id = ? AND tag_id = ?", tabID, tagID).
		Count(&exist)
	if exist > 0 {
		return nil
	}
	return s.db.Create(&model.TabTagRelation{TabID: tabID, WorkspaceID: workspaceID, TagID: tagID}).Error
}

// RemoveFromTab 去掉标签页上的标签
func (s *TagService) RemoveFromTab(workspaceID string, tabID, tagID uint) error {
	res := s.db.Where("tab_id = ? AND workspace_id = ? AND tag_id = ?", tabID, workspaceID, tagID).
		Delete(&model.TabTagRelation{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// AddToWorkspace 给工作组打标签（校验工作组存在）
func (s *TagService) AddToWorkspace(workspaceID string, tagID uint) error {
	var ws model.Workspace
	if err := s.db.Where("workspace_id = ? AND is_deleted = ?", workspaceID, false).First(&ws).Error; err != nil {
		return err
	}
	var exist int64
	s.db.Model(&model.WorkspaceTagRelation{}).
		Where("workspace_id = ? AND tag_id = ?", workspaceID, tagID).
		Count(&exist)
	if exist > 0 {
		return nil
	}
	return s.db.Create(&model.WorkspaceTagRelation{WorkspaceID: workspaceID, TagID: tagID}).Error
}

// RemoveFromWorkspace 去掉工作组上的标签
func (s *TagService) RemoveFromWorkspace(workspaceID string, tagID uint) error {
	res := s.db.Where("workspace_id = ? AND tag_id = ?", workspaceID, tagID).
		Delete(&model.WorkspaceTagRelation{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// TagTabItem 表示带有某个标签的云端标签页（关联 Tab）
// 用于「标签」页面右侧：展示该标签下包含的所有标签页。
// Tab 为完整标签页数据，与管理面板其它列表共用同一套展示与操作逻辑。
type TagTabItem struct {
	WorkspaceID    string       `json:"workspaceId"`
	WorkspaceName  string       `json:"workspaceName"`
	WorkspaceColor string       `json:"workspaceColor"`
	Tab            TabReference `json:"tab"`
}

// GetTabsByTag 返回带有指定标签的云端标签页列表（基于 TabTag 关联）
func (s *TagService) GetTabsByTag(tagID uint) ([]TagTabItem, error) {
	var tabs []model.Tab
	if err := s.db.Model(&model.Tab{}).
		Joins("JOIN tab_tags_rel ON tab_tags_rel.tab_id = tabs.id").
		Joins("JOIN workspaces ON workspaces.workspace_id = tabs.workspace_id").
		Where("tab_tags_rel.tag_id = ? AND workspaces.is_deleted = ?", tagID, false).
		Order("workspaces.name, tabs.sort_order").
		Preload("Tags.Tag").
		Find(&tabs).Error; err != nil {
		return nil, err
	}

	wsIDs := make([]string, 0, len(tabs))
	for _, tab := range tabs {
		wsIDs = append(wsIDs, tab.WorkspaceID)
	}
	wsMap := make(map[string]model.Workspace, len(wsIDs))
	if len(wsIDs) > 0 {
		var wsList []model.Workspace
		if err := s.db.Where("workspace_id IN ?", wsIDs).Find(&wsList).Error; err != nil {
			return nil, err
		}
		for _, ws := range wsList {
			wsMap[ws.WorkspaceID] = ws
		}
	}

	items := make([]TagTabItem, 0, len(tabs))
	for _, tab := range tabs {
		ws := wsMap[tab.WorkspaceID]
		items = append(items, TagTabItem{
			WorkspaceID:    tab.WorkspaceID,
			WorkspaceName:  ws.Name,
			WorkspaceColor: ws.Color,
			Tab:            toTabReferences([]model.Tab{tab})[0],
		})
	}
	return items, nil
}
