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

// TestCleanupOrphanTagAssociations 验证孤儿标签关联（指向已删除标签页/工作组）
// 会在迁移时被清理，而存活关联保持不变。
func TestCleanupOrphanTagAssociations(t *testing.T) {
	db := initTestDB(t)

	// AutoMigrate 已在空库执行过一次清理并写入标记，清掉标记以便验证清理逻辑
	if err := db.Where("meta_key = ?", tagAssociationCleanupMetaKey).Delete(&model.SchemaMeta{}).Error; err != nil {
		t.Fatalf("清理迁移标记失败: %v", err)
	}

	liveWS := model.Workspace{WorkspaceID: "ws-live", Name: "存活", Color: "#00ff00"}
	deletedWS := model.Workspace{WorkspaceID: "ws-deleted", Name: "已删除", Color: "#ff0000", IsDeleted: true}
	if err := db.Create(&liveWS).Error; err != nil {
		t.Fatalf("创建存活工作组失败: %v", err)
	}
	if err := db.Create(&deletedWS).Error; err != nil {
		t.Fatalf("创建已删除工作组失败: %v", err)
	}

	tag := model.Tag{Name: "标签", Color: "#0000ff", Scope: "tab"}
	if err := db.Create(&tag).Error; err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}

	liveTab := model.WorkspaceTab{WorkspaceID: "ws-live", URL: "https://live.example.com"}
	if err := db.Create(&liveTab).Error; err != nil {
		t.Fatalf("创建存活标签页失败: %v", err)
	}
	deletedTab := model.WorkspaceTab{WorkspaceID: "ws-deleted", URL: "https://deleted.example.com"}
	if err := db.Create(&deletedTab).Error; err != nil {
		t.Fatalf("创建已删除工作组下的标签页失败: %v", err)
	}

	liveRel := model.TabTag{WorkspaceTabID: liveTab.ID, WorkspaceID: "ws-live", TagID: tag.ID}
	if err := db.Create(&liveRel).Error; err != nil {
		t.Fatalf("创建存活标签页标签关联失败: %v", err)
	}
	orphanRel := model.TabTag{WorkspaceTabID: 99999, WorkspaceID: "ws-live", TagID: tag.ID}
	if err := db.Create(&orphanRel).Error; err != nil {
		t.Fatalf("创建孤儿标签页标签关联失败: %v", err)
	}
	deletedWSRel := model.TabTag{WorkspaceTabID: deletedTab.ID, WorkspaceID: "ws-deleted", TagID: tag.ID}
	if err := db.Create(&deletedWSRel).Error; err != nil {
		t.Fatalf("创建已删除工作组下的标签页标签关联失败: %v", err)
	}

	liveWSRel := model.WorkspaceTag{WorkspaceID: "ws-live", TagID: tag.ID}
	if err := db.Create(&liveWSRel).Error; err != nil {
		t.Fatalf("创建存活工作组标签关联失败: %v", err)
	}
	deletedWSRel2 := model.WorkspaceTag{WorkspaceID: "ws-deleted", TagID: tag.ID}
	if err := db.Create(&deletedWSRel2).Error; err != nil {
		t.Fatalf("创建已删除工作组标签关联失败: %v", err)
	}

	if err := CleanupOrphanTagAssociations(db); err != nil {
		t.Fatalf("清理孤儿关联失败: %v", err)
	}

	var tabTagCount int64
	if err := db.Model(&model.TabTag{}).Count(&tabTagCount).Error; err != nil {
		t.Fatalf("统计标签页标签关联失败: %v", err)
	}
	if tabTagCount != 1 {
		t.Errorf("清理后标签页标签关联数量不匹配: got %d, want 1", tabTagCount)
	}
	var remainingTabTag model.TabTag
	if err := db.First(&remainingTabTag).Error; err != nil {
		t.Fatalf("查询剩余关联失败: %v", err)
	}
	if remainingTabTag.ID != liveRel.ID {
		t.Errorf("清理误删存活关联: got %d, want %d", remainingTabTag.ID, liveRel.ID)
	}

	var wsTagCount int64
	if err := db.Model(&model.WorkspaceTag{}).Count(&wsTagCount).Error; err != nil {
		t.Fatalf("统计工作组标签关联失败: %v", err)
	}
	if wsTagCount != 1 {
		t.Errorf("清理后工作组标签关联数量不匹配: got %d, want 1", wsTagCount)
	}

	// 幂等：再次执行应直接跳过（标记已写入）
	if err := CleanupOrphanTagAssociations(db); err != nil {
		t.Fatalf("重复执行清理不应报错: %v", err)
	}
}
