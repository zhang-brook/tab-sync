package service

import (
	"sync"
)

// SSEService SSE 服务（预留，用于 AI 远程查询 tool_calling）
type SSEService struct {
	mu      sync.RWMutex
	clients map[string]chan []byte
}

// NewSSEService 创建 SSE 服务
func NewSSEService() *SSEService {
	return &SSEService{
		clients: make(map[string]chan []byte),
	}
}

// RegisterClient 注册 SSE 客户端
func (s *SSEService) RegisterClient(id string) chan []byte {
	s.mu.Lock()
	defer s.mu.Unlock()

	ch := make(chan []byte, 100)
	s.clients[id] = ch
	return ch
}

// UnregisterClient 注销 SSE 客户端
func (s *SSEService) UnregisterClient(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if ch, ok := s.clients[id]; ok {
		close(ch)
		delete(s.clients, id)
	}
}

// Broadcast 向所有客户端广播消息（预留）
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
