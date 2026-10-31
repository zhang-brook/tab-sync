package migrations

import (
	"errors"

	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync/server/internal/model"
)

// migrationV1TabsRename 早期版本的表结构升级：
//   - workspace_tabs → tabs
//   - tab_tags.workspace_tab_id → tab_tags.tab_id
//   - 删除 tabs 上遗留的 tab_id（早期 UUID 标识）列及旧索引、旧外键约束
var migrationV1TabsRename = Migration{
	Version: 1,
	Name:    "tabs_rename",
	BeforeAutoMigrate: func(db *gorm.DB) error {
		if err := migrateLegacyTabTable(db); err != nil {
			return err
		}
		// 必须在 AutoMigrate 之前：删除列会重建整张表，连带丢掉刚创建的索引。
		if err := dropLegacyTabUUIDColumn(db); err != nil {
			return err
		}
		return dropLegacyTabTagConstraint(db)
	},
}

// migrateLegacyTabTable 把早期版本的表结构升级到当前命名：
//   - workspace_tabs → tabs
//   - tab_tags.workspace_tab_id → tab_tags.tab_id
//
// 仅当旧结构存在时执行，可重复调用。
func migrateLegacyTabTable(db *gorm.DB) error {
	if !tableExists(db, "workspace_tabs") && !columnExists(db, "tab_tags", "workspace_tab_id") {
		return nil
	}

	return db.Connection(func(tx *gorm.DB) error {
		// SQLite 默认不启用外键约束，此时重命名表不会改写 tab_tags 里
		// REFERENCES workspace_tabs 的定义，会留下指向已消失表的外键。
		// 迁移期间临时开启，结束后恢复默认的关闭状态。
		var fkEnabled int
		if err := tx.Raw("PRAGMA foreign_keys").Scan(&fkEnabled).Error; err != nil {
			return err
		}
		if fkEnabled == 0 {
			if err := tx.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
				return err
			}
			defer tx.Exec("PRAGMA foreign_keys = OFF")
		}

		if tableExists(tx, "workspace_tabs") {
			if tableExists(tx, "tabs") {
				// 半升级状态：新表已被 AutoMigrate 建出。空表直接丢弃，
				// 仍以旧表为准；新表已有数据时无法判断取舍，交由人工处理。
				var count int64
				if err := tx.Table("tabs").Count(&count).Error; err != nil {
					return err
				}
				if count > 0 {
					return errors.New("数据库中同时存在有数据的 workspace_tabs 与 tabs，请先人工确认保留哪一份")
				}
				if err := tx.Exec("DROP TABLE tabs").Error; err != nil {
					return err
				}
			}
			if err := tx.Exec("ALTER TABLE workspace_tabs RENAME TO tabs").Error; err != nil {
				return err
			}
		}
		if err := dropIndexesByPattern(tx, "tabs", "idx_workspace_tabs%"); err != nil {
			return err
		}

		if columnExists(tx, "tab_tags", "workspace_tab_id") {
			if !columnExists(tx, "tab_tags", "tab_id") {
				if err := tx.Exec("ALTER TABLE tab_tags RENAME COLUMN workspace_tab_id TO tab_id").Error; err != nil {
					return err
				}
			} else {
				// 半升级状态（新列已被 AutoMigrate 建出且为空）：先回填，
				// 再让 AutoMigrate 在 tab_id 上重建唯一索引。旧列不再删除，
				// 因为 SQLite 删除被外键引用的列需要重建整张表。
				if err := tx.Exec(`
					UPDATE tab_tags
					SET tab_id = workspace_tab_id
					WHERE tab_id IS NULL OR tab_id = 0`).Error; err != nil {
					return err
				}
				if err := tx.Exec("DROP INDEX IF EXISTS uniq_tab_tag").Error; err != nil {
					return err
				}
			}
			if err := dropIndexesByPattern(tx, "tab_tags", "idx_tab_tags_workspace_tab_id"); err != nil {
				return err
			}
		}

		return nil
	})
}

// dropLegacyTabUUIDColumn 删除早期版本在 tabs 表上留下的 tab_id 列及其唯一索引。
func dropLegacyTabUUIDColumn(db *gorm.DB) error {
	if !db.Migrator().HasColumn(&model.Tab{}, "tab_id") {
		return nil
	}
	if db.Migrator().HasIndex(&model.Tab{}, "ws_tab_unique") {
		if err := db.Migrator().DropIndex(&model.Tab{}, "ws_tab_unique"); err != nil {
			return err
		}
	}
	return db.Migrator().DropColumn(&model.Tab{}, "tab_id")
}

// dropLegacyTabTagConstraint 删除早期表名产生的外键约束，避免与新约束并存。
func dropLegacyTabTagConstraint(db *gorm.DB) error {
	const legacyName = "fk_workspace_tabs_tags"
	if !db.Migrator().HasConstraint(&model.TabTag{}, legacyName) {
		return nil
	}
	return db.Migrator().DropConstraint(&model.TabTag{}, legacyName)
}
