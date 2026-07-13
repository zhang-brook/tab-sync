.PHONY: build run clean test

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
