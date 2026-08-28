package service

import (
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync/server/internal/database"
	"github.com/spidermemos/tab-sync/server/internal/model"
)

// 工作组相关错误
var (
	// ErrWorkspaceNotFound 工作组不存在或已被删除
	ErrWorkspaceNotFound = errors.New("工作组不存在")
)

// WorkspaceService 工作组管理服务
type WorkspaceService struct {
	db         *database.DB
	syncSvc    *SyncService
	RecycleBin *RecycleBinService
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
// 创建时不携带标签页；标签页通过后续 Update 或加入操作添加
type CreateWorkspacePayload struct {
	Name        string `json:"name"`
	Color       string `json:"color"`
	Icon        string `json:"icon"`
	Description string `json:"description"`
	ParentID    string `json:"parentId"` // 父工作组 UUID（空表示根级）
}

// UpdateWorkspacePayload 更新工作区请求体
type UpdateWorkspacePayload struct {
	Name        *string            `json:"name,omitempty"`
	Color       *string            `json:"color,omitempty"`
	Icon        *string            `json:"icon,omitempty"`
	Description *string            `json:"description,omitempty"`
	ParentID    *string            `json:"parentId,omitempty"` // 移动到新父工作组（空字符串表示移到根级）
	Tabs        []WorkspaceTabData `json:"tabs,omitempty"`
}

// WorkspaceResponse 工作组响应（给前端）
type WorkspaceResponse struct {
	ID          string         `json:"id"`
	ParentID    string         `json:"parentId"`
	Name        string         `json:"name"`
	Color       string         `json:"color"`
	Icon        string         `json:"icon"`
	Description string         `json:"description"`
	IsSystem    bool           `json:"isSystem"`
	Tabs        []TabReference `json:"tabs"`
	Tags        []TagResponse  `json:"tags"`
	CreatedAt   string         `json:"createdAt"`
	UpdatedAt   string         `json:"updatedAt"`
}

// TabReference 标签页引用
type TabReference struct {
	TabID string `json:"tabId"`
	URL   string `json:"url"`
	Title string `json:"title"`
	// DisplayName 用户重命名后的显示名（可选，为空时前端应使用 Title）
	DisplayName string `json:"displayName,omitempty"`
	FavIconURL  string `json:"favIconUrl"`
	// Description 标签页描述（可选，仅用户主动设置时存在）
	Description string        `json:"description,omitempty"`
	SortOrder   int           `json:"sortOrder"`
	AddedAt     string        `json:"addedAt"`
	Tags        []TagResponse `json:"tags"`
}

// TagResponse 标签响应（给前端）
type TagResponse struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Scope       string `json:"scope"`
	Description string `json:"description"`
	TabCount    int64  `json:"tabCount"`
}

// CreateResult 创建工作区结果
type CreateResult struct {
	Workspace WorkspaceResponse `json:"workspace"`
}

// List 获取所有工作组
// includeSystem=true 时包含系统工作组（如「未分组」），否则仅返回用户可管理的普通工作组。
// includeTabs=false 时仅返回工作组元信息（不含标签页），用于管理页面左侧工作组树，避免全量拉取标签页。
func (s *WorkspaceService) List(includeSystem, includeTabs bool) ([]WorkspaceResponse, error) {
	query := s.db.Where("is_deleted = ?", false)
	if !includeSystem {
		query = query.Where("is_system = ?", false)
	}

	query = query.
		Preload("Tags.Tag").
		Order("sort_order ASC, created_at DESC")

	// 仅在需要时预加载标签页，降低左侧树场景的数据体积
	if includeTabs {
		query = query.Preload("Tabs", func(db *gorm.DB) *gorm.DB {
			return db.Preload("Tags.Tag").Order("sort_order ASC")
		})
	}

	var workspaces []model.Workspace
	if err := query.Find(&workspaces).Error; err != nil {
		return nil, err
	}

	responses := make([]WorkspaceResponse, len(workspaces))
	for i, ws := range workspaces {
		responses[i] = toWorkspaceResponse(ws, includeTabs)
	}
	return responses, nil
}

