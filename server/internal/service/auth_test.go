package service

import (
	"os"
	"strings"
	"testing"

	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/database"
)

// setupTestDB 创建测试用内存数据库
func setupTestDB(t *testing.T) (*database.DB, *config.Config) {
	t.Helper()

	// 使用临时文件作为 SQLite 数据库
	tmpFile, err := os.CreateTemp("", "tab-sync-test-*.db")
	if err != nil {
		t.Fatalf("创建临时数据库文件失败: %v", err)
	}
	t.Cleanup(func() {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
	})

	cfg := &config.Config{
		DBPath:    tmpFile.Name(),
		JWTSecret: "test-secret-key-for-unit-tests",
		Version:   "1.0.0-test",
		Port:      "0",
	}

	db, err := database.Init(cfg)
	if err != nil {
		t.Fatalf("初始化数据库失败: %v", err)
	}

	if err := database.AutoMigrate(db); err != nil {
		t.Fatalf("数据库迁移失败: %v", err)
	}

	return db, cfg
}

func TestAuthService_GenerateAndVerifyToken(t *testing.T) {
	db, cfg := setupTestDB(t)
	svc := NewAuthService(db, cfg)

	// 测试生成 Token
	token, err := svc.GenerateToken("测试 Token", false)
	if err != nil {
		t.Fatalf("生成 Token 失败: %v", err)
	}
	if token.Token == "" {
		t.Error("Token 值为空")
	}
	if !strings.HasPrefix(token.Token, "tbs_") {
		t.Error("Token 应以 tbs_ 开头")
	}
	if token.IsAdmin {
		t.Error("非管理员 Token 的 IsAdmin 应为 false")
	}

	// 测试验证 Token
	verified, err := svc.VerifyToken(token.Token)
	if err != nil {
		t.Fatalf("验证 Token 失败: %v", err)
	}
	if verified.TokenID != token.TokenID {
		t.Errorf("TokenID 不匹配: got %s, want %s", verified.TokenID, token.TokenID)
	}

	// 测试验证无效 Token
	_, err = svc.VerifyToken("invalid-token")
	if err == nil {
		t.Error("验证无效 Token 应该返回错误")
	}
}

func TestAuthService_RevokeToken(t *testing.T) {
	db, cfg := setupTestDB(t)
	svc := NewAuthService(db, cfg)

	token, _ := svc.GenerateToken("吊销测试", false)

	// 吊销前验证成功
	_, err := svc.VerifyToken(token.Token)
	if err != nil {
		t.Fatalf("吊销前验证失败: %v", err)
	}

	// 吊销 Token
	err = svc.RevokeToken(token.TokenID)
	if err != nil {
		t.Fatalf("吊销 Token 失败: %v", err)
	}

	// 吊销后验证失败
	_, err = svc.VerifyToken(token.Token)
	if err == nil {
		t.Error("吊销后 Token 仍能验证通过")
	}
}

func TestAuthService_AdminToken(t *testing.T) {
	db, cfg := setupTestDB(t)
	svc := NewAuthService(db, cfg)

	adminToken, _ := svc.GenerateToken("管理员", true)
	userToken, _ := svc.GenerateToken("普通用户", false)

	if !svc.IsAdmin(adminToken.Token) {
		t.Error("管理员 Token 的 IsAdmin 检查失败")
	}
	if svc.IsAdmin(userToken.Token) {
		t.Error("普通 Token 不应该通过 IsAdmin 检查")
	}
}

func TestAuthService_ListTokens(t *testing.T) {
	db, cfg := setupTestDB(t)
	svc := NewAuthService(db, cfg)

	svc.GenerateToken("Token 1", false)
	svc.GenerateToken("Token 2", true)
	svc.GenerateToken("Token 3", false)

	tokens, err := svc.ListTokens()
	if err != nil {
		t.Fatalf("列出 Token 失败: %v", err)
	}
	if len(tokens) != 3 {
		t.Errorf("Token 数量不匹配: got %d, want 3", len(tokens))
	}
}

func TestAuthService_GenerateAndValidateJWT(t *testing.T) {
	db, cfg := setupTestDB(t)
	svc := NewAuthService(db, cfg)

	jwt, err := svc.GenerateJWT("admin")
	if err != nil {
		t.Fatalf("生成 JWT 失败: %v", err)
	}
	if jwt == "" {
		t.Error("JWT 值为空")
	}

	claims, err := svc.ValidateJWT(jwt)
	if err != nil {
		t.Fatalf("验证 JWT 失败: %v", err)
	}
	sub, _ := claims.GetSubject()
	if sub != "admin" {
		t.Errorf("JWT subject 不匹配: got %s, want admin", sub)
	}
}
