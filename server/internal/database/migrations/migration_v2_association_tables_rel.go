package migrations

import (
	"fmt"

	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync/server/internal/model"
)

// migrationV2AssociationTableRename 把标签关联表改为带 _rel 后缀的表名：
//   - tab_tags → tab_tags_rel
//   - workspace_tags → workspace_tags_rel
//
// 表改名不会同步修改旧外键约束名与索引名，必须在 AutoMigrate 之前清理，
// 否则新旧两套约束/索引会并存。
var migrationV2AssociationTableRename = Migration{
	Version: 2,
	Name:    "association_tables_rel",
	BeforeAutoMigrate: func(db *gorm.DB) error {
		if err := renameAssociationTable(db, "tab_tags", "tab_tags_rel",
			&model.TabTagRelation{},
			// fk_tabs_tags 是按父表命名的 has-many 约束，GORM 会沿用该名称，无需删除。
			[]string{"fk_tab_tags_tag", "fk_workspace_tabs_tags"},
			"idx_tab_tags_%",
		); err != nil {
			return err
		}
		return renameAssociationTable(db, "workspace_tags", "workspace_tags_rel",
			&model.WorkspaceTagRelation{},
			[]string{"fk_workspace_tags_tag"},
			"idx_workspace_tags_%",
		)
	},
}

// renameAssociationTable 把旧关联表改名为当前表名，并清理旧表名留下的
// 外键约束与索引。tableModel 必须指向改名后的表，用于 Migrator 操作。
func renameAssociationTable(db *gorm.DB, oldName, newName string, tableModel interface{}, legacyConstraints []string, legacyIndexPattern string) error {
	if !tableExists(db, oldName) {
		return nil
	}

	if tableExists(db, newName) {
		// 半升级状态：新表已被 AutoMigrate 建出。空表直接丢弃，仍以旧表为准；
		// 新表已有数据时无法判断取舍，交由人工处理。
		var count int64
		if err := db.Table(newName).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("数据库中同时存在有数据的 %s 与 %s，请先人工确认保留哪一份", oldName, newName)
		}
		if err := db.Exec("DROP TABLE " + quoteIdentifier(newName)).Error; err != nil {
			return err
		}
	}

	if err := db.Exec("ALTER TABLE " + quoteIdentifier(oldName) + " RENAME TO " + quoteIdentifier(newName)).Error; err != nil {
		return err
	}

	// 删除旧约束会重建整张表，连带删除索引；索引随后由 AutoMigrate 按模型重建。
	for _, name := range legacyConstraints {
		if !db.Migrator().HasConstraint(tableModel, name) {
			continue
		}
		if err := db.Migrator().DropConstraint(tableModel, name); err != nil {
			return fmt.Errorf("删除旧外键约束 %s 失败: %w", name, err)
		}
	}

	return dropIndexesByPattern(db, newName, legacyIndexPattern)
}