// GetTabs 获取单个工作组的标签页列表（管理页面右侧列表按需拉取，而非随工作组树全量返回）
func (s *WorkspaceService) GetTabs(id string) ([]TabReference, error) {
	var workspace model.Workspace
	if err := s.db.
		Where("workspace_id = ? AND is_deleted = ?", id, false).
		Preload("Tabs", func(db *gorm.DB) *gorm.DB {
			return db.Preload("Tags.Tag").Order("sort_order ASC")
		}).
		First(&workspace).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}
	return toTabReferences(workspace.Tabs), nil
}

// GetTabsTree 获取某个工作组自身及整棵子树的标签页，按工作区分组返回。
// 用于管理页面「包含子工作组」模式：一次接口调用即可拿到所有相关分组的数据，
// 避免前端逐个工作组批量请求。返回的分组按根到叶的后序遍历顺序排列。
func (s *WorkspaceService) GetTabsTree(id string) ([]WorkspaceTabsGroup, error) {
	// 先确认根工作组存在
	var root model.Workspace
	if err := s.db.
		Where("workspace_id = ? AND is_deleted = ?", id, false).
		First(&root).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkspaceNotFound
		}
		return nil, err
	}

	// 加载全部未删除工作组，构建 parentId -> 子级 映射
	var all []model.Workspace
	if err := s.db.Where("is_deleted = ?", false).Find(&all).Error; err != nil {
		return nil, err
	}
	childrenMap := make(map[string][]string)
	meta := make(map[string]model.Workspace, len(all))
	for _, w := range all {
		childrenMap[w.ParentID] = append(childrenMap[w.ParentID], w.WorkspaceID)
		meta[w.WorkspaceID] = w
	}

	// 后序遍历收集子树内全部工作组 ID（叶子在前，根最后）
	var subtree []string
	var visit func(wid string)
	visit = func(wid string) {
		for _, c := range childrenMap[wid] {
			visit(c)
		}
		subtree = append(subtree, wid)
	}
	visit(id)

	// 批量预加载子树内所有工作组的标签页（一次查询，避免 N+1）
	var tabs []model.WorkspaceTab
	if err := s.db.
		Preload("Tags.Tag").
		Where("workspace_id IN ?", subtree).
		Order("sort_order ASC, id ASC").
		Find(&tabs).Error; err != nil {
		return nil, err
	}
	tabsByWorkspace := make(map[string][]model.WorkspaceTab, len(subtree))
	for _, t := range tabs {
		tabsByWorkspace[t.WorkspaceID] = append(tabsByWorkspace[t.WorkspaceID], t)
	}

	// 按后序遍历顺序组装分组，保证根在其子树之前返回（顺序稳定、便于前端缓存合并）
	groups := make([]WorkspaceTabsGroup, 0, len(subtree))
	for _, wid := range subtree {
		ws := meta[wid]
		groups = append(groups, WorkspaceTabsGroup{
			WorkspaceID: ws.WorkspaceID,
			Name:        ws.Name,
			Color:       ws.Color,
			Tabs:        toTabReferences(tabsByWorkspace[wid]),
		})
	}
	return groups, nil
}

