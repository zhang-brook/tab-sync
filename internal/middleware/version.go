package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// VersionCheck 版本协商中间件
// 扩展应在请求头中携带 X-Ext-Version，服务端检查兼容性
func VersionCheck(serverVersion string) gin.HandlerFunc {
	return func(c *gin.Context) {
		extVersion := c.GetHeader("X-Ext-Version")
		if extVersion == "" {
			// 不强制要求版本头，兼容旧版扩展
			c.Next()
			return
		}

		// 版本比较（简易语义版本比较）
		extParts := parseSemVer(extVersion)

		// 如果扩展版本过低（major.minor 低于最低要求），返回 426 Upgrade Required
		// 暂时硬编码最低要求为 1.0.0
		minMajor, minMinor := 1, 0
		if extParts[0] < minMajor || (extParts[0] == minMajor && extParts[1] < minMinor) {
			c.JSON(http.StatusUpgradeRequired, gin.H{
				"code":             426,
				"success":          false,
				"message":          "浏览器扩展版本过低，请升级扩展",
				"min_ext_version":  "1.0.0",
				"server_version":   serverVersion,
			})
			c.Abort()
			return
		}

		c.Next()
	}
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
