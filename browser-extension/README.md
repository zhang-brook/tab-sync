# Tab Sync Browser Extension

Chrome / Edge 浏览器标签页管理扩展，支持标签页实时同步、工作组管理、多设备协作。

- **技术栈**: Vue 3 + Element Plus + Vite + CRXJS + TypeScript + Chrome Manifest V3
- **后端**: 轻量后端（Go + Gin + SQLite）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（支持 HMR 热更新）
npm run dev

# 生产构建
npm run build
```

### 加载扩展

1. 运行 `npm run build` 或 `npm run dev`
2. 打开 `chrome://extensions`，启用「开发者模式」
3. 点击「加载已解压的扩展程序」，选择项目 `dist` 目录
4. 安装后，建议将扩展图标固定到工具栏，方便使用

## 连接后端

### 选项 A：连接轻量后端（推荐）

1. 先部署 Tab Sync Server（参见[部署文档](https://github.com/zhang-brook/tab-sync/tree/main/server#readme)）
2. 打开扩展「管理面板」→ 设置
3. 连接模式选择 **「轻量后端」**
4. 填入后端地址（如 `http://localhost:8080`）
5. 在管理后台（`http://localhost:8080/setup`）生成 API Token
6. 将 Token 粘贴到设置页的 Token 输入框
7. 点击「验证连接」

### 选项 B：连接织个网后端（暂未开放）

扩展中「织个网」模式当前标记为暂未开放，接入待后续实现。

## 项目结构

```
src/
  background/            # Service Worker（数据中心 + 事件监听）
  sidepanel/             # 侧边栏（标签页总览 + 当前标签定位 + 工作组操作）
  dashboard/             # 完整管理面板（标签页/工作组/设备/历史/设置）
  shared/
    api/                 # fetch 封装 + 各模块 API
    storage/             # chrome.storage.local 封装
    types/               # TypeScript 类型定义
    composables/         # Vue composables
    components/          # 共享组件（如登录面板、工作组选择器）
    utils/               # 工具函数
```

## 开发指南

详见 [AGENTS.md](./AGENTS.md) — AI 协作开发指南，包含关键注意事项、技术细节和沟通约定。

## 后端

| 后端 | 技术栈 | 适用场景 |
|------|--------|----------|
| [Tab Sync Server](https://github.com/zhang-brook/tab-sync/tree/main/server) | Go + Gin + SQLite | 自部署、个人使用、内网环境 |
| 织个网后端 | Spring Boot + PostgreSQL | 云端多用户、分布式部署（扩展侧暂未开放） |
