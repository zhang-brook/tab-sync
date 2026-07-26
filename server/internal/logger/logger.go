package logger

import (
	"log/slog"
	"os"
)

// Logger 全局日志实例
var Logger *slog.Logger

// Init 初始化日志系统
// level: debug / info / warn / error
// output: stdout / file path
func Init(level string, output string) {
	var logLevel slog.Level
	switch level {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{
		Level: logLevel,
	}

	var handler slog.Handler
	if output == "" || output == "stdout" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		file, err := os.OpenFile(output, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			// 文件打开失败时回退到 stdout
			handler = slog.NewTextHandler(os.Stdout, opts)
		} else {
			handler = slog.NewTextHandler(file, opts)
		}
	}

	Logger = slog.New(handler)
	slog.SetDefault(Logger)
}
