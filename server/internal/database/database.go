package database

import (
	"errors"
	"sort"
	"strings"

	"github.com/glebarez/sqlite"
	"golang.org/x/text/encoding/simplifiedchinese"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/model"
)

// DB 数据库连接（接口类型，方便未来切换数据源）
// 当前使用 SQLite，未来可切换为 PostgreSQL/MySQL
// 只需修改 Init 函数中的驱动和 DSN 即可
type DB struct {
	*gorm.DB
}

// Init 初始化数据库连接
func Init(cfg *config.Config) (*DB, error) {
	db, err := gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	// SQLite 性能优化
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1) // SQLite 单写模式
	sqlDB.SetMaxIdleConns(1)

	return &DB{DB: db}, nil
}

// AutoMigrate 自动创建/更新表结构
func AutoMigrate(db *DB) error {
	// 必须在 AutoMigrate 之前执行：GORM 会按新模型直接创建 tabs 表，
	// 先建后改会导致旧表数据与新表并存。
	if err := migrateLegacyTabTable(db); err != nil {
		return err
	}

	// 清理历史遗留的 tab_id 列与唯一索引（早期版本用 UUID 作为标签页标识）。
	// 不处理会导致所有新标签页的 tab_id 为空字符串，触发唯一约束冲突（每组仅允许一个 tab）。
	// 必须放在 AutoMigrate 之前：删除列会重建整张表，连带丢掉本次刚创建的索引。
	if err := dropLegacyTabUUIDColumn(db); err != nil {
		return err
	}

	// 旧表名留下的外键约束名不会随表重命名变化，删除后由 AutoMigrate 按新模型重建。
	if err := dropLegacyTabTagConstraint(db); err != nil {
		return err
	}

	if err := db.AutoMigrate(
		&model.ServerConfig{},
		&model.SchemaMeta{},
		&model.AuthToken{},
		&model.Device{},
		&model.Workspace{},
		&model.Tab{},
		&model.SyncEvent{},
		&model.Tag{},
		&model.TabTag{},
		&model.WorkspaceTag{},
		&model.RecycleBinTab{},
	); err != nil {
		return err
	}

	if err := InitWorkspaceSortOrder(db); err != nil {
		return err
	}

	if err := FixTabTagWorkspaceID(db); err != nil {
		return err
	}

	if err := CleanupOrphanTagAssociations(db); err != nil {
		return err
	}

	return nil
}

