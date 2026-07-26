package model

import (
	"time"

	"gorm.io/gorm"
)

// ===================== 服务端配置 =====================

// ServerConfig 服务端配置（单例，仅一条记录）
type ServerConfig struct {
	ID            uint   `gorm:"primaryKey"`
	SetupDone     bool   `gorm:"default:false"` // 是否已完成初始化设置
	AdminUser     string `gorm:"default:admin"` // 管理员用户名
	AdminPassword string `gorm:"size:128"`      // 管理员密码哈希（SHA-256）
	JWTSecret     string `gorm:"size:128"`      // JWT 签名密钥（首次初始化时自动生成）
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ===================== 认证 Token =====================

// AuthToken 认证 Token（类似 API Key）
type AuthToken struct {
	ID        uint           `gorm:"primaryKey;autoIncrement" json:"-"`
	TokenID   string         `gorm:"uniqueIndex;size:64;not null" json:"tokenId"` // Token 唯一标识（UUID）
	Token     string         `gorm:"uniqueIndex;size:128;not null" json:"-"`      // 实际 Token 值（前缀 tbs_），不对外暴露
	Name      string         `gorm:"size:100" json:"name"`                        // Token 备注名称
	IsAdmin   bool           `gorm:"default:false" json:"isAdmin"`                // 是否为管理员 Token
	IsRevoked bool           `gorm:"default:false" json:"isRevoked"`              // 是否已吊销
	LastUsed  *time.Time     `json:"lastUsed"`                                    // 最后使用时间
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt,omitempty"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ===================== 设备 =====================

// Device 设备信息
type Device struct {
	ID        uint   `gorm:"primaryKey;autoIncrement"`
	DeviceID  string `gorm:"uniqueIndex;size:64;not null"` // 设备唯一标识（UUID）
	Name      string `gorm:"size:100"`
	Browser   string `gorm:"size:50"`
	OS        string `gorm:"size:50"`
	LastSeen  time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// ===================== 工作组 =====================

// Workspace 工作组
type Workspace struct {
	ID          uint   `gorm:"primaryKey;autoIncrement"`
	WorkspaceID string `gorm:"uniqueIndex;size:64;not null"` // 工作组 UUID
	ParentID    string `gorm:"index;size:64;default:''"`     // 父工作组 UUID（空表示根级），用于层级/树结构
	Name        string `gorm:"size:200;not null"`
	Color       string `gorm:"size:7;default:'#409EFF'"`
	Icon        string `gorm:"size:50"`
	SortOrder   int    `gorm:"default:0"` // 排序序号
	IsDeleted   bool   `gorm:"default:false"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   gorm.DeletedAt `gorm:"index"`
	// 关联
	Tabs []WorkspaceTab `gorm:"foreignKey:WorkspaceID;references:WorkspaceID"`
	Tags []WorkspaceTag `gorm:"foreignKey:WorkspaceID;references:WorkspaceID"`
}

// WorkspaceTab 工作组内标签页
// 标签页公开标识直接使用数据库自增主键 ID（字符串），不再额外维护 UUID 列
type WorkspaceTab struct {
	ID          uint   `gorm:"primaryKey;autoIncrement"`
	WorkspaceID string `gorm:"index;size:64;not null"` // 所属工作组 UUID
	URL         string `gorm:"size:2048;not null"`
	Title       string `gorm:"size:500"`
	FavIconURL  string `gorm:"size:2048"`
	SortOrder   int    `gorm:"default:0"` // 排序序号
	AddedAt     time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Tags        []TabTag `gorm:"foreignKey:WorkspaceTabID"`
}

// ===================== 同步事件（预留） =====================

// SyncEvent 同步事件记录
type SyncEvent struct {
	ID         uint       `gorm:"primaryKey;autoIncrement"`
	EventID    string     `gorm:"uniqueIndex;size:64;not null"` // 事件 UUID
	EventType  string     `gorm:"size:50;not null"`             // created / updated / removed
	EntityType string     `gorm:"size:50;not null"`             // workspace / tab / device
	EntityID   string     `gorm:"index;size:64"`                // 实体 UUID
	Payload    string     `gorm:"type:text"`                    // 变更数据 JSON
	Version    int64      `gorm:"default:0"`                    // 数据版本号（用于增量同步）
	SyncedAt   *time.Time // 已同步到上游的时间（nil 表示未同步）
	CreatedAt  time.Time
}

// ===================== 标签 =====================

// Tag 全局标签（不绑定设备，按 scope 区分用途）
type Tag struct {
	ID        uint      `gorm:"primaryKey;autoIncrement"`
	Name      string    `gorm:"size:32;not null;index"`
	Color     string    `gorm:"size:7"`
	Scope     string    `gorm:"size:8;index"`
	CreatedAt time.Time
}

// TabTag 标签页与标签的关联（关联 WorkspaceTab）
type TabTag struct {
	ID            uint   `gorm:"primaryKey;autoIncrement"`
	WorkspaceTabID uint  `gorm:"uniqueIndex:uniq_tab_tag;index"`
	WorkspaceID   string `gorm:"index;size:64"`
	TagID         uint   `gorm:"uniqueIndex:uniq_tab_tag;index"`
	Tag           Tag    `gorm:"foreignKey:TagID"`
}

// WorkspaceTag 工作组与标签的关联
type WorkspaceTag struct {
	ID          uint   `gorm:"primaryKey;autoIncrement"`
	WorkspaceID string `gorm:"uniqueIndex:uniq_ws_tag;index;size:64"`
	TagID       uint   `gorm:"uniqueIndex:uniq_ws_tag;index"`
	Tag         Tag    `gorm:"foreignKey:TagID"`
}