// Create 创建工作区（不含标签页，标签页由后续更新/加入操作添加）
func (s *WorkspaceService) Create(payload CreateWorkspacePayload) (*CreateResult, error) {
	wsID := uuid.New().String()

	workspace := model.Workspace{
		WorkspaceID: wsID,
		ParentID:    payload.ParentID,
		Name:        payload.Name,
		Color:       payload.Color,
		Icon:        payload.Icon,
		Description: payload.Description,
	}

	if err := s.db.Create(&workspace).Error; err != nil {
		return nil, err
	}

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("created", "workspace", wsID, workspace)
	}

	return &CreateResult{
		Workspace: toWorkspaceResponse(workspace, true),
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
	if payload.Description != nil {
		updates["description"] = *payload.Description
	}
	if payload.ParentID != nil {
		updates["parent_id"] = *payload.ParentID
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
					tab = model.WorkspaceTab{
						WorkspaceID: id,
						AddedAt:     time.Now(),
					}
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
			// 软删除：将未出现在新列表中的标签页移入回收站（而非直接物理删除）
			for uid := range existingByID {
				if !seen[uid] {
					removed := existingByID[uid]
					if s.RecycleBin != nil {
						if aerr := s.RecycleBin.Add(tx, workspace.WorkspaceID, workspace.Name, removed); aerr != nil {
							return aerr
						}
					}
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
		s.db.Where("workspace_id = ? AND is_deleted = ?", id, false).
			Preload("Tabs", func(db *gorm.DB) *gorm.DB {
				return db.Preload("Tags.Tag").Order("sort_order ASC")
			}).
			Preload("Tags.Tag").
			First(&workspace)
	}

	resp := toWorkspaceResponse(workspace, true)

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("updated", "workspace", id, payload)
	}

	return &resp, nil
}

// Delete 递归删除工作区及其整棵子树（含所有子/孙工作组与它们的标签页）
// defaultWorkspaceID 为前端当前默认分组 ID（可选）：若待删分组正是默认分组则拒绝删除，
// 防止同步「加入并关闭」等快捷操作因默认分组被删而失效。
func (s *WorkspaceService) Delete(id string, defaultWorkspaceID string) error {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 加载全部未删除工作组，构建 parentId -> 子级 映射
		var all []model.Workspace
		if err := tx.Where("is_deleted = ?", false).Find(&all).Error; err != nil {
			return err
		}
		childrenMap := make(map[string][]string)
		for _, w := range all {
			if w.WorkspaceID == id && w.IsSystem {
				return errors.New("系统工作组不可删除")
			}
			if defaultWorkspaceID != "" && w.WorkspaceID == id && w.WorkspaceID == defaultWorkspaceID {
				return errors.New("默认分组不可删除，请先更改默认分组")
			}
			childrenMap[w.ParentID] = append(childrenMap[w.ParentID], w.WorkspaceID)
		}

		// 后序遍历：先递归收集子节点，最后才收集自身，
		// 保证从最底层的叶子往上层逐个删除，避免删掉父级后丢失查找子级的依据
		var subtree []string
		var visit func(wid string)
		visit = func(wid string) {
			for _, c := range childrenMap[wid] {
				visit(c)
			}
			subtree = append(subtree, wid)
		}
		visit(id)

		// 物理删除子树内每个工作组的标签页（从叶子到父级）
		for _, wid := range subtree {
			if err := tx.Where("workspace_id = ?", wid).Delete(&model.WorkspaceTab{}).Error; err != nil {
				return err
			}
		}
		// 软删除整棵子树的工作组
		return tx.Model(&model.Workspace{}).
			Where("workspace_id IN ?", subtree).
			Update("is_deleted", true).Error
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

// DeleteTab 删除工作组中的单个标签页。
// 被移除的标签页统一进入回收站（与 Put/Update 删除分支行为一致），而非直接物理删除，
// 以便恢复。使用独立的 DELETE 接口替代「读全量 → 过滤 → 整体覆盖」的 RMW 方式，
// 避免并发删除不同标签页时的 lost-update 问题。
func (s *WorkspaceService) DeleteTab(workspaceID string, tabID string) error {
	uid, err := strconv.ParseUint(tabID, 10, 64)
	if err != nil {
		return errors.New("标签页 ID 无效")
	}

	var ws model.Workspace
	if err := s.db.Where("workspace_id = ? AND is_deleted = ?", workspaceID, false).First(&ws).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("工作组不存在")
		}
		return err
	}

	var tab model.WorkspaceTab
	if err := s.db.Where("id = ? AND workspace_id = ?", uint(uid), workspaceID).First(&tab).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("标签页不存在")
		}
		return err
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if s.RecycleBin != nil {
			if aerr := s.RecycleBin.Add(tx, workspaceID, ws.Name, tab); aerr != nil {
				return aerr
			}
		}
		return tx.Where("id = ?", uint(uid)).Delete(&model.WorkspaceTab{}).Error
	})
	if err != nil {
		return err
	}

	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("removed", "tab", tabID, map[string]string{"workspaceId": workspaceID, "tabId": tabID})
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

// AddTabByURLPayload 通过 URL 添加标签页的请求体
type AddTabByURLPayload struct {
	URL   string `json:"url" binding:"required"`
	Title string `json:"title"` // 可选，为空时使用 URL 作为标题
}

