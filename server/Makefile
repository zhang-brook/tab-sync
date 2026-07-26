.PHONY: build run clean test docker-build docker-push

# 编译当前平台
build:
	go build -o tab-sync-server ./cmd/server

# 编译 Linux
build-linux:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o tab-sync-server-linux ./cmd/server

# 编译 macOS
build-darwin:
	CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 go build -o tab-sync-server-darwin ./cmd/server
	CGO_ENABLED=1 GOOS=darwin GOARCH=arm64 go build -o tab-sync-server-darwin-arm64 ./cmd/server

# 编译 Windows
build-windows:
	CGO_ENABLED=1 GOOS=windows GOARCH=amd64 go build -o tab-sync-server.exe ./cmd/server

# 编译全平台
build-all: build-linux build-darwin build-windows

# 运行（开发模式）
run:
	go run ./cmd/server

# 清理编译产物
clean:
	rm -f tab-sync-server tab-sync-server-* tab-sync-server.exe

# 运行测试
test:
	go test ./...

# ====== Docker 多架构构建 ======

# 单架构 Docker 构建（当前平台）
docker-build:
	docker build -t tab-sync-server .

# 多架构构建 + 推送（需先 docker login）
docker-push:
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t ghcr.io/spidermemos/tab-sync-server:latest --push .

# Docker Compose 启动
docker-up:
	docker compose up -d

# Docker Compose 停止
docker-down:
	docker compose down
