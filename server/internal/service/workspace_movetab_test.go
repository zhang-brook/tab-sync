package service

import (
	"strconv"
	"testing"

	"github.com/spidermemos/tab-sync/server/internal/model"
)

// TestWorkspaceService_MoveTab_SyncTabTag 移动标签页到其他工作组时，
// 其标签关联 tab_tags.workspace_id 应同步更新为新归属：
// 按新组移除标签应能删掉关联行，按标签联查工作组应显示新归属。
func TestWorkspaceService_MoveTab_SyncTabTag(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)
	tagSvc := NewTagService(db)

	a := createWS(t, svc, "A", "")
	b := createWS(t, svc, "B", "")

	// A 中添加一个标签页并打上标签
	updated, err := svc.Update(a, UpdateWorkspacePayload{Tabs: []WorkspaceTabData{
		{URL: "https://a.com", Title: "A Tab"},
	}})
	if err != nil {
		t.Fatalf("A 添加标签页失败: %v", err)
	}
	tabID, err := strconv.ParseUint(updated.Tabs[0].TabID, 10, 64)
	if err != nil {
		t.Fatalf("解析标签页 ID 失败: %v", err)
	}
	tag, err := tagSvc.Create("标签页标签", "#00ff00", "tab", "")
	if err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}
	if err := tagSvc.AddToTab(a, uint(tabID), tag.ID); err != nil {
		t.Fatalf("给标签页打标签失败: %v", err)
	}

	// 把标签页从 A 移动到 B
	if err := svc.MoveTab(b, updated.Tabs[0].TabID, 0); err != nil {
		t.Fatalf("移动标签页失败: %v", err)
	}

	// 1. tab_tags.workspace_id 已同步为新归属 B
	var rel model.TabTag
	if err := db.Where("workspace_tab_id = ?", tabID).First(&rel).Error; err != nil {
		t.Fatalf("查询标签关联失败: %v", err)
	}
	if rel.WorkspaceID != b {
		t.Errorf("移动后标签关联的 workspace_id 应为 %s: got %s", b, rel.WorkspaceID)
	}

	// 2. 按新组移除标签应成功（若仍残留旧归属则找不到行、报 not found）
	if err := tagSvc.RemoveFromTab(b, uint(tabID), tag.ID); err != nil {
		t.Errorf("按新组移除标签应成功: %v", err)
	}

	// 3. 重新打标签后，按标签联查工作组应显示新归属 B
	if err := tagSvc.AddToTab(b, uint(tabID), tag.ID); err != nil {
		t.Fatalf("给标签页打标签失败: %v", err)
	}
	items, err := tagSvc.GetTabsByTag(tag.ID)
	if err != nil {
		t.Fatalf("按标签联查失败: %v", err)
	}
	if len(items) != 1 || items[0].WorkspaceID != b {
		t.Errorf("按标签联查应命中 1 条且属于 B: got %+v", items)
	}
}

// TestWorkspaceService_MoveTab_SameWorkspace 在同一工作组内移动（仅调整顺序）时，
// 标签关联的 workspace_id 保持不变（无需更新）。
func TestWorkspaceService_MoveTab_SameWorkspace(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)
	tagSvc := NewTagService(db)

	a := createWS(t, svc, "A", "")

	updated, err := svc.Update(a, UpdateWorkspacePayload{Tabs: []WorkspaceTabData{
		{URL: "https://a1.com", Title: "A1"},
		{URL: "https://a2.com", Title: "A2"},
	}})
	if err != nil {
		t.Fatalf("A 添加标签页失败: %v", err)
	}
	tabID, err := strconv.ParseUint(updated.Tabs[0].TabID, 10, 64)
	if err != nil {
		t.Fatalf("解析标签页 ID 失败: %v", err)
	}
	tag, err := tagSvc.Create("标签页标签", "#00ff00", "tab", "")
	if err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}
	if err := tagSvc.AddToTab(a, uint(tabID), tag.ID); err != nil {
		t.Fatalf("给标签页打标签失败: %v", err)
	}

	// 组内移动到末尾（新索引超出当前长度）
	if err := svc.MoveTab(a, updated.Tabs[0].TabID, 5); err != nil {
		t.Fatalf("组内移动失败: %v", err)
	}

	var rel model.TabTag
	if err := db.Where("workspace_tab_id = ?", tabID).First(&rel).Error; err != nil {
		t.Fatalf("查询标签关联失败: %v", err)
	}
	if rel.WorkspaceID != a {
		t.Errorf("组内移动后标签关联的 workspace_id 应保持 %s: got %s", a, rel.WorkspaceID)
	}
}
