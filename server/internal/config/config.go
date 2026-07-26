package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Config 应用配置
type Config struct {
	// 服务端口
	Port string
	// 当前版本
	Version string
	// 数据目录（SQLite 数据库文件存放位置）
	DataDir string
	// 数据库文件路径
	DBPath string
	// JWT 签名密钥（启动时自动生成，首次设置后持久化到数据库）
	JWTSecret string
	// 日志级别：debug / info / warn / error
	LogLevel string
	// 日志输出：stdout 或文件路径
	LogOutput string
	// 允许的最小扩展版本
	MinExtVersion string
	// 允许的最大扩展版本
	MaxExtVersion string
	// 管理界面是否启用
	AdminEnabled bool
	// 是否为首次运行（未初始化）
	IsFirstRun bool
	// 织个网上游同步端点（预留）
	UpstreamURL string
	// 织个网上游同步 Token（预留）
	UpstreamToken string
	// 是否启用上游同步（预留）
	UpstreamSyncEnabled bool
}

// Load 加载配置（环境变量 + 默认值）
func Load() *Config {
	cfg := &Config{
		Port:                getEnv("PORT", "8080"),
		Version:             getEnv("SERVER_VERSION", "1.0.0"),
		DataDir:             getEnv("DATA_DIR", "./data"),
		JWTSecret:           getEnv("JWT_SECRET", generateRandomSecret()),
		LogLevel:            getEnv("LOG_LEVEL", "info"),
		LogOutput:           getEnv("LOG_OUTPUT", "stdout"),
		MinExtVersion:       getEnv("MIN_EXT_VERSION", "1.0.0"),
		MaxExtVersion:       getEnv("MAX_EXT_VERSION", "2.0.0"),
		AdminEnabled:        true,
		UpstreamURL:         getEnv("UPSTREAM_URL", ""),
		UpstreamToken:       getEnv("UPSTREAM_TOKEN", ""),
		UpstreamSyncEnabled: getEnvBool("UPSTREAM_SYNC_ENABLED"),
	}

	// 确保数据目录存在
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		panic("无法创建数据目录: " + err.Error())
	}

	cfg.DBPath = filepath.Join(cfg.DataDir, "tab-sync.db")

	// 检测是否为首次运行（数据库文件不存在）
	if _, err := os.Stat(cfg.DBPath); os.IsNotExist(err) {
		cfg.IsFirstRun = true
	}

	return cfg
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// getEnvBool 读取布尔型环境变量（默认 false）
func getEnvBool(key string) bool {
	val := os.Getenv(key)
	return val == "1" || val == "true" || val == "TRUE" || val == "yes" || val == "YES"
}

// getEnvInt 读取整数型环境变量
func getEnvInt(key string, defaultVal int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	n := 0
	fmt.Sscanf(val, "%d", &n)
	return n
}

// getEnvDuration 读取 Duration 型环境变量（如 "30s"、"5m"）
func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	d, err := time.ParseDuration(val)
	if err != nil {
		return defaultVal
	}
	return d
}

// generateRandomSecret 生成随机密钥（32 字节 hex）
// 在未设置 JWT_SECRET 环境变量时作为默认值
// 首次设置完成后，密钥会持久化到数据库
func generateRandomSecret() string {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		// 极端情况下回退到固定值（不应该发生）
		return "tab-sync-server-default-secret-change-me"
	}
	return hex.EncodeToString(raw)
}
