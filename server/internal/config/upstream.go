package config

import "time"

// UpstreamConfig 上游同步配置（织个网对接预留）
// 从环境变量中读取，用于配置与织个网云端的同步行为。
type UpstreamConfig struct {
	// 是否启用上游同步
	Enabled bool
	// 织个网 API 端点
	URL string
	// 织个网认证 Token
	Token string
	// 重试间隔（默认 30s）
	RetryInterval time.Duration
	// 每次推送的最大事件数（默认 100）
	BatchSize int
}

// GetUpstreamConfig 从 Config 中提取上游同步配置
func (c *Config) GetUpstreamConfig() UpstreamConfig {
	cfg := UpstreamConfig{
		Enabled:       c.UpstreamSyncEnabled,
		URL:           c.UpstreamURL,
		Token:         c.UpstreamToken,
		RetryInterval: 30 * time.Second,
		BatchSize:     100,
	}

	// 允许通过环境变量覆盖默认值
	if v := getEnvDuration("UPSTREAM_RETRY_INTERVAL", 30*time.Second); v > 0 {
		cfg.RetryInterval = v
	}
	if v := getEnvInt("UPSTREAM_BATCH_SIZE", 100); v > 0 {
		cfg.BatchSize = v
	}

	return cfg
}