// migrateLegacyTabTable 把早期版本的表结构升级到当前命名：
//   - workspace_tabs → tabs
//   - tab_tags.workspace_tab_id → tab_tags.tab_id
//
// 仅当旧结构存在时执行，可重复调用。
func migrateLegacyTabTable(db *DB) error {
	if !tableExists(db.DB, "workspace_tabs") && !columnExists(db.DB, "tab_tags", "workspace_tab_id") {
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
func dropLegacyTabUUIDColumn(db *DB) error {
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
func dropLegacyTabTagConstraint(db *DB) error {
	const legacyName = "fk_workspace_tabs_tags"
	if !db.Migrator().HasConstraint(&model.TabTag{}, legacyName) {
		return nil
	}
	return db.Migrator().DropConstraint(&model.TabTag{}, legacyName)
}

// tableExists 判断表是否存在（SQLite）
func tableExists(db *gorm.DB, table string) bool {
	var count int64
	db.Raw("SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?", table).Scan(&count)
	return count > 0
}

// columnExists 判断列是否存在（SQLite）
func columnExists(db *gorm.DB, table, column string) bool {
	var count int64
	db.Raw("SELECT count(*) FROM pragma_table_info("+quoteIdentifier(table)+") WHERE name = ?", column).Scan(&count)
	return count > 0
}

// dropIndexesByPattern 删除指定表上名称匹配 pattern 的索引。
// 表重命名不会同步修改索引名，旧索引会与新模型生成的索引并存，需要清理。
func dropIndexesByPattern(db *gorm.DB, table, pattern string) error {
	var names []string
	if err := db.Raw(
		"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name LIKE ?",
		table, pattern,
	).Scan(&names).Error; err != nil {
		return err
	}
	for _, name := range names {
		if err := db.Exec("DROP INDEX IF EXISTS " + quoteIdentifier(name)).Error; err != nil {
			return err
		}
	}
	return nil
}

func quoteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// workspaceSortOrderMetaKey 标记「工作组 sort_order 初始化」已完成，只需执行一次
const workspaceSortOrderMetaKey = "workspace_sort_order_v1"

// InitWorkspaceSortOrder 一次性初始化存量工作组的 sort_order。
//
// 背景：sort_order 字段早期就存在，但从未被写入，所有存量数据的该字段恒为 0。
// 开启「工作组树拖拽排序」后，同级之间必须有确定且稠密的序号，否则排序无从谈起。
//
// 初始化顺序按名称（中文按 GB18030 编码，其一级汉字按拼音排列，可贴近前端
// localeCompare('zh-Hans-CN') 的效果），与开启拖拽排序前前端的展示顺序基本一致。
//
// 仅在首次执行（标记不存在）时运行，避免覆盖用户之后的手动排序。
func InitWorkspaceSortOrder(db *DB) error {
	var meta model.SchemaMeta
	err := db.Where("meta_key = ?", workspaceSortOrderMetaKey).First(&meta).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	var workspaces []model.Workspace
	if err := db.Where("is_deleted = ?", false).
		Select("workspace_id", "parent_id", "name", "created_at").
		Find(&workspaces).Error; err != nil {
		return err
	}

	childrenOf := make(map[string][]model.Workspace)
	for _, w := range workspaces {
		childrenOf[w.ParentID] = append(childrenOf[w.ParentID], w)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		// 系统工作组（如「未分组」）固定置顶展示，与同级普通工作组一同编号即可，
		// 编号只表达相对顺序，置顶由前端按 isSystem 决定。
		for _, siblings := range childrenOf {
			sort.SliceStable(siblings, func(i, j int) bool {
				if ki, kj := nameSortKey(siblings[i].Name), nameSortKey(siblings[j].Name); ki != kj {
					return ki < kj
				}
				return siblings[i].CreatedAt.Before(siblings[j].CreatedAt)
			})
			for i, w := range siblings {
				if err := tx.Model(&model.Workspace{}).
					Where("workspace_id = ?", w.WorkspaceID).
					Update("sort_order", i).Error; err != nil {
					return err
				}
			}
		}
		return tx.Create(&model.SchemaMeta{MetaKey: workspaceSortOrderMetaKey, MetaValue: "done"}).Error
	})
}

// nameSortKey 生成名称的排序键：优先返回 GB18030 编码后的字节串。
// GB18030 的一级汉字按拼音排列，用它比较可让中文名称的初始化顺序贴近前端的拼音序；
// 无法编码时（如含超出生僻字范围的字符）回退为原始名称。
func nameSortKey(name string) string {
	if b, err := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(name)); err == nil {
		return string(b)
	}
	return name
}

// tabTagWorkspaceIDMetaKey 标记「修复 tab_tags.workspace_id」已完成，只需执行一次
const tabTagWorkspaceIDMetaKey = "tab_tag_workspace_id_fix_v1"

// FixTabTagWorkspaceID 一次性修复存量 tab_tags.workspace_id 与实际归属不一致的数据。
//
// 背景：早期 MoveTab 只更新 tabs.workspace_id，未同步 tab_tags.workspace_id，
// 导致标签页被移动后其标签关联仍指向旧工作组，进而引发：
//   - RemoveFromTab 按「标签页 + 工作组」删除时找不到行（在新工作组下去不掉标签）；
//   - GetTabsByTag 按 tab_tags.workspace_id 联查工作组时显示在旧工作组下，
//     旧工作组被删除后该标签页还会在标签视图中直接丢失。
//
// 修复以 tabs 表为唯一权威，将每行 tab_tags 的 workspace_id 校正为
// 对应标签页的实际归属；只更新确实不一致的行，避免全表写入。
// 仅在首次执行（标记不存在）时运行。
func FixTabTagWorkspaceID(db *DB) error {
	var meta model.SchemaMeta
	err := db.Where("meta_key = ?", tabTagWorkspaceIDMetaKey).First(&meta).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return db.Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(`
			UPDATE tab_tags
			SET workspace_id = (
				SELECT tabs.workspace_id
				FROM tabs
				WHERE tabs.id = tab_tags.tab_id
			)
			WHERE EXISTS (
				SELECT 1
				FROM tabs
				WHERE tabs.id = tab_tags.tab_id
				  AND tabs.workspace_id <> tab_tags.workspace_id
			)`)
		if res.Error != nil {
			return res.Error
		}
		return tx.Create(&model.SchemaMeta{MetaKey: tabTagWorkspaceIDMetaKey, MetaValue: "done"}).Error
	})
}

// tagAssociationCleanupMetaKey 标记「清理孤儿标签关联」已完成，只需执行一次
const tagAssociationCleanupMetaKey = "tag_association_cleanup_v1"

// CleanupOrphanTagAssociations 一次性清理指向已不存在标签页/工作组的标签关联。
//
// 背景：早期删除工作组内标签页时（整组更新时移除、单页删除、删除工作组）只删除了
// tabs，未同步删除 tab_tags / workspace_tags，留下孤儿关联。标签列表按
// tab_tags 计数会显示非 0，按标签联查标签页时却 JOIN 不到任何行，出现
// 「计数 2 却提示暂无标签页」的不一致。
func CleanupOrphanTagAssociations(db *DB) error {
	var meta model.SchemaMeta
	err := db.Where("meta_key = ?", tagAssociationCleanupMetaKey).First(&meta).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return db.Transaction(func(tx *gorm.DB) error {
		// 关联只保留「标签页仍存在且所属工作组未删除」的行
		if err := tx.Exec(`
			DELETE FROM tab_tags
			WHERE tab_id NOT IN (
				SELECT tabs.id
				FROM tabs
				JOIN workspaces ON workspaces.workspace_id = tabs.workspace_id
				WHERE workspaces.is_deleted = 0
			)`).Error; err != nil {
			return err
		}
		// 工作组标签关联只保留未删除的工作组
		if err := tx.Exec(`
			DELETE FROM workspace_tags
			WHERE workspace_id NOT IN (
				SELECT workspace_id FROM workspaces WHERE is_deleted = 0
			)`).Error; err != nil {
			return err
		}
		return tx.Create(&model.SchemaMeta{MetaKey: tagAssociationCleanupMetaKey, MetaValue: "done"}).Error
	})
}
