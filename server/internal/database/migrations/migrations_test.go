package migrations

import (
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// testWidget 用于验证迁移执行器的最小模型
type testWidget struct {
	ID   uint `gorm:"primaryKey;autoIncrement"`
	Name string
}

func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("打开内存数据库失败: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("获取连接池失败: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	return db
}

func countRecords(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&Record{}).Count(&count).Error; err != nil {
		t.Fatalf("统计迁移记录失败: %v", err)
	}
	return count
}

// 全新数据库直接按当前模型建表并登记全部版本，迁移钩子不执行。
func TestApplyFreshDatabase(t *testing.T) {
	db := openTestDB(t)
	var calls []string
	list := []Migration{
		{
			Version: 1,
			Name:    "init",
			BeforeAutoMigrate: func(*gorm.DB) error {
				calls = append(calls, "before")
				return nil
			},
			AfterAutoMigrate: func(*gorm.DB) error {
				calls = append(calls, "after")
				return nil
			},
		},
	}

	if err := apply(db, list, &testWidget{}); err != nil {
		t.Fatalf("首次迁移失败: %v", err)
	}
	if !db.Migrator().HasTable(&testWidget{}) {
		t.Error("全新库未按模型建表")
	}
	if got := countRecords(t, db); got != 1 {
		t.Fatalf("迁移记录数不匹配: got %d, want 1", got)
	}
	if len(calls) != 0 {
		t.Errorf("全新库不应执行迁移钩子: %v", calls)
	}

	if err := apply(db, list, &testWidget{}); err != nil {
		t.Fatalf("重复迁移不应报错: %v", err)
	}
	if got := countRecords(t, db); got != 1 {
		t.Errorf("重复迁移不应重复登记版本: got %d, want 1", got)
	}
	if len(calls) != 0 {
		t.Errorf("重复迁移不应执行钩子: %v", calls)
	}
}

// 已有旧结构的数据库先执行前置钩子、再 AutoMigrate、最后执行后置钩子，
// 完成后登记版本；再次执行不再触发钩子。
func TestApplyPendingMigrations(t *testing.T) {
	db := openTestDB(t)
	if err := db.Exec("CREATE TABLE `test_widgets` (`id` integer PRIMARY KEY AUTOINCREMENT, `legacy_name` text)").Error; err != nil {
		t.Fatalf("创建旧表失败: %v", err)
	}
	if err := db.Exec("INSERT INTO `test_widgets` (`legacy_name`) VALUES ('alpha')").Error; err != nil {
		t.Fatalf("写入旧数据失败: %v", err)
	}

	var calls []string
	list := []Migration{
		{
			Version: 1,
			Name:    "rename_legacy_column",
			BeforeAutoMigrate: func(tx *gorm.DB) error {
				calls = append(calls, "before")
				if !columnExists(tx, "test_widgets", "legacy_name") {
					return nil
				}
				return tx.Exec("ALTER TABLE `test_widgets` RENAME COLUMN `legacy_name` TO `name`").Error
			},
			AfterAutoMigrate: func(tx *gorm.DB) error {
				calls = append(calls, "after")
				return tx.Exec("UPDATE `test_widgets` SET `name` = 'beta'").Error
			},
		},
	}

	if err := apply(db, list, &testWidget{}); err != nil {
		t.Fatalf("迁移旧结构失败: %v", err)
	}
	if strings.Join(calls, ",") != "before,after" {
		t.Errorf("钩子执行顺序不匹配: %v", calls)
	}

	var widget testWidget
	if err := db.First(&widget).Error; err != nil {
		t.Fatalf("查询迁移后数据失败: %v", err)
	}
	if widget.Name != "beta" {
		t.Errorf("后置钩子未生效: %q", widget.Name)
	}
	if got := countRecords(t, db); got != 1 {
		t.Errorf("迁移记录数不匹配: got %d, want 1", got)
	}

	if err := apply(db, list, &testWidget{}); err != nil {
		t.Fatalf("重复迁移不应报错: %v", err)
	}
	if strings.Join(calls, ",") != "before,after" {
		t.Errorf("已应用迁移不应再次执行钩子: %v", calls)
	}
}

// 数据库记录的版本高于程序支持的最高版本时拒绝启动，避免旧程序破坏新结构。
func TestApplyVersionAhead(t *testing.T) {
	db := openTestDB(t)
	if err := db.AutoMigrate(&Record{}); err != nil {
		t.Fatalf("创建迁移记录表失败: %v", err)
	}
	if err := db.Create(&Record{Version: 2, Name: "future"}).Error; err != nil {
		t.Fatalf("写入未来版本记录失败: %v", err)
	}

	list := []Migration{{Version: 1, Name: "init"}}
	err := apply(db, list, &testWidget{})
	if err == nil || !strings.Contains(err.Error(), "高于当前程序支持") {
		t.Fatalf("版本超前时应报错: %v", err)
	}
}

// 缺失中间版本时不补跑旧迁移，避免在更新的结构上执行过时的前置步骤。
func TestApplyMissingVersion(t *testing.T) {
	db := openTestDB(t)
	if err := db.AutoMigrate(&Record{}); err != nil {
		t.Fatalf("创建迁移记录表失败: %v", err)
	}
	if err := db.Create(&Record{Version: 2, Name: "second"}).Error; err != nil {
		t.Fatalf("写入版本记录失败: %v", err)
	}

	list := []Migration{
		{Version: 1, Name: "first"},
		{Version: 2, Name: "second"},
	}
	err := apply(db, list, &testWidget{})
	if err == nil || !strings.Contains(err.Error(), "不连续") {
		t.Fatalf("版本缺失时应报错: %v", err)
	}
}
