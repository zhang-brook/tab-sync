package migrations

import (
	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync/server/internal/model"
	"github.com/spidermemos/tab-sync/server/internal/urlx"
)

// migrationV3TabHost 为 tabs 增加 host 列并回填存量数据。
// 新增列由 AutoMigrate 建出，这里只负责按 URL 解析补齐历史行；
// 回填使用 UpdateColumn，避免改动 updated_at（修改时间）。
var migrationV3TabHost = Migration{
	Version: 3,
	Name:    "tab_host",
	AfterAutoMigrate: func(db *gorm.DB) error {
		return backfillTabHosts(db)
	},
}

// backfillTabHosts 为 host 为空的历史标签页补上主机名，可重复执行。
func backfillTabHosts(db *gorm.DB) error {
	var tabs []struct {
		ID  uint
		URL string
	}
	if err := db.Model(&model.Tab{}).
		Select("id", "url").
		Where("host IS NULL OR host = ''").
		Find(&tabs).Error; err != nil {
		return err
	}
	for _, tab := range tabs {
		host := urlx.HostOf(tab.URL)
		if host == "" {
			continue
		}
		if err := db.Model(&model.Tab{}).
			Where("id = ?", tab.ID).
			UpdateColumn("host", host).Error; err != nil {
			return err
		}
	}
	return nil
}
