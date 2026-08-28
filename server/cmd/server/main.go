package main

import (
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/spidermemos/tab-sync/server/internal/config"
	"github.com/spidermemos/tab-sync/server/internal/database"
	"github.com/spidermemos/tab-sync/server/internal/handler"
	"github.com/spidermemos/tab-sync/server/internal/logger"
	"github.com/spidermemos/tab-sync/server/internal/middleware"
	"github.com/spidermemos/tab-sync/server/internal/service"

	"github.com/gin-gonic/gin"
)

//go:embed web/*
var webFS embed.FS

func main() {
	// 加载配置
	cfg := config.Load()

	// 初始化日志系统
	logger.Init(cfg.LogLevel, cfg.LogOutput)
	slog.Info("Tab Sync Server 正在启动", "version", cfg.Version)

	// 初始化数据库
	db, err := database.Init(cfg)
	if err != nil {
		slog.Error("数据库初始化失败", "error", err)
		os.Exit(1)
	}
	slog.Info("数据库初始化成功", "db_path", cfg.DBPath)

	// 自动迁移
	if err := database.AutoMigrate(db); err != nil {
		slog.Error("数据库迁移失败", "error", err)
		os.Exit(1)
	}

	// 解析并持久化 JWT 签名密钥（保证重启后管理员登录态有效）
	service.ResolveJWTSecret(db, cfg)

	// 初始化各层
	services := service.NewServices(db, cfg)
	handlers := handler.NewHandlers(services)

	// 确保「未分组」系统工作组存在：新用户自动创建，存量用户幂等补齐，
	// 保证工作组树始终能显示该节点（回收站恢复、归入未分组等均依赖它）。
	if _, err := services.Workspace.GetOrCreateUngroupedWorkspace(); err != nil {
		slog.Error("初始化未分组工作组失败", "error", err)
	}

	// 设置 Gin 路由
	r := gin.New()

	// 全局中间件
	r.Use(gin.Recovery())
	r.Use(middleware.TraceID())
	r.Use(middleware.RequestLogger())
	r.Use(middleware.CORS())
	r.Use(middleware.VersionCheck(cfg.Version, cfg.MinExtVersion, cfg.MaxExtVersion))

	// ========== 管理后台路由（Web 界面） ==========

	// 嵌入的静态资源（web/ 目录）
	webSub, _ := fs.Sub(webFS, "web")

	// 访问根路径自动跳转到管理控制台（设置向导 / 后台）
	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusFound, "/setup")
	})
	r.GET("/setup", func(c *gin.Context) {
		c.FileFromFS("/setup.html", http.FS(webSub))
	})

	// 管理后台 API（无需 Token 认证，使用 JWT 会话）
	r.POST("/api/setup", handlers.Setup.CompleteSetup)
	r.GET("/api/setup/status", handlers.Setup.GetSetupStatus)
	r.POST("/api/admin/login", handlers.Setup.AdminLogin)

	// API 文档页面
	r.GET("/api/docs", func(c *gin.Context) {
		c.FileFromFS("/docs.html", http.FS(webSub))
	})

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
			auth.GET("/workspaces/:id/tabs", handlers.Workspace.GetTabs)
			auth.POST("/workspaces", handlers.Workspace.Create)
			auth.PUT("/workspaces/:id", handlers.Workspace.Update)
			auth.DELETE("/workspaces/:id", handlers.Workspace.Delete)
			auth.DELETE("/workspaces/:id/tabs/:tabId", handlers.Workspace.DeleteTab)
			auth.GET("/workspaces/tabs-summary", handlers.Workspace.TabsSummary)
			auth.POST("/workspaces/:id/tabs/move", handlers.Workspace.MoveTab)
			auth.POST("/workspaces/:id/tabs", handlers.Workspace.AddTabByURL)
			auth.PATCH("/workspaces/:id/tabs/:tabId", handlers.Workspace.UpdateTab)

			// 同步相关（预留）
			auth.POST("/sync/push", handlers.Sync.PushEvents)
			auth.GET("/sync/pull", handlers.Sync.PullEvents)

			// SSE 通道（浏览器扩展 ↔ 轻量后端长连接）
			auth.GET("/sse/events", handlers.SSE.Stream)

			// AI 远程查询 tool_calling（织个网上游对接预留）
			auth.POST("/tool-calling", handlers.SSE.HandleToolCall)

			// 标签管理（标签页标签 + 工作组标签）
			auth.GET("/tags", handlers.Tag.List)
			auth.POST("/tags", handlers.Tag.Create)
			auth.PUT("/tags/:id", handlers.Tag.Update)
			auth.DELETE("/tags/:id", handlers.Tag.Delete)
			auth.GET("/tags/:id/tabs", handlers.Tag.GetTabsByTag)
			auth.POST("/workspaces/:id/tabs/:tabId/tags", handlers.Tag.AddToTab)
			auth.DELETE("/workspaces/:id/tabs/:tabId/tags/:tagId", handlers.Tag.RemoveFromTab)
			auth.POST("/workspaces/:id/tags", handlers.Tag.AddToWorkspace)
			auth.DELETE("/workspaces/:id/tags/:tagId", handlers.Tag.RemoveFromWorkspace)

			// 回收站（被移除的标签页暂存，可恢复/彻底删除）
			auth.GET("/recyclebin", handlers.RecycleBin.List)
			auth.POST("/recyclebin/:id/restore", handlers.RecycleBin.Restore)
			auth.DELETE("/recyclebin/:id", handlers.RecycleBin.Delete)
			auth.DELETE("/recyclebin", handlers.RecycleBin.Empty)
		}

		// 管理接口（支持 Admin Token 或 JWT 会话）
		admin := v1.Group("/admin")
		admin.Use(middleware.AdminOrJWTAuth(services.Auth))
		{
			admin.POST("/tokens", handlers.Auth.GenerateToken)
			admin.DELETE("/tokens/:tokenId", handlers.Auth.RevokeToken)
			admin.GET("/tokens", handlers.Auth.ListTokens)
			admin.GET("/stats", handlers.System.GetStats)
		}
	}

	// 启动上游 SSE 连接（预留：织个网对接）
	services.SSE.ConnectToUpstream()

	// 启动服务器
	addr := ":" + cfg.Port
	slog.Info("服务器启动成功", "addr", "http://localhost:"+cfg.Port)
	if cfg.IsFirstRun {
		slog.Info("首次运行！请在浏览器中打开设置向导", "url", "http://localhost:"+cfg.Port+"/setup")
	}

	go func() {
		if err := r.Run(addr); err != nil {
			slog.Error("服务器运行失败", "error", err)
			os.Exit(1)
		}
	}()

	// 等待退出信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("服务器正在关闭...")
}
