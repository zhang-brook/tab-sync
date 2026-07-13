# 多阶段构建
FROM golang:1.22-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache gcc musl-dev

# 缓存依赖
COPY go.mod go.sum ./
RUN go mod download

# 编译
COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o /tab-sync-server ./cmd/server

# 运行阶段
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app

COPY --from=builder /tab-sync-server .

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 8080

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/v1/tab-sync/version || exit 1

ENTRYPOINT ["./tab-sync-server"]
