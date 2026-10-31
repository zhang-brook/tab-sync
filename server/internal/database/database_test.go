package database

import (
	"os"
	"testing"

	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/model"
)

// initBareDB 创建测试用临时 SQLite 数据库，但不执行迁移
func initBareDB(t *testing.T) *DB {
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
	return db
}

// initTestDB 创建测试用临时 SQLite 数据库并执行迁移
func initTestDB(t *testing.T) *DB {
	t.Helper()

	db := initBareDB(t)
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("数据库迁移失败: %v", err)
	}
	return db
}

// TestMigrateLegacyTabTable 构造旧版表结构，验证启动迁移把
// workspace_tabs / tab_tags.workspace_tab_id 升级为 tabs / tab_tags.tab_id，
// 同时保留数据、修正外键引用并清理旧索引。
func TestMigrateLegacyTabTable(t *testing.T) {
	db := initBareDB(t)

	legacySchema := []string{
		"CREATE TABLE `workspaces` (`id` integer PRIMARY KEY AUTOINCREMENT,`workspace_id` text NOT NULL,`name` text NOT NULL,`color` text DEFAULT \"#409EFF\",`icon` text,`sort_order` integer DEFAULT 0,`is_deleted` numeric DEFAULT false,`created_at` datetime,`updated_at` datetime,`deleted_at` datetime, `parent_id` text DEFAULT \"\", `is_system` numeric DEFAULT false, `description` text, `collapsed` numeric DEFAULT false)",
		"CREATE INDEX `idx_workspaces_deleted_at` ON `workspaces`(`deleted_at`)",
		"CREATE UNIQUE INDEX `idx_workspaces_workspace_id` ON `workspaces`(`workspace_id`)",
		"CREATE INDEX `idx_workspaces_parent_id` ON `workspaces`(`parent_id`)",
		"CREATE TABLE `workspace_tabs` (`id` integer PRIMARY KEY AUTOINCREMENT,`workspace_id` text NOT NULL,`url` text NOT NULL,`title` text,`fav_icon_url` text,`sort_order` integer DEFAULT 0,`added_at` datetime,`created_at` datetime,`updated_at` datetime, `fav_icon_data` text, `display_name` text, `description` text, `tab_id` text,CONSTRAINT `fk_workspaces_tabs` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`workspace_id`))",
		"CREATE INDEX `idx_workspace_tabs_workspace_id` ON `workspace_tabs`(`workspace_id`)",
		"CREATE UNIQUE INDEX `ws_tab_unique` ON `workspace_tabs`(`tab_id`)",
		"CREATE TABLE `tags` (`id` integer PRIMARY KEY AUTOINCREMENT,`name` text NOT NULL,`color` text,`scope` text,`created_at` datetime, `description` text)",
		"CREATE INDEX `idx_tags_scope` ON `tags`(`scope`)",
		"CREATE INDEX `idx_tags_name` ON `tags`(`name`)",
		"CREATE TABLE `tab_tags` (`id` integer PRIMARY KEY AUTOINCREMENT,`workspace_tab_id` integer,`workspace_id` text,`tag_id` integer,CONSTRAINT `fk_tab_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`),CONSTRAINT `fk_workspace_tabs_tags` FOREIGN KEY (`workspace_tab_id`) REFERENCES `workspace_tabs`(`id`))",
		"CREATE INDEX `idx_tab_tags_tag_id` ON `tab_tags`(`tag_id`)",
		"CREATE INDEX `idx_tab_tags_workspace_id` ON `tab_tags`(`workspace_id`)",
		"CREATE INDEX `idx_tab_tags_workspace_tab_id` ON `tab_tags`(`workspace_tab_id`)",
		"CREATE UNIQUE INDEX `uniq_tab_tag` ON `tab_tags`(`workspace_tab_id`, `tag_id`)",
		"INSERT INTO `workspaces` (`workspace_id`, `name`) VALUES ('ws-1', '旧工作组')",
		"INSERT INTO `workspace_tabs` (`workspace_id`, `url`, `title`, `display_name`, `added_at`, `tab_id`) VALUES ('ws-1', 'https://example.com', '示例', '自定义名称', '2026-01-01T00:00:00Z', 'legacy-uuid')",
		"INSERT INTO `tags` (`name`, `scope`) VALUES ('标签', 'tab')",
		"INSERT INTO `tab_tags` (`workspace_tab_id`, `workspace_id`, `tag_id`) VALUES (1, 'ws-1', 1)",
	}
	for _, stmt := range legacySchema {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("创建旧表结构失败: %v\nSQL: %s", err, stmt)
		}
	}

	if err := AutoMigrate(db); err != nil {
		t.Fatalf("迁移旧表结构失败: %v", err)
	}

	if tableExists(db.DB, "workspace_tabs") {
		t.Error("旧表 workspace_tabs 仍然存在")
	}
	if !tableExists(db.DB, "tabs") {
		t.Fatal("新表 tabs 不存在")
	}
	if columnExists(db.DB, "tabs", "tab_id") {
		t.Error("tabs 表中历史遗留的 tab_id 列未被清理")
	}

	var tab model.Tab
	if err := db.First(&tab, 1).Error; err != nil {
		t.Fatalf("查询迁移后的标签页失败: %v", err)
	}
	if tab.WorkspaceID != "ws-1" || tab.URL != "https://example.com" || tab.DisplayName != "自定义名称" {
		t.Errorf("标签页数据未完整保留: %+v", tab)
	}

	if !columnExists(db.DB, "tab_tags", "tab_id") {
		t.Error("tab_tags.tab_id 列不存在")
	}
	if columnExists(db.DB, "tab_tags", "workspace_tab_id") {
		t.Error("tab_tags.workspace_tab_id 旧列仍然存在")
	}

	var rel model.TabTag
	if err := db.First(&rel, 1).Error; err != nil {
		t.Fatalf("查询迁移后的标签关联失败: %v", err)
	}
	if rel.TabID != 1 || rel.WorkspaceID != "ws-1" || rel.TagID != 1 {
		t.Errorf("标签关联数据未完整保留: %+v", rel)
	}

	var violations int64
	if err := db.Raw("SELECT count(*) FROM pragma_foreign_key_check").Scan(&violations).Error; err != nil {
		t.Fatalf("外键完整性检查失败: %v", err)
	}
	if violations != 0 {
		t.Errorf("迁移后存在 %d 条外键违规", violations)
	}

	if !indexExists(db, "tabs", "idx_tabs_workspace_id") {
		t.Error("新索引 idx_tabs_workspace_id 不存在")
	}
	if indexExists(db, "tabs", "idx_workspace_tabs_workspace_id") {
		t.Error("旧索引 idx_workspace_tabs_workspace_id 未被清理")
	}
	if !indexExists(db, "tab_tags", "uniq_tab_tag") {
		t.Error("唯一索引 uniq_tab_tag 不存在")
	}
	if !indexExists(db, "tab_tags", "idx_tab_tags_tab_id") {
		t.Error("新索引 idx_tab_tags_tab_id 不存在")
	}
	if indexExists(db, "tab_tags", "idx_tab_tags_workspace_tab_id") {
		t.Error("旧索引 idx_tab_tags_workspace_tab_id 未被清理")
	}

	if err := AutoMigrate(db); err != nil {
		t.Fatalf("重复执行迁移不应报错: %v", err)
	}
}

