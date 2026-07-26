package service

import (
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync-server/internal/database"
	"github.com/spidermemos/tab-sync-server/internal/model"
)

// WorkspaceService 工作组管理服务
type WorkspaceService struct {
	db      *database.DB
	syncSvc *SyncService
}

// NewWorkspaceService 创建工作区服务
func NewWorkspaceService(db *database.DB, syncSvc *SyncService) *WorkspaceService {
	return &WorkspaceService{db: db, syncSvc: syncSvc}
}

// WorkspaceTabData 创建/更新时的标签页数据
type WorkspaceTabData struct {
	// TabID 为后端主键 ID（字符串）。
	// 更新已有标签页时由前端回传以便增量匹配；新建时留空，由数据库自增生成。
	TabID       string `json:"tabId"`
	URL         string `json:"url"`
	Title       string `json:"title"`
	FavIconURL  string `json:"favIconUrl"`
	ChromeTabID int    `json:"chromeTabId"`
}

// CreateWorkspacePayload 创建工作区请求体
type CreateWorkspacePayload struct {
	Name  string             `json:"name"`
	Color string             `json:"color"`
	Icon  string             `json:"icon"`
	Tabs  []WorkspaceTabData `json:"tabs"`
}

// UpdateWorkspacePayload 更新工作区请求体
type UpdateWorkspacePayload struct {
	Name *string             `json:"name,omitempty"`
	Color *string            `json:"color,omitempty"`
	Icon  *string            `json:"icon,omitempty"`
	Tabs  []WorkspaceTabData `json:"tabs,omitempty"`
}

// WorkspaceResponse 工作组响应（给前端）
type WorkspaceResponse struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	Color     string             `json:"color"`
	Icon      string             `json:"icon"`
	Tabs      []TabReference     `json:"tabs"`
	CreatedAt string             `json:"createdAt"`
	UpdatedAt string             `json:"updatedAt"`
}

// TabReference 标签页引用
type TabReference struct {
	TabID      string `json:"tabId"`
	URL        string `json:"url"`
	Title      string `json:"title"`
	FavIconURL string `json:"favIconUrl"`
	SortOrder  int    `json:"sortOrder"`
	AddedAt    string `json:"addedAt"`
}

// CreateResult 创建工作区结果
type CreateResult struct {
	Workspace WorkspaceResponse `json:"workspace"`
}

// List 获取所有工作组
func (s *WorkspaceService) List() ([]WorkspaceResponse, error) {
	var workspaces []model.Workspace
	err := s.db.Where("is_deleted = ?", false).
		Preload("Tabs", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Order("sort_order ASC, created_at DESC").
		Find(&workspaces).Error
	if err != nil {
		return nil, err
	}

	responses := make([]WorkspaceResponse, len(workspaces))
	for i, ws := range workspaces {
		responses[i] = toWorkspaceResponse(ws)
	}
	return responses, nil
}

// Create 创建工作区
// 标签页直接使用数据库自增主键 ID 作为公开标识（字符串），不再生成额外 UUID
func (s *WorkspaceService) Create(payload CreateWorkspacePayload) (*CreateResult, error) {
	wsID := uuid.New().String()

	workspace := model.Workspace{
		WorkspaceID: wsID,
		Name:        payload.Name,
		Color:       payload.Color,
		Icon:        payload.Icon,
	}

	for i, tabData := range payload.Tabs {
		workspace.Tabs = append(workspace.Tabs, model.WorkspaceTab{
			WorkspaceID: wsID,
			URL:         sanitizeString(tabData.URL, 2048),
			Title:       sanitizeString(tabData.Title, 500),
			FavIconURL:  sanitizeFavIconURL(tabData.FavIconURL),
			SortOrder:   i,
			AddedAt:     time.Now(),
		})
	}

	if err := s.db.Create(&workspace).Error; err != nil {
		return nil, err
	}

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("created", "workspace", wsID, workspace)
	}

	return &CreateResult{
		Workspace: toWorkspaceResponse(workspace),
	}, nil
}

