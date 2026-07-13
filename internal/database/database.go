package database

import (
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/model"
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
	return db.AutoMigrate(
		&model.ServerConfig{},
		&model.AuthToken{},
		&model.Device{},
		&model.Workspace{},
		&model.WorkspaceTab{},
		&model.SyncEvent{},
	)
}
