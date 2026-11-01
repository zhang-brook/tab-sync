// Package urlx 提供 URL 解析相关的公共工具。
package urlx

import (
	"net/url"
	"strings"
)

// HostOf 提取 URL 的主机名：小写、去掉端口与末尾的点。
// 无法解析或没有主机名（如 about:blank、chrome:// 页面）时返回空字符串。
func HostOf(rawURL string) string {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Host == "" {
		return ""
	}
	return strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
}
