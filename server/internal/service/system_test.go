package service

import (
	"testing"

	"github.com/spidermemos/tab-sync/server/internal/model"
)

func TestSystemService_GetDashboardStats(t *testing.T) {
	db, cfg := setupTestDB(t)
	svc := NewSystemService(db, cfg)

	devices := []model.Device{
		{DeviceID: "device-1", Name: "A"},
		{DeviceID: "device-2", Name: "B"},
	}
	if err := db.Create(&devices).Error; err != nil {
		t.Fatalf("创建设备失败: %v", err)
	}

	workspaces := []model.Workspace{
		{WorkspaceID: "ws-regular", Name: "工作", Color: "#409EFF"},
		{WorkspaceID: "ws-system", Name: "未分组", Color: "#909399", IsSystem: true},
		{WorkspaceID: "ws-deleted", Name: "已删除", Color: "#606266", IsDeleted: true},
	}
	if err := db.Create(&workspaces).Error; err != nil {
		t.Fatalf("创建工作组失败: %v", err)
	}

	tabs := []model.Tab{
		{WorkspaceID: "ws-regular", URL: "https://a.example.com", Title: "A"},
		{WorkspaceID: "ws-regular", URL: "https://b.example.com", Title: "B"},
		{WorkspaceID: "ws-system", URL: "https://c.example.com", Title: "C"},
		{WorkspaceID: "ws-deleted", URL: "https://d.example.com", Title: "D"},
	}
	if err := db.Create(&tabs).Error; err != nil {
		t.Fatalf("创建标签页失败: %v", err)
	}

	tags := []model.Tag{
		{Name: "重要", Color: "#F56C6C", Scope: "tab"},
		{Name: "工作", Color: "#409EFF", Scope: "workspace"},
	}
	if err := db.Create(&tags).Error; err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}

	stats, err := svc.GetDashboardStats()
	if err != nil {
		t.Fatalf("获取概览统计失败: %v", err)
	}

	if stats.Devices != 2 {
		t.Errorf("设备数 = %d, want 2", stats.Devices)
	}
	// 系统分组「未分组」与已删除工作组不计入
	if stats.Workspaces != 1 {
		t.Errorf("工作组数 = %d, want 1", stats.Workspaces)
	}
	if stats.Tags != 2 {
		t.Errorf("标签数 = %d, want 2", stats.Tags)
	}
	// 仅统计普通工作组内的标签页
	if stats.WorkspaceTabs != 2 {
		t.Errorf("工作组内标签页数 = %d, want 2", stats.WorkspaceTabs)
	}
}