// AddTabByURL 通过 URL 向工作组添加标签页
func (s *WorkspaceService) AddTabByURL(workspaceID string, payload AddTabByURLPayload) (*TabReference, error) {
	if workspaceID == "" {
		return nil, errors.New("workspaceID 不能为空")
	}
	if payload.URL == "" {
		return nil, errors.New("URL 不能为空")
	}

	// 验证工作组存在
	var workspace model.Workspace
	if err := s.db.Where("workspace_id = ? AND is_deleted = ?", workspaceID, false).First(&workspace).Error; err != nil {
		return nil, err
	}

	title := payload.Title
	if title == "" {
		title = payload.URL
	}

	tab := model.WorkspaceTab{
		WorkspaceID: workspaceID,
		URL:         sanitizeString(payload.URL, 2048),
		Title:       sanitizeString(title, 500),
		FavIconURL:  "",
		SortOrder:   0,
		AddedAt:     time.Now(),
	}

	// 计算新标签页的 sortOrder（放在末尾）
	var maxOrder int
	s.db.Model(&model.WorkspaceTab{}).
		Where("workspace_id = ?", workspaceID).
		Select("COALESCE(MAX(sort_order), -1)").
		Scan(&maxOrder)
	tab.SortOrder = maxOrder + 1

	if err := s.db.Create(&tab).Error; err != nil {
		return nil, err
	}

	// 记录同步事件
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("added", "tab", workspaceID, tab)
	}

	return &TabReference{
		TabID:      strconv.FormatUint(uint64(tab.ID), 10),
		URL:        tab.URL,
		Title:      tab.Title,
		FavIconURL: tab.FavIconURL,
		SortOrder:  tab.SortOrder,
		AddedAt:    tab.AddedAt.Format(time.RFC3339),
	}, nil
}

// UpdateTabPayload 更新工作组内单个标签页属性的请求体（字段均可选，仅更新提供的字段）
type UpdateTabPayload struct {
	// AddedAt 手动设置的添加时间（RFC3339 格式）
	AddedAt *string `json:"addedAt,omitempty"`
	// DisplayName 用户重命名后的显示名（空字符串表示清除重命名，恢复使用 Title）
	DisplayName *string `json:"displayName,omitempty"`
	// URL 标签页链接，编辑后同步更新显示名/图标（仅当未自定义 DisplayName 时回退标题）
	URL *string `json:"url,omitempty"`
	// Title 标签页标题，编辑 URL 时可选一并更新
	Title *string `json:"title,omitempty"`
	// FavIconURL 标签页图标，编辑 URL 时可选一并更新
	FavIconURL *string `json:"favIconUrl,omitempty"`
	// Description 标签页描述（仅当用户主动设置时保存，空字符串表示清除描述）
	Description *string `json:"description,omitempty"`
}

// UpdateTab 更新工作组内单个标签页的属性（当前支持手动设置添加时间、重命名、编辑链接、描述）
// tabID 为后端自增主键（字符串）
func (s *WorkspaceService) UpdateTab(workspaceID, tabID string, payload UpdateTabPayload) error {
	if workspaceID == "" || tabID == "" {
		return errors.New("workspaceID 和 tabID 不能为空")
	}
	uid, err := strconv.ParseUint(tabID, 10, 64)
	if err != nil {
		return errors.New("tabID 格式无效")
	}

	var tab model.WorkspaceTab
	if err := s.db.Where("id = ? AND workspace_id = ?", uid, workspaceID).First(&tab).Error; err != nil {
		return err
	}

	updates := map[string]interface{}{}
	if payload.AddedAt != nil {
		t, perr := time.Parse(time.RFC3339, *payload.AddedAt)
		if perr != nil {
			return errors.New("addedAt 格式无效，应为 RFC3339")
		}
		// 转换为本地时区后再入库，保持与其他自动生成时间一致的 +08:00 样式
		updates["added_at"] = t.Local()
	}
	if payload.DisplayName != nil {
		updates["display_name"] = sanitizeString(*payload.DisplayName, 500)
	}
	if payload.URL != nil {
		updates["url"] = sanitizeString(*payload.URL, 2048)
	}
	if payload.Title != nil {
		updates["title"] = sanitizeString(*payload.Title, 500)
	}
	if payload.FavIconURL != nil {
		updates["fav_icon_url"] = sanitizeFavIconURL(*payload.FavIconURL)
	}
	if payload.Description != nil {
		updates["description"] = sanitizeString(*payload.Description, 500)
	}
	if len(updates) == 0 {
		return nil
	}

	if err := s.db.Model(&tab).Updates(updates).Error; err != nil {
		return err
	}

	// 记录同步事件（预留：未来用于推送到织个网上游）
	if s.syncSvc != nil {
		s.syncSvc.RecordEvent("updated", "workspace", workspaceID, map[string]interface{}{
			"tabId":   tabID,
			"payload": payload,
		})
	}

	return nil
}

