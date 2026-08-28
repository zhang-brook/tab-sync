package service

import (
	"log"
	"sync"

	"github.com/spidermemos/tab-sync/server/internal/config"
)

// SSEService SSE 服务
// 管理双向通信链路：
//  1. 浏览器扩展 ↔ 轻量后端（SSE 长连接）
//  2. 轻量后端 ↔ 织个网云端（预留，Client 模式轮询或 WebSocket）
type SSEService struct {
	mu      sync.RWMutex
	clients map[string]chan []byte

	// 上游连接状态（预留）
	upstreamConnected bool
	upstreamCfg       config.UpstreamConfig
}

// NewSSEService 创建 SSE 服务
func NewSSEService(cfg *config.Config) *SSEService {
	return &SSEService{
		clients:     make(map[string]chan []byte),
		upstreamCfg: cfg.GetUpstreamConfig(),
	}
}

// RegisterClient 注册 SSE 客户端（浏览器扩展连接）
func (s *SSEService) RegisterClient(id string) chan []byte {
	s.mu.Lock()
	defer s.mu.Unlock()

	ch := make(chan []byte, 100)
	s.clients[id] = ch
	log.Printf("[SSE] 客户端 %s 已注册（当前在线 %d）", id, len(s.clients))
	return ch
}

// UnregisterClient 注销 SSE 客户端
func (s *SSEService) UnregisterClient(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if ch, ok := s.clients[id]; ok {
		close(ch)
		delete(s.clients, id)
		log.Printf("[SSE] 客户端 %s 已注销（当前在线 %d）", id, len(s.clients))
	}
}

// Broadcast 向所有客户端广播消息
func (s *SSEService) Broadcast(message []byte) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, ch := range s.clients {
		select {
		case ch <- message:
		default:
			// 客户端缓冲区满，跳过
		}
	}
}

// SendToClient 向指定客户端发送消息
func (s *SSEService) SendToClient(clientID string, message []byte) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ch, ok := s.clients[clientID]
	if !ok {
		return false
	}

	select {
	case ch <- message:
		return true
	default:
		return false
	}
}

// ConnectToUpstream 连接到织个网上游云端（预留）
// 当 UPSTREAM_SYNC_ENABLED=true 时，启动一个后台 goroutine
// 使用 HTTP 长轮询或 WebSocket 与织个网云端保持连接，
// 接收远程查询请求（tool_calling）并转发到对应浏览器扩展。
//
// 当前为架构预留，不实现具体连接逻辑。
func (s *SSEService) ConnectToUpstream() {
	if !s.upstreamCfg.Enabled || s.upstreamCfg.URL == "" {
		log.Println("[SSE] 上游同步未启用，跳过上游连接")
		return
	}

	s.upstreamConnected = true
	log.Printf("[SSE] 上游连接已启用（预留）：%s", s.upstreamCfg.URL)

	// TODO: 实现上游连接逻辑
	// 1. 建立 WebSocket / 长轮询连接到 UPSTREAM_URL
	// 2. 发送认证 headers（X-Ext-Version, Authorization: Bearer UPSTREAM_TOKEN）
	// 3. 接收上游下发的 tool_call / sync_push 消息
	// 4. 根据 deviceID 将消息路由到对应浏览器扩展的 SSE channel
	// 5. 断线时按 RetryInterval 重连
}

// IsUpstreamConnected 返回上游连接状态
func (s *SSEService) IsUpstreamConnected() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.upstreamConnected
}
