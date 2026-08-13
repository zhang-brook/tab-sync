package service

import (
	"strconv"
	"testing"
)

func TestTagService_List_TabCount(t *testing.T) {
	db, _ := setupTestDB(t)
	tagSvc := NewTagService(db)
	wsSvc := NewWorkspaceService(db, nil)

	// 创建两个 tab 标签和一个 workspace 标签
	tagA, err := tagSvc.Create("A", "#409EFF", "tab", "")
	if err != nil {
		t.Fatalf("创建标签 A 失败: %v", err)
	}
	tagB, err := tagSvc.Create("B", "#67C23A", "tab", "")
	if err != nil {
		t.Fatalf("创建标签 B 失败: %v", err)
	}
	if _, err := tagSvc.Create("WS", "#909399", "workspace", ""); err != nil {
		t.Fatalf("创建工作区标签失败: %v", err)
	}

	// 创建工作组并添加两个标签页
	ws, err := wsSvc.Create(CreateWorkspacePayload{Name: "测试工作组"})
	if err != nil {
		t.Fatalf("创建工作组失败: %v", err)
	}
	updated, err := wsSvc.Update(ws.Workspace.ID, UpdateWorkspacePayload{
		Tabs: []WorkspaceTabData{
			{URL: "https://example.com", Title: "Example", ChromeTabID: 1},
			{URL: "https://test.com", Title: "Test", ChromeTabID: 2},
		},
	})
	if err != nil {
		t.Fatalf("添加标签页失败: %v", err)
	}

	// 标签页 1 打标签 A；标签页 2 打标签 A 和 B
	tab1ID, _ := strconv.ParseUint(updated.Tabs[0].TabID, 10, 64)
	tab2ID, _ := strconv.ParseUint(updated.Tabs[1].TabID, 10, 64)
	if err := tagSvc.AddToTab(ws.Workspace.ID, uint(tab1ID), tagA.ID); err != nil {
		t.Fatalf("标签页 1 打标签 A 失败: %v", err)
	}
	if err := tagSvc.AddToTab(ws.Workspace.ID, uint(tab2ID), tagA.ID); err != nil {
		t.Fatalf("标签页 2 打标签 A 失败: %v", err)
	}
	if err := tagSvc.AddToTab(ws.Workspace.ID, uint(tab2ID), tagB.ID); err != nil {
		t.Fatalf("标签页 2 打标签 B 失败: %v", err)
	}

	// 不带 scope：全部标签均带统计
	tags, err := tagSvc.List("")
	if err != nil {
		t.Fatalf("列出标签失败: %v", err)
	}
	counts := make(map[string]int64)
	for _, t := range tags {
		counts[t.Name] = t.TabCount
	}
	if counts["A"] != 2 {
		t.Errorf("标签 A 的页面数不匹配: got %d, want 2", counts["A"])
	}
	if counts["B"] != 1 {
		t.Errorf("标签 B 的页面数不匹配: got %d, want 1", counts["B"])
	}
	if counts["WS"] != 0 {
		t.Errorf("工作组标签的页面数不匹配: got %d, want 0", counts["WS"])
	}

	// scope=tab 过滤下同样带统计
	tagsTab, err := tagSvc.List("tab")
	if err != nil {
		t.Fatalf("列出 tab 标签失败: %v", err)
	}
	if len(tagsTab) != 2 {
		t.Fatalf("tab 标签数量不匹配: got %d, want 2", len(tagsTab))
	}
	for _, tag := range tagsTab {
		if tag.Name == "A" && tag.TabCount != 2 {
			t.Errorf("scope=tab 下标签 A 的页面数不匹配: got %d, want 2", tag.TabCount)
		}
	}
}

func TestTagService_Update_ClearColor(t *testing.T) {
	db, _ := setupTestDB(t)
	tagSvc := NewTagService(db)

	tag, err := tagSvc.Create("有颜色", "#FF0000", "tab", "")
	if err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}

	// 清空颜色（传空字符串）
	updated, err := tagSvc.Update(tag.ID, "", "", "")
	if err != nil {
		t.Fatalf("更新标签失败: %v", err)
	}
	if updated.Color != "" {
		t.Errorf("清空颜色后响应中仍保留颜色: got %q, want \"\"", updated.Color)
	}

	// 重新从数据库读取确认持久化（对应前端“刷新列表后颜色恢复”场景）
	tags, err := tagSvc.List("tab")
	if err != nil {
		t.Fatalf("列出标签失败: %v", err)
	}
	var found *TagResponse
	for i := range tags {
		if tags[i].ID == tag.ID {
			found = &tags[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("未找到更新后的标签")
	}
	if found.Color != "" {
		t.Errorf("刷新后颜色恢复: got %q, want \"\"", found.Color)
	}
	if found.Name != "有颜色" {
		t.Errorf("名称被意外修改: got %q, want \"有颜色\"", found.Name)
	}
}