// ===================== 辅助函数 =====================

func toWorkspaceResponse(ws model.Workspace, includeTabs bool) WorkspaceResponse {
	tabs := make([]TabReference, 0)
	if includeTabs {
		tabs = toTabReferences(ws.Tabs)
	}
	return WorkspaceResponse{
		ID:          ws.WorkspaceID,
		ParentID:    ws.ParentID,
		Name:        ws.Name,
		Color:       ws.Color,
		Icon:        ws.Icon,
		Description: ws.Description,
		IsSystem:    ws.IsSystem,
		Tabs:        tabs,
		Tags:        workspaceTagsToResponses(ws.Tags),
		CreatedAt:   ws.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   ws.UpdatedAt.Format(time.RFC3339),
	}
}

func toTabReferences(tabs []model.WorkspaceTab) []TabReference {
	refs := make([]TabReference, len(tabs))
	for i, tab := range tabs {
		refs[i] = TabReference{
			TabID:       strconv.FormatUint(uint64(tab.ID), 10),
			URL:         tab.URL,
			Title:       tab.Title,
			DisplayName: tab.DisplayName,
			FavIconURL:  tab.FavIconURL,
			Description: tab.Description,
			SortOrder:   tab.SortOrder,
			AddedAt:     tab.AddedAt.Format(time.RFC3339),
			Tags:        tabTagsToResponses(tab.Tags),
		}
	}
	return refs
}

func tagToResponse(t model.Tag) TagResponse {
	return TagResponse{ID: t.ID, Name: t.Name, Color: t.Color, Scope: t.Scope}
}

func tabTagsToResponses(rels []model.TabTag) []TagResponse {
	out := make([]TagResponse, 0, len(rels))
	for _, rel := range rels {
		out = append(out, tagToResponse(rel.Tag))
	}
	return out
}

func workspaceTagsToResponses(rels []model.WorkspaceTag) []TagResponse {
	out := make([]TagResponse, 0, len(rels))
	for _, rel := range rels {
		out = append(out, tagToResponse(rel.Tag))
	}
	return out
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

// WorkspaceTabsGroup 某个工作组及其标签页的分组（用于「包含子工作组」批量接口）
type WorkspaceTabsGroup struct {
	WorkspaceID string         `json:"workspaceId"`
	Name        string         `json:"name"`
	Color       string         `json:"color"`
	Tabs        []TabReference `json:"tabs"`
}

// WorkspaceTabSummary 工作组标签页摘要
type WorkspaceTabSummary struct {
	WorkspaceID    string       `json:"workspaceId"`
	WorkspaceName  string       `json:"workspaceName"`
	WorkspaceColor string       `json:"workspaceColor"`
	Tabs           []TabURLPair `json:"tabs"`
}

// TabURLPair 标签页 URL 对
type TabURLPair struct {
	TabID string `json:"tabId"`
	URL   string `json:"url"`
}

// ===================== 回收站 / 未分组 =====================

// UngroupedWorkspaceID 是「未分组」系统工作组的固定标识。
// 回收站中的标签页恢复后统一归入该工作组，避免回到原工作组造成分组混乱。
const UngroupedWorkspaceID = "ungrouped"

// UngroupedWorkspaceName 是「未分组」系统工作组的显示名
const UngroupedWorkspaceName = "未分组"

// GetOrCreateUngroupedWorkspace 获取或创建「未分组」系统工作组。
// 该工作组为系统内置（is_system=true），不参与普通工作组管理/删除。
func (s *WorkspaceService) GetOrCreateUngroupedWorkspace() (*model.Workspace, error) {
	var ws model.Workspace
	err := s.db.Where("workspace_id = ?", UngroupedWorkspaceID).First(&ws).Error
	if err == nil {
		return &ws, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	ws = model.Workspace{
		WorkspaceID: UngroupedWorkspaceID,
		ParentID:    "",
		Name:        UngroupedWorkspaceName,
		Color:       "#909399",
		Icon:        "folder-open",
		IsSystem:    true,
	}
	if err := s.db.Create(&ws).Error; err != nil {
		return nil, err
	}
	return &ws, nil
}
