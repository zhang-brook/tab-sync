package service

import (
	"testing"
	"time"
)

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

	page, err := rbSvc.List(1, 200, "deletedAt", "desc")
	if err != nil {
		t.Fatalf("获取回收站失败: %v", err)
	}
	return page.Items
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
	page, err := rbSvc.List(1, 200, "deletedAt", "desc")
	if err != nil {
		t.Fatalf("获取回收站失败: %v", err)
	}
	if len(page.Items) != 0 {
		t.Errorf("恢复后回收站应为空: got %d", len(page.Items))
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
	page, err := rbSvc.List(1, 200, "deletedAt", "desc")
	if err != nil {
		t.Fatalf("获取回收站失败: %v", err)
	}
	if len(page.Items) != 1 {
		t.Errorf("恢复失败后回收站条目应保留: got %d", len(page.Items))
	}
}

func TestRecycleBinService_ListPagination(t *testing.T) {
	rbSvc, wsSvc := setupRecycleBin(t)
	src := createWS(t, wsSvc, "来源", "")
	addAndDeleteTabs(t, rbSvc, wsSvc, src, []string{"https://a.com", "https://b.com", "https://c.com"})

	first, err := rbSvc.List(1, 2, "deletedAt", "desc")
	if err != nil {
		t.Fatalf("获取回收站第一页失败: %v", err)
	}
	if first.Total != 3 || first.Page != 1 || first.PageSize != 2 {
		t.Errorf("分页元信息不匹配: got %+v", first)
	}
	if len(first.Items) != 2 {
		t.Errorf("第一页数量不匹配: got %d, want 2", len(first.Items))
	}

	second, err := rbSvc.List(2, 2, "deletedAt", "desc")
	if err != nil {
		t.Fatalf("获取回收站第二页失败: %v", err)
	}
	if len(second.Items) != 1 {
		t.Errorf("第二页数量不匹配: got %d, want 1", len(second.Items))
	}
}

func TestRecycleBinService_ListSortByName(t *testing.T) {
	rbSvc, wsSvc := setupRecycleBin(t)
	src := createWS(t, wsSvc, "来源", "")
	addAndDeleteTabs(t, rbSvc, wsSvc, src, []string{"https://c.com", "https://a.com", "https://b.com"})

	asc, err := rbSvc.List(1, 10, "name", "asc")
	if err != nil {
		t.Fatalf("按名称升序获取回收站失败: %v", err)
	}
	wantAsc := []string{"https://a.com", "https://b.com", "https://c.com"}
	for i, want := range wantAsc {
		if asc.Items[i].URL != want {
			t.Errorf("按名称升序第 %d 项不匹配: got %s, want %s", i, asc.Items[i].URL, want)
		}
	}

	desc, err := rbSvc.List(1, 10, "name", "desc")
	if err != nil {
		t.Fatalf("按名称降序获取回收站失败: %v", err)
	}
	wantDesc := []string{"https://c.com", "https://b.com", "https://a.com"}
	for i, want := range wantDesc {
		if desc.Items[i].URL != want {
			t.Errorf("按名称降序第 %d 项不匹配: got %s, want %s", i, desc.Items[i].URL, want)
		}
	}
}

func TestRecycleBinService_ListSortByAddedAt(t *testing.T) {
	rbSvc, wsSvc := setupRecycleBin(t)
	src := createWS(t, wsSvc, "来源", "")

	updated, err := wsSvc.Update(src, UpdateWorkspacePayload{Tabs: []TabData{
		{URL: "https://old.com", Title: "old"},
		{URL: "https://new.com", Title: "new"},
	}})
	if err != nil {
		t.Fatalf("添加标签页失败: %v", err)
	}
	if len(updated.Tabs) != 2 {
		t.Fatalf("标签页数量不匹配: got %d, want 2", len(updated.Tabs))
	}

	addedAtByURL := map[string]string{
		"https://old.com": "2024-01-01T00:00:00Z",
		"https://new.com": "2025-06-01T00:00:00Z",
	}
	for _, tab := range updated.Tabs {
		addedAt := addedAtByURL[tab.URL]
		if err := wsSvc.UpdateTab(src, tab.TabID, UpdateTabPayload{AddedAt: &addedAt}); err != nil {
			t.Fatalf("设置添加时间失败: %v", err)
		}
	}
	for _, tab := range updated.Tabs {
		if err := wsSvc.DeleteTab(src, tab.TabID); err != nil {
			t.Fatalf("移除标签页失败: %v", err)
		}
	}

	asc, err := rbSvc.List(1, 10, "addedAt", "asc")
	if err != nil {
		t.Fatalf("按添加时间升序获取回收站失败: %v", err)
	}
	if len(asc.Items) != 2 || asc.Items[0].URL != "https://old.com" || asc.Items[1].URL != "https://new.com" {
		t.Errorf("按添加时间升序结果不匹配: got %+v", asc.Items)
	}
	if !asc.Items[0].AddedAt.Equal(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("响应中未带回原添加时间: got %v", asc.Items[0].AddedAt)
	}

	desc, err := rbSvc.List(1, 10, "addedAt", "desc")
	if err != nil {
		t.Fatalf("按添加时间降序获取回收站失败: %v", err)
	}
	if desc.Items[0].URL != "https://new.com" || desc.Items[1].URL != "https://old.com" {
		t.Errorf("按添加时间降序结果不匹配: got %+v", desc.Items)
	}
}
