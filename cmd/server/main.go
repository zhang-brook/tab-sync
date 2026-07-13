package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/spidermemos/tab-sync-server/internal/config"
	"github.com/spidermemos/tab-sync-server/internal/database"
	"github.com/spidermemos/tab-sync-server/internal/handler"
	"github.com/spidermemos/tab-sync-server/internal/middleware"
	"github.com/spidermemos/tab-sync-server/internal/service"

	"github.com/gin-gonic/gin"
)

func main() {
	// 加载配置
	cfg := config.Load()

	// 初始化数据库
	db, err := database.Init(cfg)
	if err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}

	// 自动迁移
	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}

	// 初始化各层
	services := service.NewServices(db, cfg)
	handlers := handler.NewHandlers(services)

	// 设置 Gin 路由
	r := gin.Default()

	// 全局中间件
	r.Use(middleware.CORS())
	r.Use(middleware.VersionCheck(cfg.Version))

	// 首次设置向导
	r.GET("/setup", handlers.Setup.RenderSetupPage)
	r.POST("/api/setup", handlers.Setup.CompleteSetup)

	// API v1 路由组
	v1 := r.Group("/v1/tab-sync")
	{
		// 公开接口（不需要认证）
		v1.GET("/version", handlers.System.GetVersion)

		// 认证相关（仅 Token 验证需要，生成/吊销在管理界面操作）
		v1.POST("/auth/verify-token", handlers.Auth.VerifyToken)

		// 需要认证的接口
		auth := v1.Group("")
		auth.Use(middleware.TokenAuth(services.Auth))
		{
			// 设备管理
			auth.POST("/devices/register", handlers.Device.Register)
			auth.GET("/devices", handlers.Device.List)
			auth.PATCH("/devices/:deviceId", handlers.Device.Update)
			auth.POST("/devices/:deviceId/heartbeat", handlers.Device.Heartbeat)
			auth.DELETE("/devices/:deviceId", handlers.Device.Deregister)

			// 工作组管理
			auth.GET("/workspaces", handlers.Workspace.List)
			auth.POST("/workspaces", handlers.Workspace.Create)
			auth.PUT("/workspaces/:id", handlers.Workspace.Update)
			auth.DELETE("/workspaces/:id", handlers.Workspace.Delete)
			auth.GET("/workspaces/tabs-summary", handlers.Workspace.TabsSummary)
			auth.POST("/workspaces/:id/tabs/move", handlers.Workspace.MoveTab)

			// 同步相关（预留）
			auth.POST("/sync/push", handlers.Sync.PushEvents)
			auth.GET("/sync/pull", handlers.Sync.PullEvents)

			// SSE 通道（预留，用于 AI 远程查询）
			auth.GET("/sse/events", handlers.SSE.Stream)
		}

		// 管理接口（需要 Admin Token）
		admin := v1.Group("/admin")
		admin.Use(middleware.AdminAuth(services.Auth))
		{
			admin.POST("/tokens", handlers.Auth.GenerateToken)
			admin.DELETE("/tokens/:tokenId", handlers.Auth.RevokeToken)
			admin.GET("/tokens", handlers.Auth.ListTokens)
			admin.GET("/stats", handlers.System.GetStats)
		}
	}

	// 启动服务器
	addr := ":" + cfg.Port
	log.Printf("Tab Sync Server v%s 启动于 %s", cfg.Version, addr)

	go func() {
		if err := r.Run(addr); err != nil {
			log.Fatalf("服务器启动失败: %v", err)
		}
	}()

	// 等待退出信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("服务器正在关闭...")
}
