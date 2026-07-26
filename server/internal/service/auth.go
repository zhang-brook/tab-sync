package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/database"
	"github.com/spidermemos/tab-sync-server/internal/model"
)

// AuthService 认证服务
type AuthService struct {
	db  *database.DB
	cfg *config.Config
}

// NewAuthService 创建认证服务
func NewAuthService(db *database.DB, cfg *config.Config) *AuthService {
	return &AuthService{db: db, cfg: cfg}
}

// VerifyToken 验证 Bearer Token 是否有效
func (s *AuthService) VerifyToken(tokenStr string) (*model.AuthToken, error) {
	var token model.AuthToken
	result := s.db.Where("token = ? AND is_revoked = ?", tokenStr, false).First(&token)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("token 无效或已吊销")
		}
		return nil, result.Error
	}

	// 更新最后使用时间
	now := time.Now()
	s.db.Model(&token).Update("last_used", now)

	return &token, nil
}

// GenerateToken 生成新的认证 Token
func (s *AuthService) GenerateToken(name string, isAdmin bool) (*model.AuthToken, error) {
	// 生成随机 Token 值
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	tokenValue := "tbs_" + hex.EncodeToString(raw)

	token := &model.AuthToken{
		TokenID: uuid.New().String(),
		Token:   tokenValue,
		Name:    name,
		IsAdmin: isAdmin,
	}

	if err := s.db.Create(token).Error; err != nil {
		return nil, err
	}

	return token, nil
}

// RevokeToken 吊销 Token
func (s *AuthService) RevokeToken(tokenID string) error {
	result := s.db.Model(&model.AuthToken{}).
		Where("token_id = ?", tokenID).
		Update("is_revoked", true)
	if result.RowsAffected == 0 {
		return errors.New("Token 不存在")
	}
	return result.Error
}

// ListTokens 列出所有 Token
func (s *AuthService) ListTokens() ([]model.AuthToken, error) {
	var tokens []model.AuthToken
	err := s.db.Where("is_revoked = ?", false).Order("created_at DESC").Find(&tokens).Error
	return tokens, err
}

// IsAdmin 检查 Token 是否为管理员
func (s *AuthService) IsAdmin(tokenStr string) bool {
	var token model.AuthToken
	result := s.db.Where("token = ? AND is_revoked = ? AND is_admin = ?", tokenStr, false, true).First(&token)
	return result.Error == nil
}

// GenerateJWT 生成 JWT（用于管理界面会话）
func (s *AuthService) GenerateJWT(adminUser string) (string, error) {
	claims := jwt.MapClaims{
		"sub": adminUser,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

// ValidateJWT 验证 JWT 并返回 Claims
func (s *AuthService) ValidateJWT(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("签名算法不匹配")
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("token 无效")
}
