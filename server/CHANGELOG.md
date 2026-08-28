# Changelog

All notable changes to Tab Sync Server will be documented in this file.

## [Unreleased]

### Added

- **Tag System**: Global tags with `tab` / `workspace` scope; assign/unassign tags to workspace tabs and workspaces; tag list returned within workspace responses for multi-device sharing
- **Tag Endpoints**: `GET/POST /v1/tab-sync/tags`, `DELETE /v1/tab-sync/tags/:id`, plus per-tab and per-workspace tag association endpoints
- **Workspace Sorting**: `POST /v1/tab-sync/workspaces/:id/move` moves a workspace to a drop position (`before` / `after` / `inner`) relative to a target workspace. Resulting sibling order is always computed server-side from current data, so concurrent multi-device edits converge on the server's view; the new parent is recursively checked to never fall inside the moved subtree
- **Workspace Sort Order Migration**: one-time startup backfill (`workspace_sort_order_v1`) that assigns dense `sort_order` per sibling level to existing workspaces, which previously all had `0`. Ordering follows name (Chinese via GB18030 byte order, which approximates pinyin) so the initial result matches the previous frontend display order. Runs once and never overwrites manual sorting afterwards

## [1.0.0] - 2026-07-23

### Added

- **Core API**: Device registration, workspace CRUD, tab management endpoints
- **API Key Auth**: Bearer Token authentication, admin token management via `/setup`
- **Web Admin Panel**: Setup wizard, token management, statistics overview
- **Version Negotiation**: `GET /v1/tab-sync/version` with extension version compatibility check
- **TraceID Middleware**: UUID trace ID per request, included in `CommonReturn` and `X-Trace-Id` header
- **API Documentation**: `/api/docs` page with full endpoint reference and examples
- **Docker Support**: Multi-arch (amd64/arm64) Dockerfile with health check
- **docker-compose**: Single-service deployment with optional Nginx reverse proxy
- **CI/CD**: GitHub Actions workflow for multi-arch Docker image publishing to ghcr.io
- **SSE Placeholder**: Architecture reserved for AI remote query via Server-Sent Events
- **Upstream Proxy**: Architecture reserved for zhige cloud sync integration

### Stack

- Go 1.22 + Gin + GORM + SQLite
- Embedded web pages (setup, docs)
- Environment-variable-driven configuration

[1.0.0]: https://github.com/spidermemos/tab-sync/releases/tag/v1.0.0
