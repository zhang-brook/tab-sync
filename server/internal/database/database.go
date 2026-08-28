package database

import (
	"errors"
	"sort"

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
	if err := db.AutoMigrate(
		&model.ServerConfig{},
		&model.SchemaMeta{},
		&model.AuthToken{},
		&model.Device{},
		&model.Workspace{},
		&model.WorkspaceTab{},
		&model.SyncEvent{},
		&model.Tag{},
		&model.TabTag{},
		&model.WorkspaceTag{},
		&model.RecycleBinTab{},
	); err != nil {
		return err
	}

	// 清理历史遗留的 tab_id 列与唯一索引（早期版本用 UUID 作为标签页标识）。
	// 不处理会导致所有新标签页的 tab_id 为空字符串，触发唯一约束冲突（每组仅允许一个 tab）。
	if db.Migrator().HasColumn(&model.WorkspaceTab{}, "tab_id") {
		if db.Migrator().HasIndex(&model.WorkspaceTab{}, "ws_tab_unique") {
			if err := db.Migrator().DropIndex(&model.WorkspaceTab{}, "ws_tab_unique"); err != nil {
				return err
			}
		}
		if err := db.Migrator().DropColumn(&model.WorkspaceTab{}, "tab_id"); err != nil {
			return err
		}
	}

	if err := InitWorkspaceSortOrder(db); err != nil {
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
