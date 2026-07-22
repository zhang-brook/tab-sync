# 多阶段构建 - 多架构支持 (linux/amd64, linux/arm64)
# 构建命令：
#   docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/spidermemos/tab-sync-server:latest --push .
# 单架构本地构建：
#   docker build -t tab-sync-server .

# ====== 构建阶段 ======
# 使用 TARGETPLATFORM 确保 QEMU 模拟下正确构建（CGO 项目推荐此方式）
FROM --platform=$TARGETPLATFORM golang:1.22-alpine AS builder

WORKDIR /app

# 安装 CGO 编译依赖
RUN apk add --no-cache gcc musl-dev

# 缓存依赖层（先复制 go.mod/go.sum）
COPY go.mod go.sum ./
RUN go mod download

# 编译
COPY . .
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=1 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -ldflags="-s -w" -o /tab-sync-server ./cmd/server

# ====== 运行阶段 ======
FROM alpine:3.20

# 安装运行时依赖
RUN apk add --no-cache ca-certificates tzdata wget
ENV TZ=Asia/Shanghai

WORKDIR /app

COPY --from=builder /tab-sync-server .

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 8080

# 数据持久化
VOLUME ["/app/data"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/v1/tab-sync/version || exit 1

ENTRYPOINT ["./tab-sync-server"]
