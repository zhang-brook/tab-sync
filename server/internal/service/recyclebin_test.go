package service

import "testing"

// setupRecycleBin 构造带回收站的工作组服务（DeleteTab 会把标签页移入回收站）
func setupRecycleBin(t *testing.T) (*RecycleBinService, *WorkspaceService) {
	t.Helper()
	db, _ := setupTestDB(t)
	wsSvc := NewWorkspaceService(db, nil)
	rbSvc := NewRecycleBinService(db, wsSvc)
	wsSvc.RecycleBin = rbSvc
	return rbSvc, wsSvc
}

// addAndDeleteTabs 向工作组添加标签页后全部移除，返回回收站条目（与列表展示顺序一致）
func addAndDeleteTabs(t *testing.T, rbSvc *RecycleBinService, wsSvc *WorkspaceService, workspaceID string, urls []string) []RecycleBinTabResponse {
	t.Helper()
	tabs := make([]TabData, 0, len(urls))
	for _, url := range urls {
		tabs = append(tabs, TabData{URL: url, Title: url})
	}
	updated, err := wsSvc.Update(workspaceID, UpdateWorkspacePayload{Tabs: tabs})
	if err != nil {
		t.Fatalf("添加标签页失败: %v", err)
	}
	for _, tab := range updated.Tabs {
		if err := wsSvc.DeleteTab(workspaceID, tab.TabID); err != nil {
			t.Fatalf("移除标签页失败: %v", err)
		}
	}

	items, err := rbSvc.List()
	if err != nil {
		t.Fatalf("获取回收站失败: %v", err)
	}
	return items
}

// idsOf 提取回收站条目 ID（保持列表顺序）
func idsOf(items []RecycleBinTabResponse) []uint {
	ids := make([]uint, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	return ids
}

func TestRecycleBinService_RestoreToTargetWorkspace(t *testing.T) {
	rbSvc, wsSvc := setupRecycleBin(t)
	src := createWS(t, wsSvc, "来源", "")
	dst := createWS(t, wsSvc, "目标", "")

	items := addAndDeleteTabs(t, rbSvc, wsSvc, src, []string{"https://a.com", "https://b.com"})
	if len(items) != 2 {
		t.Fatalf("回收站条目数量不匹配: got %d, want 2", len(items))
	}

	restored, err := rbSvc.Restore(idsOf(items), dst)
	if err != nil {
		t.Fatalf("恢复标签页失败: %v", err)
	}
	if restored != 2 {
		t.Errorf("恢复数量不匹配: got %d, want 2", restored)
	}

	// 标签页已按回收站列表顺序追加到目标工作组
	dstTabs, err := wsSvc.GetTabs(dst)
	if err != nil {
		t.Fatalf("获取目标工作组标签页失败: %v", err)
	}
	if len(dstTabs) != 2 {
		t.Fatalf("目标工作组标签页数量不匹配: got %d, want 2", len(dstTabs))
	}
	for i, tab := range dstTabs {
		if tab.URL != items[i].URL {
			t.Errorf("第 %d 个标签页 URL 不匹配: got %s, want %s", i, tab.URL, items[i].URL)
		}
		if tab.SortOrder != i {
			t.Errorf("第 %d 个标签页排序号不匹配: got %d, want %d", i, tab.SortOrder, i)
		}
	}

	// 回收站记录已移除
	remaining, err := rbSvc.List()
	if err != nil {
		t.Fatalf("获取回收站失败: %v", err)
	}
	if len(remaining) != 0 {
		t.Errorf("恢复后回收站应为空: got %d", len(remaining))
	}
}

func TestRecycleBinService_RestoreFallsBackToUngrouped(t *testing.T) {
	rbSvc, wsSvc := setupRecycleBin(t)
	src := createWS(t, wsSvc, "来源", "")

	items := addAndDeleteTabs(t, rbSvc, wsSvc, src, []string{"https://a.com"})
	if _, err := rbSvc.Restore(idsOf(items), ""); err != nil {
		t.Fatalf("恢复标签页失败: %v", err)
	}

	ws, err := wsSvc.GetOrCreateUngroupedWorkspace()
	if err != nil {
		t.Fatalf("获取「未分组」失败: %v", err)
	}
	tabs, err := wsSvc.GetTabs(ws.WorkspaceID)
	if err != nil {
		t.Fatalf("获取「未分组」标签页失败: %v", err)
	}
	if len(tabs) != 1 || tabs[0].URL != "https://a.com" {
		t.Errorf("未指定目标时应恢复到「未分组」: got %+v", tabs)
	}
}

func TestRecycleBinService_RestoreRejectsMissingTarget(t *testing.T) {
	rbSvc, wsSvc := setupRecycleBin(t)
	src := createWS(t, wsSvc, "来源", "")

	items := addAndDeleteTabs(t, rbSvc, wsSvc, src, []string{"https://a.com"})
	if _, err := rbSvc.Restore(idsOf(items), "missing-workspace"); err == nil {
		t.Fatal("恢复到不存在的工作组应返回错误")
	}

	// 失败时不应移出回收站
	remaining, err := rbSvc.List()
	if err != nil {
		t.Fatalf("获取回收站失败: %v", err)
	}
	if len(remaining) != 1 {
		t.Errorf("恢复失败后回收站条目应保留: got %d", len(remaining))
	}
}
