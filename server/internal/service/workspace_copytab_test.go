package service

import (
	"strconv"
	"testing"
	"time"

	"github.com/spidermemos/tab-sync/server/internal/model"
)

// TestWorkspaceService_CopyTab 复制标签页到其他工作组：
// 副本保留链接/标题/显示名/图标/描述/添加时间与标签关联，使用新主键并追加到目标组末尾，
// 源标签页保持不变。
func TestWorkspaceService_CopyTab(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)
	tagSvc := NewTagService(db)

	a := createWS(t, svc, "A", "")
	b := createWS(t, svc, "B", "")

	// B 先放一个标签页，用于验证副本追加在末尾
	if _, err := svc.Update(b, UpdateWorkspacePayload{Tabs: []TabData{
		{URL: "https://b.com", Title: "B Tab"},
	}}); err != nil {
		t.Fatalf("B 添加标签页失败: %v", err)
	}

	updated, err := svc.Update(a, UpdateWorkspacePayload{Tabs: []TabData{
		{URL: "https://a.com", Title: "A Tab"},
	}})
	if err != nil {
		t.Fatalf("A 添加标签页失败: %v", err)
	}
	tabID := updated.Tabs[0].TabID
	uid, err := strconv.ParseUint(tabID, 10, 64)
	if err != nil {
		t.Fatalf("解析标签页 ID 失败: %v", err)
	}

	// 设置显示名、描述、添加时间与标签
	addedAt := time.Date(2025, 2, 3, 4, 5, 6, 0, time.Local).Format(time.RFC3339)
	displayName := "自定义名称"
	description := "标签页描述"
	if err := svc.UpdateTab(a, tabID, UpdateTabPayload{
		AddedAt:     &addedAt,
		DisplayName: &displayName,
		Description: &description,
	}); err != nil {
		t.Fatalf("更新标签页属性失败: %v", err)
	}
	tag, err := tagSvc.Create("标签页标签", "#00ff00", "tab", "")
	if err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}
	if err := tagSvc.AddToTab(a, uint(uid), tag.ID); err != nil {
		t.Fatalf("给标签页打标签失败: %v", err)
	}

	copied, err := svc.CopyTab(b, tabID)
	if err != nil {
		t.Fatalf("复制标签页失败: %v", err)
	}

	// 1. 返回值：新主键 + 原属性
	if copied.TabID == tabID {
		t.Error("副本应使用新主键")
	}
	if copied.URL != "https://a.com" || copied.Title != "A Tab" {
		t.Errorf("副本链接/标题不符: %+v", copied)
	}
	if copied.DisplayName != displayName || copied.Description != description {
		t.Errorf("副本显示名/描述应保留: %+v", copied)
	}
	if copied.AddedAt != addedAt {
		t.Errorf("副本添加时间应保留: got %s, want %s", copied.AddedAt, addedAt)
	}

	// 2. 目标工作组：副本追加在末尾
	bTabs, err := svc.GetTabs(b)
	if err != nil {
		t.Fatalf("读取 B 标签页失败: %v", err)
	}
	if len(bTabs) != 2 {
		t.Fatalf("B 应有 2 个标签页: %+v", bTabs)
	}
	last := bTabs[len(bTabs)-1]
	if last.TabID != copied.TabID {
		t.Errorf("副本应追加在 B 末尾: got %s", last.TabID)
	}
	if len(last.Tags) != 1 || last.Tags[0].ID != tag.ID {
		t.Errorf("副本标签关联应复制: %+v", last.Tags)
	}

	// 3. 标签关联的 workspace_id 指向目标工作组
	var rel model.TabTagRelation
	if err := db.Where("tab_id = ?", copied.TabID).First(&rel).Error; err != nil {
		t.Fatalf("查询副本标签关联失败: %v", err)
	}
	if rel.WorkspaceID != b {
		t.Errorf("副本标签关联应归属 B: got %s", rel.WorkspaceID)
	}

	// 4. 源标签页及其标签关联不受影响
	aTabs, err := svc.GetTabs(a)
	if err != nil {
		t.Fatalf("读取 A 标签页失败: %v", err)
	}
	if len(aTabs) != 1 || aTabs[0].TabID != tabID || len(aTabs[0].Tags) != 1 {
		t.Errorf("源标签页不应被改动: %+v", aTabs)
	}
}

// TestWorkspaceService_CopyTab_Errors 参数或目标工作组无效时返回错误
func TestWorkspaceService_CopyTab_Errors(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	if _, err := svc.CopyTab("", "1"); err == nil {
		t.Error("空 workspaceID 应报错")
	}
	if _, err := svc.CopyTab("not-exist", "1"); err == nil {
		t.Error("目标工作组不存在应报错")
	}
	if _, err := svc.CopyTab("not-exist", "not-a-number"); err == nil {
		t.Error("非法 tabID 应报错")
	}
}
