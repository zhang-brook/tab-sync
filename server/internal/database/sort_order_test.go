package database

import (
	"os"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/spidermemos/tab-sync/server/internal/model"
)

// newSortOrderTestDB 建立仅含 workspaces / schema_metas 两张表的测试库，
// 并刻意把 sort_order 全部留为 0，模拟升级前的存量数据。
func newSortOrderTestDB(t *testing.T) *DB {
	t.Helper()

	tmpFile, err := os.CreateTemp("", "tab-sync-sortorder-*.db")
	if err != nil {
		t.Fatalf("创建临时数据库失败: %v", err)
	}
	t.Cleanup(func() {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
	})

	db, err := gorm.Open(sqlite.Open(tmpFile.Name()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("打开数据库失败: %v", err)
	}
	if err := db.AutoMigrate(&model.Workspace{}, &model.SchemaMeta{}); err != nil {
		t.Fatalf("建表失败: %v", err)
	}
	return &DB{DB: db}
}

// sortOrderOf 读取某个工作组当前的 sort_order
func sortOrderOf(t *testing.T, db *DB, workspaceID string) int {
	t.Helper()
	var ws model.Workspace
	if err := db.Where("workspace_id = ?", workspaceID).First(&ws).Error; err != nil {
		t.Fatalf("读取工作组 %s 失败: %v", workspaceID, err)
	}
	return ws.SortOrder
}

func TestInitWorkspaceSortOrder(t *testing.T) {
	db := newSortOrderTestDB(t)

	// 根级：未分组（系统组）+ 三个中文组，插入顺序刻意打乱
	seed := []struct {
		id       string
		parentID string
		name     string
		isSystem bool
	}{
		{"ungrouped", "", "未分组", true},
		{"sh", "", "上海", false},
		{"bj", "", "北京", false},
		{"gz", "", "广州", false},
		{"bj-1", "bj", "子组B", false},
		{"bj-2", "bj", "子组A", false},
	}
	for _, s := range seed {
		if err := db.Create(&model.Workspace{
			WorkspaceID: s.id, ParentID: s.parentID, Name: s.name, IsSystem: s.isSystem,
		}).Error; err != nil {
			t.Fatalf("插入测试数据失败: %v", err)
		}
	}

	if err := InitWorkspaceSortOrder(db); err != nil {
		t.Fatalf("初始化 sort_order 失败: %v", err)
	}

	// 中文按拼音序：北京(bei) < 广州(guang) < 上海(shang)
	// 「未分组」为系统组，置顶展示由前端负责，这里只保证编号稠密
	if got, want := sortOrderOf(t, db, "bj"), 0; got != want {
		t.Errorf("北京 sort_order: got %d, want %d", got, want)
	}
	if got, want := sortOrderOf(t, db, "gz"), 1; got != want {
		t.Errorf("广州 sort_order: got %d, want %d", got, want)
	}
	if got, want := sortOrderOf(t, db, "sh"), 2; got != want {
		t.Errorf("上海 sort_order: got %d, want %d", got, want)
	}
	// 子级独立编号
	if got, want := sortOrderOf(t, db, "bj-2"), 0; got != want {
		t.Errorf("子组A sort_order: got %d, want %d", got, want)
	}
	if got, want := sortOrderOf(t, db, "bj-1"), 1; got != want {
		t.Errorf("子组B sort_order: got %d, want %d", got, want)
	}
}

// TestInitWorkspaceSortOrder_Idempotent 迁移只能执行一次，重复调用不得覆盖用户的手动排序
func TestInitWorkspaceSortOrder_Idempotent(t *testing.T) {
	db := newSortOrderTestDB(t)

	if err := db.Create(&model.Workspace{WorkspaceID: "a", Name: "A"}).Error; err != nil {
		t.Fatalf("插入测试数据失败: %v", err)
	}
	if err := InitWorkspaceSortOrder(db); err != nil {
		t.Fatalf("首次初始化失败: %v", err)
	}

	// 模拟用户手动排序后的结果
	if err := db.Model(&model.Workspace{}).Where("workspace_id = ?", "a").Update("sort_order", 7).Error; err != nil {
		t.Fatalf("更新 sort_order 失败: %v", err)
	}
	if err := InitWorkspaceSortOrder(db); err != nil {
		t.Fatalf("重复初始化失败: %v", err)
	}
	if got, want := sortOrderOf(t, db, "a"), 7; got != want {
		t.Errorf("重复初始化不应覆盖手动排序: got %d, want %d", got, want)
	}
}