// Update 更新工作区（基于主键 ID 的增量更新）
// 带 tabId 的标签页执行 UPDATE；不带 tabId 的作为新增 INSERT；
// DB 中存在但新列表里缺失的标签页执行 DELETE。这样每个标签页的主键 ID 保持稳定。
func (s *WorkspaceService) Update(id string, payload UpdateWorkspacePayload) (*WorkspaceResponse, error) {
	var workspace model.Workspace
	if err := s.db.Where("workspace_id = ? AND is_deleted = ?", id, false).
		Preload("Tabs").First(&workspace).Error; err != nil {
		return nil, err
	}

	// 更新基本信息
	updates := map[string]interface{}{}
	if payload.Name != nil {
		updates["name"] = *payload.Name
	}
	if payload.Color != nil {
		updates["color"] = *payload.Color
	}
	if payload.Icon != nil {
		updates["icon"] = *payload.Icon
	}
	if len(updates) > 0 {
		s.db.Model(&workspace).Updates(updates)
	}

	// 增量更新标签页列表
	if payload.Tabs != nil {
		existingByID := make(map[uint]model.WorkspaceTab)
		for _, t := range workspace.Tabs {
			existingByID[t.ID] = t
		}
		seen := make(map[uint]bool)

		err := s.db.Transaction(func(tx *gorm.DB) error {
			for i, tabData := range payload.Tabs {
				var tab model.WorkspaceTab
				if tabData.TabID != "" {
					if uid, perr := strconv.ParseUint(tabData.TabID, 10, 64); perr == nil {
						if existing, ok := existingByID[uint(uid)]; ok {
							tab = existing
							seen[uint(uid)] = true
						}
					}
				}
				if tab.ID == 0 {
					// 新增标签页
					tab = model.WorkspaceTab{WorkspaceID: id, AddedAt: time.Now()}
				}
				tab.URL = sanitizeString(tabData.URL, 2048)
				tab.Title = sanitizeString(tabData.Title, 500)
				tab.FavIconURL = sanitizeFavIconURL(tabData.FavIconURL)
				tab.SortOrder = i

				if tab.ID == 0 {
					if cerr := tx.Create(&tab).Error; cerr != nil {
						return cerr
					}
				} else {
					if serr := tx.Save(&tab).Error; serr != nil {
						return serr
					}
				}
			}
			// 删除未出现在新列表中的标签页
			for uid := range existingByID {
				if !seen[uid] {
					if derr := tx.Where("id = ?", uid).Delete(&model.WorkspaceTab{}).Error; derr != nil {
						return derr
					}
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}

		// 重新加载
		s.db.Where("workspace_id = ?", id).
			Preload("Tabs", func(db *gorm.DB) *gorm.DB {
				return db.Order("sort_order ASC")
			}).First(&workspace)
	}

	resp := toWorkspaceResponse(workspace)

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("updated", "workspace", id, payload)
	}

	return &resp, nil
}

// Delete 删除工作区（软删除）
func (s *WorkspaceService) Delete(id string) error {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 软删除工作组
		if err := tx.Model(&model.Workspace{}).
			Where("workspace_id = ?", id).
			Update("is_deleted", true).Error; err != nil {
			return err
		}
		// 物理删除关联标签页
		return tx.Where("workspace_id = ?", id).Delete(&model.WorkspaceTab{}).Error
	})
	if err != nil {
		return err
	}

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("removed", "workspace", id, map[string]string{"workspaceId": id})
	}

	return nil
}

