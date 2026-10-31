package database

import (
	"errors"
	"sort"

	"github.com/glebarez/sqlite"
	"golang.org/x/text/encoding/simplifiedchinese"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/database/migrations"
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

// models 当前数据库模型，顺序即建表顺序（被外键引用的表在前）
var models = []interface{}{
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
}

// AutoMigrate 自动创建/更新表结构：
// 先执行尚未应用的结构迁移，再把结构对齐到当前模型，最后跑一次性数据修复。
func AutoMigrate(db *DB) error {
	if err := migrations.Apply(db.DB, models...); err != nil {
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
