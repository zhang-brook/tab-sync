package service

import (
	"testing"
)

func TestWorkspaceService_Create(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	result, err := svc.Create(CreateWorkspacePayload{
		Name:  "测试工作组",
		Color: "#409EFF",
		Icon:  "folder",
		Tabs: []WorkspaceTabData{
			{URL: "https://example.com", Title: "Example", ChromeTabID: 1},
			{URL: "https://test.com", Title: "Test", ChromeTabID: 2},
		},
	})
	if err != nil {
		t.Fatalf("创建工作区失败: %v", err)
	}
	if result.Workspace.Name != "测试工作组" {
		t.Errorf("工作组名称不匹配: got %s", result.Workspace.Name)
	}
	if len(result.Workspace.Tabs) != 2 {
		t.Errorf("标签页数量不匹配: got %d, want 2", len(result.Workspace.Tabs))
	}
	if result.Workspace.Tabs[0].Title != "Example" {
		t.Errorf("第一个标签页标题不匹配: got %s", result.Workspace.Tabs[0].Title)
	}
}

func TestWorkspaceService_List(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	svc.Create(CreateWorkspacePayload{Name: "工作组 A"})
	svc.Create(CreateWorkspacePayload{Name: "工作组 B"})
	svc.Create(CreateWorkspacePayload{Name: "工作组 C"})

	workspaces, err := svc.List()
	if err != nil {
		t.Fatalf("列出工作组失败: %v", err)
	}
	if len(workspaces) != 3 {
		t.Errorf("工作组数量不匹配: got %d, want 3", len(workspaces))
	}
}

func TestWorkspaceService_Update(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	result, _ := svc.Create(CreateWorkspacePayload{
		Name:  "原始名称",
		Color: "#000000",
		Tabs: []WorkspaceTabData{
			{URL: "https://old.com", Title: "Old"},
		},
	})

	newName := "新名称"
	updated, err := svc.Update(result.Workspace.ID, UpdateWorkspacePayload{
		Name: &newName,
	})
	if err != nil {
		t.Fatalf("更新工作组失败: %v", err)
	}
	if updated.Name != "新名称" {
		t.Errorf("更新后名称不匹配: got %s", updated.Name)
	}
}

func TestWorkspaceService_Delete(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	result, _ := svc.Create(CreateWorkspacePayload{Name: "待删除"})

	err := svc.Delete(result.Workspace.ID)
	if err != nil {
		t.Fatalf("删除工作组失败: %v", err)
	}

	workspaces, _ := svc.List()
	if len(workspaces) != 0 {
		t.Errorf("删除后工作组数量不匹配: got %d, want 0", len(workspaces))
	}
}

func TestWorkspaceService_TabsSummary(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	svc.Create(CreateWorkspacePayload{
		Name: "带标签的工作组",
		Tabs: []WorkspaceTabData{
			{URL: "https://a.com", Title: "A"},
			{URL: "https://b.com", Title: "B"},
			{URL: "https://c.com", Title: "C"},
		},
	})

	summary, err := svc.TabsSummary()
	if err != nil {
		t.Fatalf("获取标签摘要失败: %v", err)
	}
	if len(summary) != 1 {
		t.Errorf("摘要数量不匹配: got %d, want 1", len(summary))
	}
	if len(summary[0].Tabs) != 3 {
		t.Errorf("摘要标签数量不匹配: got %d, want 3", len(summary[0].Tabs))
	}
}
