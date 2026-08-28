package service

import (
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestWorkspaceService_Duplicate 复制工作组：递归复制整棵子树（子/孙工作组 + 标签页 + 标签关联），
// 副本作为同级节点追加到末尾，标签页添加时间原样保留，源工作组不受影响。
func TestWorkspaceService_Duplicate(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)
	tagSvc := NewTagService(db)

	// 构造源子树：A（根级）→ A1（子级）→ A11（孙级）
	// A 带 1 个标签页 + 1 个工作组标签；A1 带 1 个标签页，该标签页带 1 个标签页标签
	a := createWS(t, svc, "A", "")
	a1 := createWS(t, svc, "A1", a)
	a11 := createWS(t, svc, "A11", a1)

	addedAt := time.Date(2025, 1, 2, 3, 4, 5, 0, time.Local).Format(time.RFC3339)
	updated, err := svc.Update(a, UpdateWorkspacePayload{Tabs: []WorkspaceTabData{
		{URL: "https://a.com", Title: "A Tab"},
	}})
	if err != nil {
		t.Fatalf("A 添加标签页失败: %v", err)
	}
	if err := svc.UpdateTab(a, updated.Tabs[0].TabID, UpdateTabPayload{AddedAt: &addedAt}); err != nil {
		t.Fatalf("设置添加时间失败: %v", err)
	}
	updatedA1, err := svc.Update(a1, UpdateWorkspacePayload{Tabs: []WorkspaceTabData{
		{URL: "https://a1.com", Title: "A1 Tab"},
	}})
	if err != nil {
		t.Fatalf("A1 添加标签页失败: %v", err)
	}
	a1TabID, err := strconv.ParseUint(updatedA1.Tabs[0].TabID, 10, 64)
	if err != nil {
		t.Fatalf("解析标签页 ID 失败: %v", err)
	}

	wsTag, err := tagSvc.Create("工作组标签", "#ff0000", "workspace", "")
	if err != nil {
		t.Fatalf("创建工作组标签失败: %v", err)
	}
	tabTag, err := tagSvc.Create("标签页标签", "#00ff00", "tab", "")
	if err != nil {
		t.Fatalf("创建标签页标签失败: %v", err)
	}
	if err := tagSvc.AddToWorkspace(a, wsTag.ID); err != nil {
		t.Fatalf("给 A 打工作组标签失败: %v", err)
	}
	if err := tagSvc.AddToTab(a1, uint(a1TabID), tabTag.ID); err != nil {
		t.Fatalf("给 A1 标签页打标签失败: %v", err)
	}

	// 复制 A
	result, err := svc.Duplicate(a)
	if err != nil {
		t.Fatalf("复制工作组失败: %v", err)
	}
	copyA := result.Workspace

	// 1. 根副本：命名 / 位置 / 属性
	if copyA.Name != "A (副本)" {
		t.Errorf("副本名称应为「A (副本)」: got %s", copyA.Name)
	}
	if copyA.ID == a {
		t.Error("副本 ID 不应与源相同")
	}
	if copyA.ParentID != "" || copyA.IsSystem {
		t.Errorf("根级副本应为普通根级工作组: parentId=%s isSystem=%v", copyA.ParentID, copyA.IsSystem)
	}
	if got, want := orderOf(t, svc, ""), []string{a, copyA.ID}; !equalStrings(got, want) {
		t.Errorf("副本应追加到同级末尾: got %v, want %v", got, want)
	}

	// 2. 根副本标签页：内容复制 + 添加时间保留 + 使用新主键
	if len(copyA.Tabs) != 1 || copyA.Tabs[0].URL != "https://a.com" || copyA.Tabs[0].Title != "A Tab" {
		t.Fatalf("根副本标签页不符: %+v", copyA.Tabs)
	}
	if copyA.Tabs[0].AddedAt != addedAt {
		t.Errorf("副本标签页添加时间应保留: got %s, want %s", copyA.Tabs[0].AddedAt, addedAt)
	}
	if copyA.Tabs[0].TabID == updated.Tabs[0].TabID {
		t.Error("副本标签页应使用新主键")
	}

	// 3. 根副本的工作组标签已复制
	if len(copyA.Tags) != 1 || copyA.Tags[0].ID != wsTag.ID {
		t.Errorf("副本工作组标签应复制: got %+v", copyA.Tags)
	}

	// 4. 子树结构：A1 / A11 复制为普通工作组，且保持层级
	all, err := svc.List(true, false)
	if err != nil {
		t.Fatalf("列出工作组失败: %v", err)
	}
	findChild := func(parentID string) *WorkspaceResponse {
		for i := range all {
			if all[i].ParentID == parentID {
				return &all[i]
			}
		}
		return nil
	}
	copyA1 := findChild(copyA.ID)
	if copyA1 == nil {
		t.Fatal("未找到子级副本 A1")
	}
	if copyA1.Name != "A1" || copyA1.IsSystem {
		t.Errorf("子级副本应保持原名称且为普通工作组: %+v", copyA1)
	}
	copyA11 := findChild(copyA1.ID)
	if copyA11 == nil || copyA11.Name != "A11" || copyA11.IsSystem {
		t.Error("孙级副本结构或属性不符")
	}
	if copyA11.ID == a11 {
		t.Error("孙级副本应使用新 ID")
	}

	// 5. 子副本标签页及其标签关联已复制
	a1CopyTabs, err := svc.GetTabs(copyA1.ID)
	if err != nil {
		t.Fatalf("读取子副本标签页失败: %v", err)
	}
	if len(a1CopyTabs) != 1 || a1CopyTabs[0].URL != "https://a1.com" {
		t.Fatalf("子副本标签页不符: %+v", a1CopyTabs)
	}
	if len(a1CopyTabs[0].Tags) != 1 || a1CopyTabs[0].Tags[0].ID != tabTag.ID {
		t.Errorf("子副本标签页的标签应复制: got %+v", a1CopyTabs[0].Tags)
	}
	if a1CopyTabs[0].TabID == updatedA1.Tabs[0].TabID {
		t.Error("子副本标签页应使用新主键")
	}

	// 6. 源工作组不受影响
	srcTabs, err := svc.GetTabs(a)
	if err != nil {
		t.Fatalf("读取源工作组标签页失败: %v", err)
	}
	if len(srcTabs) != 1 || srcTabs[0].URL != "https://a.com" {
		t.Errorf("源工作组标签页不应被改动: %+v", srcTabs)
	}
}

