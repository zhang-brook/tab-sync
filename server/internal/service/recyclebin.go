package service

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync/server/internal/database"
	"github.com/spidermemos/tab-sync/server/internal/model"
)

// RecycleBinService 标签页回收站服务：
// 被从工作组移除的标签页暂存于此，可恢复（恢复到用户指定的工作组）或彻底删除。
type RecycleBinService struct {
	db        *database.DB
	workspace *WorkspaceService
}

// NewRecycleBinService 构造回收站服务，需要工作组服务以解析恢复目标（未指定时回退「未分组」）
func NewRecycleBinService(db *database.DB, workspaceSvc *WorkspaceService) *RecycleBinService {
	return &RecycleBinService{db: db, workspace: workspaceSvc}
}

// RecycleBinTabResponse 回收站标签页响应
type RecycleBinTabResponse struct {
	ID                    uint      `json:"id"`
	OriginalWorkspaceID   string    `json:"originalWorkspaceId"`
	OriginalWorkspaceName string    `json:"originalWorkspaceName"`
	URL                   string    `json:"url"`
	Title                 string    `json:"title"`
	DisplayName           string    `json:"displayName"`
	FavIconURL            string    `json:"favIconUrl"`
	Description           string    `json:"description"`
	AddedAt               time.Time `json:"addedAt"`
	DeletedAt             time.Time `json:"deletedAt"`
}

// RecycleBinPage 回收站分页结果
type RecycleBinPage struct {
	Items    []RecycleBinTabResponse `json:"items"`
	Total    int64                   `json:"total"`
	Page     int                     `json:"page"`
	PageSize int                     `json:"pageSize"`
}

// List 分页列出回收站中的标签页。
// sort 支持 name（显示名/标题/URL）、deletedAt（移入回收站时间）、addedAt（原标签页添加时间），
// 传入其他值或空值时按删除时间倒序；order 为 asc 时升序，否则降序。
func (s *RecycleBinService) List(page, pageSize int, sort, order string) (*RecycleBinPage, error) {
	q := s.db.Model(&model.RecycleBinTab{})

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, err
	}

	items := make([]model.RecycleBinTab, 0, pageSize)
	if err := q.Offset((page - 1) * pageSize).Limit(pageSize).
		Order(recycleBinOrderBy(sort, order)).
		Find(&items).Error; err != nil {
		return nil, err
	}

	resp := make([]RecycleBinTabResponse, len(items))
	for i, it := range items {
		resp[i] = toRecycleBinResponse(it)
	}
	return &RecycleBinPage{Items: resp, Total: total, Page: page, PageSize: pageSize}, nil
}

// recycleBinOrderBy 生成排序子句；排序列只从固定白名单中选择，不拼接用户输入。
func recycleBinOrderBy(sort, order string) string {
	dir := "DESC"
	if strings.EqualFold(order, "asc") {
		dir = "ASC"
	}
	switch sort {
	case "name":
		// 与前端 displayName() 的回退顺序保持一致：显示名 → 标题 → URL
		return "COALESCE(NULLIF(display_name, ''), NULLIF(title, ''), url) " + dir + ", id " + dir
	case "addedAt":
		return "added_at " + dir + ", id " + dir
	default:
		return "deleted_at " + dir + ", id " + dir
	}
}

// Add 将一条被移除的标签页加入回收站。
// 必须在调用方的事务 tx 中执行，避免与单连接 SQLite（MaxOpenConns=1）下
// 的事务产生连接争用导致死锁。
func (s *RecycleBinService) Add(tx *gorm.DB, originalWorkspaceID, originalWorkspaceName string, tab model.Tab) error {
	item := model.RecycleBinTab{
		OriginalWorkspaceID:   originalWorkspaceID,
		OriginalWorkspaceName: originalWorkspaceName,
		URL:                   tab.URL,
		Title:                 tab.Title,
		DisplayName:           tab.DisplayName,
		FavIconURL:            tab.FavIconURL,
		SortOrder:             tab.SortOrder,
		AddedAt:               tab.AddedAt,
		Description:           tab.Description,
		DeletedAt:             time.Now(),
	}
	return tx.Create(&item).Error
}

