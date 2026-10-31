package migrations

import (
	"strings"

	"gorm.io/gorm"
)

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
