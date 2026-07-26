package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// VersionCheck 版本协商中间件
// 扩展应在请求头中携带 X-Ext-Version，服务端检查兼容性
func VersionCheck(serverVersion, minExtVersion, maxExtVersion string) gin.HandlerFunc {
	return func(c *gin.Context) {
		extVersion := c.GetHeader("X-Ext-Version")
		if extVersion == "" {
			// 不强制要求版本头，兼容旧版扩展
			c.Next()
			return
		}

		// 版本比较（简易语义版本比较）
		extParts := parseSemVer(extVersion)
		minParts := parseSemVer(minExtVersion)
		maxParts := parseSemVer(maxExtVersion)

		// 低于最低版本要求 → 426 Upgrade Required
		if compareSemVer(extParts, minParts) < 0 {
			c.JSON(http.StatusUpgradeRequired, gin.H{
				"code":             426,
				"success":          false,
				"message":          "浏览器扩展版本过低，请升级扩展",
				"min_ext_version":  minExtVersion,
				"server_version":   serverVersion,
			})
			c.Abort()
			return
		}

		// 高于最高版本 → 也拒绝（扩展版本太新，后端可能不兼容）
		if compareSemVer(extParts, maxParts) > 0 {
			c.JSON(http.StatusUpgradeRequired, gin.H{
				"code":             426,
				"success":          false,
				"message":          "浏览器扩展版本过高，后端不支持此版本",
				"max_ext_version":  maxExtVersion,
				"server_version":   serverVersion,
			})
			c.Abort()
			return
		}

		// 在兼容范围内，注入版本信息到上下文
		c.Set("ext_version", extVersion)
		c.Next()
	}
}

// compareSemVer 比较两个语义版本号，返回 -1/0/1
func compareSemVer(a, b [3]int) int {
	for i := 0; i < 3; i++ {
		if a[i] < b[i] {
			return -1
		}
		if a[i] > b[i] {
			return 1
		}
	}
	return 0
}

// parseSemVer 解析语义版本号，返回 [major, minor, patch]
func parseSemVer(v string) [3]int {
	var parts [3]int
	segments := strings.Split(strings.TrimPrefix(v, "v"), ".")
	for i, s := range segments {
		if i >= 3 {
			break
		}
		n, _ := strconv.Atoi(s)
		parts[i] = n
	}
	return parts
}