// TestWorkspaceService_Duplicate_Empty 复制空工作组（无标签页、无子工作组）
func TestWorkspaceService_Duplicate_Empty(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	a := createWS(t, svc, "空分组", "")
	result, err := svc.Duplicate(a)
	if err != nil {
		t.Fatalf("复制空工作组失败: %v", err)
	}
	if result.Workspace.Name != "空分组 (副本)" {
		t.Errorf("副本名称不符: got %s", result.Workspace.Name)
	}
	if len(result.Workspace.Tabs) != 0 {
		t.Errorf("空副本不应有标签页: %+v", result.Workspace.Tabs)
	}
}

// TestWorkspaceService_Duplicate_RejectSystemWorkspace 系统工作组不可复制
func TestWorkspaceService_Duplicate_RejectSystemWorkspace(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	ungrouped, err := svc.GetOrCreateUngroupedWorkspace()
	if err != nil {
		t.Fatalf("创建未分组失败: %v", err)
	}
	if _, err := svc.Duplicate(ungrouped.WorkspaceID); err == nil {
		t.Error("系统工作组应不可复制")
	}
}

// TestWorkspaceService_Duplicate_NotFound 不存在的工作组返回 ErrWorkspaceNotFound
func TestWorkspaceService_Duplicate_NotFound(t *testing.T) {
	db, _ := setupTestDB(t)
	svc := NewWorkspaceService(db, nil)

	if _, err := svc.Duplicate("not-exist"); !errors.Is(err, ErrWorkspaceNotFound) {
		t.Errorf("不存在的工作组应返回 ErrWorkspaceNotFound, got %v", err)
	}
}

// TestDuplicateWorkspaceName 副本名称生成：普通拼接 + 超长时按字符截断且保留后缀
func TestDuplicateWorkspaceName(t *testing.T) {
	if got := duplicateWorkspaceName("A"); got != "A (副本)" {
		t.Errorf("普通名称不符: got %s", got)
	}

	long := strings.Repeat("长", 200) // 200 个汉字，加后缀将超过 200 字符上限
	got := duplicateWorkspaceName(long)
	if !strings.HasSuffix(got, " (副本)") {
		t.Errorf("超长名称应保留后缀: got %s", got)
	}
	if len([]rune(got)) > 200 {
		t.Errorf("副本名称不应超过 200 字符: %d", len([]rune(got)))
	}
}
