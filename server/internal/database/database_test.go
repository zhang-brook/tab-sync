package database

import (
	"os"
	"testing"

	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/model"
)

// initTestDB 创建测试用临时 SQLite 数据库并执行迁移
func initTestDB(t *testing.T) *DB {
	t.Helper()

	tmpFile, err := os.CreateTemp("", "tab-sync-db-test-*.db")
	if err != nil {
		t.Fatalf("创建临时数据库文件失败: %v", err)
	}
	t.Cleanup(func() {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
	})

	db, err := Init(&config.Config{DBPath: tmpFile.Name()})
	if err != nil {
		t.Fatalf("初始化数据库失败: %v", err)
	}
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("数据库迁移失败: %v", err)
	}
	return db
}

// TestFixTabTagWorkspaceID 构造存量脏数据（标签关联的 workspace_id 残留旧归属），
// 验证修复函数以 workspace_tabs 表为准校正，且重复执行直接跳过。
func TestFixTabTagWorkspaceID(t *testing.T) {
	db := initTestDB(t)

	// 工作组 A、B；标签页实际属于 B；标签关联的 workspace_id 残留旧值 A（历史脏数据）
	wsA := model.Workspace{WorkspaceID: "ws-a", Name: "A", Color: "#ff0000", IsSystem: false}
	wsB := model.Workspace{WorkspaceID: "ws-b", Name: "B", Color: "#00ff00", IsSystem: false}
	if err := db.Create(&wsA).Error; err != nil {
		t.Fatalf("创建工作组 A 失败: %v", err)
	}
	if err := db.Create(&wsB).Error; err != nil {
		t.Fatalf("创建工作组 B 失败: %v", err)
	}
	tab := model.WorkspaceTab{WorkspaceID: "ws-b", URL: "https://b.com", Title: "B Tab"}
	if err := db.Create(&tab).Error; err != nil {
		t.Fatalf("创建标签页失败: %v", err)
	}
	tag := model.Tag{Name: "标签", Color: "#0000ff", Scope: "tab"}
	if err := db.Create(&tag).Error; err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}
	rel := model.TabTag{WorkspaceTabID: tab.ID, WorkspaceID: "ws-a", TagID: tag.ID}
	if err := db.Create(&rel).Error; err != nil {
		t.Fatalf("创建标签关联失败: %v", err)
	}

	// AutoMigrate 已在空库执行过一次修复并写入标记，需清掉标记才能重跑修复逻辑
	if err := db.Where("meta_key = ?", tabTagWorkspaceIDMetaKey).Delete(&model.SchemaMeta{}).Error; err != nil {
		t.Fatalf("清理迁移标记失败: %v", err)
	}

	if err := FixTabTagWorkspaceID(db); err != nil {
		t.Fatalf("修复失败: %v", err)
	}

	var fixed model.TabTag
	if err := db.First(&fixed, rel.ID).Error; err != nil {
		t.Fatalf("查询标签关联失败: %v", err)
	}
	if fixed.WorkspaceID != "ws-b" {
		t.Errorf("修复后 workspace_id 应为 ws-b: got %s", fixed.WorkspaceID)
	}

	// 幂等：再次执行应直接跳过（标记已写入），不报错
	if err := FixTabTagWorkspaceID(db); err != nil {
		t.Fatalf("重复执行修复不应报错: %v", err)
	}
}

// TestFixTabTagWorkspaceID_NoDirtyData 空库/无脏数据时修复应直接跳过
func TestFixTabTagWorkspaceID_NoDirtyData(t *testing.T) {
	db := initTestDB(t)
	// 迁移阶段已执行过一次并写入标记，此处应直接返回
	if err := FixTabTagWorkspaceID(db); err != nil {
		t.Fatalf("无脏数据时修复不应报错: %v", err)
	}
}
