// Package migrations 按版本顺序执行数据库结构迁移。
//
// 每个迁移定义在独立文件中并登记到 registry。服务启动时读取 schema_migrations
// 中已应用的版本号，只执行尚未应用的迁移：
//
//  1. 依次执行待应用迁移的 BeforeAutoMigrate：旧表/旧列改名、删除会与
//     AutoMigrate 冲突的旧索引与约束等 GORM 无法自动推断的准备工作；
//  2. 统一执行一次 AutoMigrate，把结构对齐到当前模型；
//  3. 依次执行待应用迁移的 AfterAutoMigrate（依赖新结构的数据转换），
//     每完成一个迁移立即记录版本号。
//
// 全新数据库没有历史结构可迁移，直接按当前模型建表并登记全部版本。
package migrations

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Migration 一次结构迁移。
// 版本号从 1 开始严格递增，已发布的迁移只能追加，不可修改或删除。
type Migration struct {
	Version int
	Name    string
	// BeforeAutoMigrate 在 AutoMigrate 之前执行，必须可重复执行。
	BeforeAutoMigrate func(db *gorm.DB) error
	// AfterAutoMigrate 在 AutoMigrate 之后执行，必须可重复执行。
	AfterAutoMigrate func(db *gorm.DB) error
}

// Record schema_migrations 中的一条已应用记录
type Record struct {
	Version   int       `gorm:"primaryKey;autoIncrement:false"`
	Name      string    `gorm:"size:128;not null"`
	AppliedAt time.Time `gorm:"not null"`
}

// TableName 固定表名
func (Record) TableName() string { return "schema_migrations" }

// All 返回按版本升序排列的全部迁移。
func All() []Migration {
	return []Migration{
		migrationV1TabsRename,
	}
}

// Apply 执行所有尚未应用的结构迁移。
// models 为当前完整模型列表，迁移完成后数据库结构与之一致。
func Apply(db *gorm.DB, models ...interface{}) error {
	return apply(db, All(), models...)
}

func apply(db *gorm.DB, list []Migration, models ...interface{}) error {
	if err := validate(list); err != nil {
		return err
	}

	fresh := isFreshDatabase(db, models)

	if err := db.AutoMigrate(&Record{}); err != nil {
		return err
	}

	var applied []Record
	if err := db.Order("version").Find(&applied).Error; err != nil {
		return err
	}
	appliedVersions := make(map[int]bool, len(applied))
	maxApplied := 0
	for _, r := range applied {
		appliedVersions[r.Version] = true
		if r.Version > maxApplied {
			maxApplied = r.Version
		}
	}
	// 已有版本记录说明库不是全新初始化，即使业务表缺失也按升级流程处理。
	if len(applied) > 0 {
		fresh = false
	}

	latest := list[len(list)-1].Version
	if maxApplied > latest {
		return fmt.Errorf("数据库结构版本 %d 高于当前程序支持的 %d，请升级服务端", maxApplied, latest)
	}

	if fresh {
		if err := db.AutoMigrate(models...); err != nil {
			return err
		}
		return stampAll(db, list)
	}

	var pending []Migration
	for _, m := range list {
		if appliedVersions[m.Version] {
			continue
		}
		// 已应用的版本不连续时，缺失的旧迁移不能再补跑：其前置假定已不成立。
		if m.Version < maxApplied {
			return fmt.Errorf("数据库结构迁移记录不连续，缺少版本 %d", m.Version)
		}
		pending = append(pending, m)
	}
	if len(pending) == 0 {
		return nil
	}

	for _, m := range pending {
		if m.BeforeAutoMigrate == nil {
			continue
		}
		if err := m.BeforeAutoMigrate(db); err != nil {
			return fmt.Errorf("结构迁移 v%d(%s) 前置步骤失败: %w", m.Version, m.Name, err)
		}
	}

	if err := db.AutoMigrate(models...); err != nil {
		return err
	}

	for _, m := range pending {
		if m.AfterAutoMigrate != nil {
			if err := m.AfterAutoMigrate(db); err != nil {
				return fmt.Errorf("结构迁移 v%d(%s) 后置步骤失败: %w", m.Version, m.Name, err)
			}
		}
		if err := db.Create(&Record{Version: m.Version, Name: m.Name, AppliedAt: time.Now()}).Error; err != nil {
			return fmt.Errorf("记录结构迁移 v%d(%s) 失败: %w", m.Version, m.Name, err)
		}
	}
	return nil
}

func validate(list []Migration) error {
	if len(list) == 0 {
		return fmt.Errorf("迁移列表为空")
	}
	for i, m := range list {
		if m.Version != i+1 {
			return fmt.Errorf("迁移版本号必须从 1 开始连续递增，第 %d 项版本为 %d", i+1, m.Version)
		}
		if m.Name == "" {
			return fmt.Errorf("迁移 v%d 缺少名称", m.Version)
		}
	}
	return nil
}

func stampAll(db *gorm.DB, list []Migration) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, m := range list {
			if err := tx.Create(&Record{Version: m.Version, Name: m.Name, AppliedAt: time.Now()}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// isFreshDatabase 判断数据库是否还没有任何业务表（首次启动）。
func isFreshDatabase(db *gorm.DB, models []interface{}) bool {
	for _, m := range models {
		if db.Migrator().HasTable(m) {
			return false
		}
	}
	return true
}