// TabsSummary 获取所有工作组标签页摘要
func (s *WorkspaceService) TabsSummary() ([]WorkspaceTabSummary, error) {
	var workspaces []model.Workspace
	err := s.db.Where("is_deleted = ?", false).
		Preload("Tabs", func(db *gorm.DB) *gorm.DB {
			return db.Select("workspace_id", "id", "url")
		}).
		Find(&workspaces).Error
	if err != nil {
		return nil, err
	}

	summaries := make([]WorkspaceTabSummary, 0, len(workspaces))
	for _, ws := range workspaces {
		tabs := make([]TabURLPair, 0, len(ws.Tabs))
		for _, tab := range ws.Tabs {
			tabs = append(tabs, TabURLPair{
				TabID: strconv.FormatUint(uint64(tab.ID), 10),
				URL:   tab.URL,
			})
		}
		summaries = append(summaries, WorkspaceTabSummary{
			WorkspaceID:    ws.WorkspaceID,
			WorkspaceName:  ws.Name,
			WorkspaceColor: ws.Color,
			Tabs:           tabs,
		})
	}
	return summaries, nil
}

// MoveTab 移动标签页到目标工作组指定位置
// tabID 为后端自增主键（字符串）
func (s *WorkspaceService) MoveTab(workspaceID, tabID string, newIndex int) error {
	if workspaceID == "" || tabID == "" {
		return errors.New("workspaceID 和 tabID 不能为空")
	}
	uid, err := strconv.ParseUint(tabID, 10, 64)
	if err != nil {
		return errors.New("tabID 格式无效")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 先找到要移动的标签页
		var tab model.WorkspaceTab
		if err := tx.Where("id = ?", uid).First(&tab).Error; err != nil {
			return err
		}

		// 更新工作组归属和排序
		tab.WorkspaceID = workspaceID
		if err := tx.Save(&tab).Error; err != nil {
			return err
		}

		// 重整目标工作组的 sortOrder
		var tabs []model.WorkspaceTab
		tx.Where("workspace_id = ?", workspaceID).
			Order("sort_order ASC, added_at ASC").
			Find(&tabs)

		// 把目标 tab 插入到指定位置
		reordered := make([]model.WorkspaceTab, 0, len(tabs))
		inserted := false
		for _, t := range tabs {
			if uint64(t.ID) == uid {
				continue
			}
			if !inserted && len(reordered) >= newIndex {
				reordered = append(reordered, tab)
				inserted = true
			}
			t.SortOrder = len(reordered)
			reordered = append(reordered, t)
		}
		if !inserted {
			tab.SortOrder = len(reordered)
			reordered = append(reordered, tab)
		}

		// 批量更新排序
		for _, t := range reordered {
			tx.Model(&t).Update("sort_order", t.SortOrder)
		}

		return nil
	})
}

// ===================== 辅助函数 =====================

func toWorkspaceResponse(ws model.Workspace) WorkspaceResponse {
	tabs := make([]TabReference, len(ws.Tabs))
	for i, tab := range ws.Tabs {
		tabs[i] = TabReference{
			TabID:      strconv.FormatUint(uint64(tab.ID), 10),
			URL:        tab.URL,
			Title:      tab.Title,
			FavIconURL: tab.FavIconURL,
			SortOrder:  tab.SortOrder,
			AddedAt:    tab.AddedAt.Format(time.RFC3339),
		}
	}
	return WorkspaceResponse{
		ID:        ws.WorkspaceID,
		Name:      ws.Name,
		Color:     ws.Color,
		Icon:      ws.Icon,
		Tabs:      tabs,
		CreatedAt: ws.CreatedAt.Format(time.RFC3339),
		UpdatedAt: ws.UpdatedAt.Format(time.RFC3339),
	}
}

func sanitizeString(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen]
	}
	return s
}

func sanitizeFavIconURL(url string) string {
	if len(url) > 1024 {
		return ""
	}
	return url
}

// ===================== 响应类型 =====================

// WorkspaceTabSummary 工作组标签页摘要
type WorkspaceTabSummary struct {
	WorkspaceID    string        `json:"workspaceId"`
	WorkspaceName  string        `json:"workspaceName"`
	WorkspaceColor string        `json:"workspaceColor"`
	Tabs           []TabURLPair  `json:"tabs"`
}

// TabURLPair 标签页 URL 对
type TabURLPair struct {
	TabID string `json:"tabId"`
	URL   string `json:"url"`
}