func indexExists(db *DB, table, name string) bool {
	var count int64
	db.Raw("SELECT count(*) FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name = ?", table, name).Scan(&count)
	return count > 0
}

// TestFixTabTagWorkspaceID 构造存量脏数据（标签关联的 workspace_id 残留旧归属），
// 验证修复函数以 tabs 表为准校正，且重复执行直接跳过。
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
	tab := model.Tab{WorkspaceID: "ws-b", URL: "https://b.com", Title: "B Tab"}
	if err := db.Create(&tab).Error; err != nil {
		t.Fatalf("创建标签页失败: %v", err)
	}
	tag := model.Tag{Name: "标签", Color: "#0000ff", Scope: "tab"}
	if err := db.Create(&tag).Error; err != nil {
		t.Fatalf("创建标签失败: %v", err)
	}
	rel := model.TabTag{TabID: tab.ID, WorkspaceID: "ws-a", TagID: tag.ID}
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

	liveTab := model.Tab{WorkspaceID: "ws-live", URL: "https://live.example.com"}
	if err := db.Create(&liveTab).Error; err != nil {
		t.Fatalf("创建存活标签页失败: %v", err)
	}
	deletedTab := model.Tab{WorkspaceID: "ws-deleted", URL: "https://deleted.example.com"}
	if err := db.Create(&deletedTab).Error; err != nil {
		t.Fatalf("创建已删除工作组下的标签页失败: %v", err)
	}

	liveRel := model.TabTag{TabID: liveTab.ID, WorkspaceID: "ws-live", TagID: tag.ID}
	if err := db.Create(&liveRel).Error; err != nil {
		t.Fatalf("创建存活标签页标签关联失败: %v", err)
	}
	orphanRel := model.TabTag{TabID: 99999, WorkspaceID: "ws-live", TagID: tag.ID}
	if err := db.Create(&orphanRel).Error; err != nil {
		t.Fatalf("创建孤儿标签页标签关联失败: %v", err)
	}
	deletedWSRel := model.TabTag{TabID: deletedTab.ID, WorkspaceID: "ws-deleted", TagID: tag.ID}
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
