package handler

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/database"
	"github.com/spidermemos/tab-sync-server/internal/service"
)

// setupTestRouter 创建测试用路由和依赖
func setupTestRouter(t *testing.T) (*gin.Engine, *service.Services, func()) {
	t.Helper()

	gin.SetMode(gin.TestMode)

	tmpFile, err := os.CreateTemp("", "tab-sync-api-test-*.db")
	if err != nil {
		t.Fatalf("创建临时数据库文件失败: %v", err)
	}

	cleanup := func() {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
	}

	cfg := &config.Config{
		DBPath:        tmpFile.Name(),
		JWTSecret:     "api-test-secret-key",
		Version:       "1.0.0-test",
		MinExtVersion: "1.0.0",
		MaxExtVersion: "2.0.0",
		Port:          "0",
	}

	db, err := database.Init(cfg)
	if err != nil {
		t.Fatalf("初始化数据库失败: %v", err)
	}
	if err := database.AutoMigrate(db); err != nil {
		t.Fatalf("数据库迁移失败: %v", err)
	}

	services := service.NewServices(db, cfg)
	handlers := NewHandlers(services)

	r := gin.New()
	r.Use(gin.Recovery())

	// 注册路由（与 main.go 保持一致）
	r.POST("/api/setup", handlers.Setup.CompleteSetup)
	r.GET("/api/setup/status", handlers.Setup.GetSetupStatus)
	r.POST("/api/admin/login", handlers.Setup.AdminLogin)

	v1 := r.Group("/v1/tab-sync")
	{
		v1.GET("/version", handlers.System.GetVersion)
		v1.POST("/auth/verify-token", handlers.Auth.VerifyToken)

		auth := v1.Group("")
		auth.Use(func(c *gin.Context) {
			// 简化认证：直接设置上下文
			c.Set("token_id", "test-token")
			c.Next()
		})
		{
			auth.POST("/devices/register", handlers.Device.Register)
			auth.GET("/devices", handlers.Device.List)
			auth.POST("/devices/:deviceId/heartbeat", handlers.Device.Heartbeat)

			auth.GET("/workspaces", handlers.Workspace.List)
			auth.POST("/workspaces", handlers.Workspace.Create)
		}
	}

	return r, services, cleanup
}

func parseCommonReturn(t *testing.T, body []byte) CommonReturn {
	t.Helper()
	var cr CommonReturn
	if err := json.Unmarshal(body, &cr); err != nil {
		t.Fatalf("解析 CommonReturn 失败: %v", err)
	}
	return cr
}

// ========== 系统接口测试 ==========

func TestAPI_GetVersion(t *testing.T) {
	r, _, cleanup := setupTestRouter(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/v1/tab-sync/version", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("状态码不匹配: got %d, want 200", w.Code)
	}

	cr := parseCommonReturn(t, w.Body.Bytes())
	if !cr.Success {
		t.Error("响应 Success 应为 true")
	}

	data, ok := cr.Data.(map[string]interface{})
	if !ok {
		t.Fatal("响应 Data 格式不正确")
	}
	if data["api_version"] != "v1" {
		t.Errorf("api_version 不匹配: got %v", data["api_version"])
	}
}

func TestAPI_GetSetupStatus_NotSetup(t *testing.T) {
	r, _, cleanup := setupTestRouter(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/api/setup/status", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	cr := parseCommonReturn(t, w.Body.Bytes())
	data := cr.Data.(map[string]interface{})
	if data["setupDone"] != false {
		t.Error("未初始化时 setupDone 应为 false")
	}
}

// ========== 初始化流程测试 ==========

func TestAPI_CompleteSetup(t *testing.T) {
	r, _, cleanup := setupTestRouter(t)
	defer cleanup()

	// 执行初始化
	body := `{"adminPassword": "test123456"}`
	req := httptest.NewRequest("POST", "/api/setup", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 201 {
		t.Errorf("初始化状态码不匹配: got %d, want 201", w.Code)
	}

	cr := parseCommonReturn(t, w.Body.Bytes())
	data := cr.Data.(map[string]interface{})
	if data["adminToken"] == nil || data["adminToken"] == "" {
		t.Error("初始化后应返回 adminToken")
	}
	if data["jwt"] == nil || data["jwt"] == "" {
		t.Error("初始化后应返回 jwt")
	}

	// 重复初始化应失败
	req2 := httptest.NewRequest("POST", "/api/setup", bytes.NewBufferString(body))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != 400 {
		t.Errorf("重复初始化状态码应为 400: got %d", w2.Code)
	}

	// 初始化后 setupDone 应为 true
	req3 := httptest.NewRequest("GET", "/api/setup/status", nil)
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	cr3 := parseCommonReturn(t, w3.Body.Bytes())
	data3 := cr3.Data.(map[string]interface{})
	if data3["setupDone"] != true {
		t.Error("初始化后 setupDone 应为 true")
	}
}

func TestAPI_AdminLogin(t *testing.T) {
	r, _, cleanup := setupTestRouter(t)
	defer cleanup()

	// 先初始化
	body := `{"adminPassword": "admin123"}`
	req := httptest.NewRequest("POST", "/api/setup", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// 正确密码登录
	loginBody := `{"password": "admin123"}`
	req2 := httptest.NewRequest("POST", "/api/admin/login", bytes.NewBufferString(loginBody))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != 200 {
		t.Errorf("登录状态码不匹配: got %d, want 200", w2.Code)
	}

	// 错误密码登录
	badLogin := `{"password": "wrong"}`
	req3 := httptest.NewRequest("POST", "/api/admin/login", bytes.NewBufferString(badLogin))
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)

	if w3.Code != 401 {
		t.Errorf("错误密码状态码应为 401: got %d", w3.Code)
	}
}

// ========== 设备接口测试 ==========

func TestAPI_RegisterDevice(t *testing.T) {
	r, _, cleanup := setupTestRouter(t)
	defer cleanup()

	body := `{"deviceId":"test-device-001","name":"Chrome","browser":"Chrome 120","os":"Windows"}`
	req := httptest.NewRequest("POST", "/v1/tab-sync/devices/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 201 {
		t.Errorf("注册设备状态码不匹配: got %d, want 201", w.Code)
	}

	// 验证列表
	req2 := httptest.NewRequest("GET", "/v1/tab-sync/devices", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	cr2 := parseCommonReturn(t, w2.Body.Bytes())
	data2 := cr2.Data.(map[string]interface{})
	devices := data2["devices"].([]interface{})
	if len(devices) != 1 {
		t.Errorf("设备列表数量不匹配: got %d, want 1", len(devices))
	}
}

// ========== 工作组接口测试 ==========

func TestAPI_CreateWorkspace(t *testing.T) {
	r, _, cleanup := setupTestRouter(t)
	defer cleanup()

	body := `{
		"name": "测试工作组",
		"color": "#409EFF",
		"tabs": [
			{"url": "https://example.com", "title": "Example"},
			{"url": "https://test.com", "title": "Test"}
		]
	}`
	req := httptest.NewRequest("POST", "/v1/tab-sync/workspaces", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 201 {
		t.Errorf("创建工作组状态码不匹配: got %d, want 201, body=%s", w.Code, w.Body.String())
	}

	cr := parseCommonReturn(t, w.Body.Bytes())
	data := cr.Data.(map[string]interface{})
	ws := data["workspace"].(map[string]interface{})
	if ws["name"] != "测试工作组" {
		t.Errorf("工作组名称不匹配: got %v", ws["name"])
	}
}