// Restore 将回收站标签页批量恢复到指定工作组，返回实际恢复的条数。
// workspaceID 为空时回退到「未分组」系统工作组（兼容旧客户端）；
// 目标工作组不存在或已删除时返回错误。
func (s *RecycleBinService) Restore(ids []uint, workspaceID string) (int, error) {
	if len(ids) == 0 {
		return 0, errors.New("请选择要恢复的标签页")
	}

	ws, err := s.resolveTargetWorkspace(workspaceID)
	if err != nil {
		return 0, err
	}

	// 批量恢复在一笔事务内完成，避免部分成功
	restored := 0
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var items []model.RecycleBinTab
		if err := tx.Where("id IN ?", ids).Find(&items).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return errors.New("回收站标签页不存在")
		}
		byID := make(map[uint]model.RecycleBinTab, len(items))
		for _, it := range items {
			byID[it.ID] = it
		}

		// 追加到目标工作组末尾，与通过 URL 添加标签页时的排序行为保持一致
		var maxOrder int
		if err := tx.Model(&model.Tab{}).
			Where("workspace_id = ?", ws.WorkspaceID).
			Select("COALESCE(MAX(sort_order), -1)").
			Scan(&maxOrder).Error; err != nil {
			return err
		}

		restoredIDs := make([]uint, 0, len(items))
		seen := make(map[uint]bool, len(ids))
		// 按调用方传入的顺序恢复，保持批量操作与界面展示顺序一致
		for _, id := range ids {
			if seen[id] {
				continue
			}
			seen[id] = true
			item, ok := byID[id]
			if !ok {
				continue
			}
			maxOrder++
			newTab := model.Tab{
				WorkspaceID: ws.WorkspaceID,
				URL:         item.URL,
				Title:       item.Title,
				DisplayName: item.DisplayName,
				FavIconURL:  item.FavIconURL,
				SortOrder:   maxOrder,
				// 优先保留回收站中记录的添加时间（用户可能手动改过），为空时回退到当前时间
				AddedAt: addedAtOrNow(item.AddedAt),
				// 保留回收站中记录的描述（用户可能手动设置过），为空时继承原行为
				Description: item.Description,
			}
			if err := tx.Create(&newTab).Error; err != nil {
				return err
			}
			restoredIDs = append(restoredIDs, id)
		}
		if len(restoredIDs) == 0 {
			return errors.New("回收站标签页不存在")
		}

		// 移除已恢复的回收站记录
		if err := tx.Where("id IN ?", restoredIDs).Delete(&model.RecycleBinTab{}).Error; err != nil {
			return err
		}
		restored = len(restoredIDs)
		return nil
	})
	if err != nil {
		return 0, err
	}
	return restored, nil
}

// resolveTargetWorkspace 解析恢复目标：未指定时回退「未分组」，否则要求工作组存在且未删除
func (s *RecycleBinService) resolveTargetWorkspace(workspaceID string) (*model.Workspace, error) {
	if workspaceID == "" {
		return s.workspace.GetOrCreateUngroupedWorkspace()
	}
	var ws model.Workspace
	if err := s.db.Where("workspace_id = ? AND is_deleted = ?", workspaceID, false).First(&ws).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("目标工作组不存在或已被删除")
		}
		return nil, err
	}
	return &ws, nil
}

// Delete 彻底删除一条回收站标签页
func (s *RecycleBinService) Delete(id uint) error {
	return s.db.Where("id = ?", id).Delete(&model.RecycleBinTab{}).Error
}

// Empty 清空回收站
func (s *RecycleBinService) Empty() error {
	return s.db.Where("1 = 1").Delete(&model.RecycleBinTab{}).Error
}

// addedAtOrNow 返回回收站记录的添加时间；若该时间为空（旧数据或从未设置），
// 回退为当前时间，并统一截断到秒，与新增标签页的存储格式保持一致。
func addedAtOrNow(addedAt time.Time) time.Time {
	if addedAt.IsZero() {
		return time.Now().Truncate(time.Second)
	}
	return addedAt.Truncate(time.Second)
}

func toRecycleBinResponse(it model.RecycleBinTab) RecycleBinTabResponse {
	return RecycleBinTabResponse{
		ID:                    it.ID,
		OriginalWorkspaceID:   it.OriginalWorkspaceID,
		OriginalWorkspaceName: it.OriginalWorkspaceName,
		URL:                   it.URL,
		Title:                 it.Title,
		DisplayName:           it.DisplayName,
		FavIconURL:            it.FavIconURL,
		Description:           it.Description,
		AddedAt:               it.AddedAt,
		DeletedAt:             it.DeletedAt,
	}
}
