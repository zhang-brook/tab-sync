# SpiderMemos Tab Sync - AI 协作开发指南

本文档沉淀了项目开发过程中的关键注意事项、技术细节和沟通约定，供后续 AI 助手或开发者参考。

---

## 1. 项目概览

Chrome 浏览器标签页管理扩展，支持标签页实时同步、工作组管理、多设备协作。

- **技术栈**: Vue 3 (Composition API) + Element Plus + Vite 8 + CRXJS v2.4.0 + TypeScript 6 + Chrome Manifest V3
- **架构**: Background Service Worker 为数据中心，所有 UI (Popup / SidePanel / Dashboard) 通过 `chrome.runtime.sendMessage` 通信
- **设计规范**: `.qoder/specs/tab-sync-manager.md`
- **OpenAPI 规范**: `openapi.yaml`

---

## 2. 构建与开发命令

```bash
# 开发模式 (支持 HMR 热更新，CRXJS 会自动通知浏览器刷新扩展)
npm run dev

# 生产构建 (先 vue-tsc 类型检查，再 vite build)
npm run build
```

**注意**:
- `npm run dev` 启动后在 `chrome://extensions` 加载 `dist` 目录即可实时开发
- 每次代码修改后应运行 `npm run build` 确认类型检查通过
- 项目未配置 ESLint / Prettier，但有 Prettier 格式化器自动格式化 (通过编辑器保存触发)

---

## 3. 代码修改注意事项

### 3.1 绝对不能删除现有注释

这是用户的明确要求: **所有代码改动都必须保留现有注释，不得删除或覆盖已有注释**。新增代码可以添加注释，但不要修改或删除已存在的注释。

### 3.2 Chrome Extension MV3 陷阱

| 陷阱 | 正确做法 |
|------|----------|
| Service Worker 30s 无活动可能被终止 | 所有状态持久化到 `chrome.storage.local`，不依赖内存变量 (唯一例外: `pendingReopens` Map 用于短暂的恢复协调) |
| `setInterval` 在 SW 终止后失效 | 使用 `chrome.alarms` |
| 事件监听器必须顶层同步注册 | 不能放在 `async` 回调或条件判断内 |
| `chrome.runtime.sendMessage` 的异步回调 | `handleMessage(msg).then(sendResponse).catch(...)` 必须有 `.catch()`，否则 promise 拒绝时 `sendResponse` 永远不会被调用，前端收到 `undefined` |

### 3.3 TypeScript 类型注意

- `@types/chrome` v0.1.40 中的类型命名:
  - `chrome.tabs.onActivated` 的回调参数类型是 `chrome.tabs.OnActivatedInfo` (不是 `TabActiveInfo`)
  - `chrome.tabs.onUpdated` 的 `changeInfo` 参数类型是 `chrome.tabs.OnUpdatedInfo` (不是 `TabChangeInfo`)
- 验证类型时可直接阅读 `node_modules/@types/chrome/index.d.ts`

### 3.4 消息通信模式

所有 UI → Background 的通信都通过统一的消息协议:

```typescript
// UI 端发送消息
const res = await sendMessage<ResponseType>({ action: 'ACTION_NAME', payload: {...} })

// Background 端处理消息 (message-handler.ts)
export async function handleMessage(message: ExtensionMessage): Promise<MessageResponse> {
  switch (message.action) { ... }
}
```

**防御性编程**: UI 端读取响应数据时必须使用可选链 `?.` 和空值合并 `??`，因为 Background 可能因任何原因返回 `undefined`。

### 3.5 Tab 标识体系

- 扩展生成 UUID 作为 TabRecord 的 `id` (跨设备持久化)
- Chrome 的 `tabId` (数字) 仅在本地会话期间有意义，存在 `TAB_ID_MAP` (chromeTabId → UUID) 映射表
- 标签页关闭时从 `TAB_ID_MAP` 移除，但 `TabRecord` 保留 (status 变为 `closed`)

### 3.6 工作组标签页恢复去重机制

当用户从工作组恢复打开标签页时，需要避免重复创建:

1. **已打开检测**: 先检查 TabRecord.status 是否为 `open`，再通过 `chrome.tabs.get()` 确认 Chrome 标签页真实存在
2. **预注册机制**: 在 `tab-monitor.ts` 中维护 `pendingReopens` Map (URL → UUID[])，`handleOpenWorkspace` 在调用 `chrome.tabs.create()` 前注册，`handleTabCreated` 匹配后复用已有 TabRecord
3. **5 秒超时清理**: 预注册条目在 5 秒后自动清除，防止内存泄漏
4. **URL 匹配**: 使用 `tab.pendingUrl || tab.url` 进行匹配，因为 `onCreated` 事件中 `tab.url` 可能尚未设置

### 3.7 事件防抖

`chrome.tabs.onUpdated` 在页面加载时会触发 3-8 次，使用 per-tab 500ms 防抖 (`createKeyedDebounce`)，只处理最终状态。

### 3.8 存储 Key 管理

所有 `chrome.storage.local` 的 key 集中定义在 `src/shared/storage/keys.ts` 的 `STORAGE_KEYS` 常量中。新增存储项时必须在此注册。

---

## 4. 目录结构关键文件

```
src/
  background/
    index.ts              # SW 入口，初始化 + 消息监听 + 设备注册
    tab-monitor.ts        # 标签页事件监听 + 全量扫描 + 恢复预注册机制
    message-handler.ts    # 统一消息分发器 (所有 UI 消息处理)
    sync-engine.ts        # 同步引擎 (事件队列 + 批量上传)
    alarm-manager.ts      # 定时同步 + 心跳
  popup/                  # 弹出窗口 (轻量快捷操作)
  sidepanel/              # 侧边栏面板 (中等复杂度)
  dashboard/              # 独立标签页管理面板 (完整功能 SPA)
    views/
      TabsView.vue        # 标签页管理 (搜索/筛选/批量操作)
      WorkspacesView.vue  # 工作组管理 (CRUD + 恢复打开)
      HistoryView.vue     # 已关闭标签页历史
      DevicesView.vue     # 多设备概览
      SettingsView.vue    # 设置 (认证/同步/数据)
  shared/
    types/                # TypeScript 类型定义
    api/                  # fetch 封装 + 各模块 API
    composables/          # Vue composables (useMessage, useAuth, useStorage)
    storage/              # chrome.storage.local 封装
    utils/                # 工具函数 (UUID, 防抖, 设备指纹, 日志)
    constants.ts          # 全局常量
```

---

## 5. 沟通与协作约定

以下约定来自与项目负责人的沟通，后续 AI 助手应遵循:

### 5.1 开发流程

- **每个小步骤完成后暂停向用户确认**，不要一口气做完所有事情
- 每完成一个阶段性步骤后，等待用户确认再继续
- 遇到不确定的设计决策时**主动提问**，不要猜测

### 5.2 Git 提交

- **使用中文编写 commit message**
- 格式示例: `feat: 实现工作组一键恢复打开与标签页去重关联`
- 常用前缀: `feat:` (新功能), `fix:` (修复), `refactor:` (重构), `docs:` (文档), `chore:` (杂项)
- **不要主动提交**，等用户明确要求时再执行 `git commit`

### 5.3 代码风格

- Vue 组件使用 `<script setup lang="ts">` + Composition API
- Element Plus 组件通过 `unplugin-vue-components` 自动导入，无需手动 import
- Element Plus 图标需要手动从 `@element-plus/icons-vue` 导入
- 使用 `ElMessage` / `ElMessageBox` 需要手动从 `element-plus` 导入
- CSS 使用 `<style scoped>`，不使用 CSS 预处理器 (dashboard 入口除外用了 scss)

### 5.4 后端状态

- 后端尚未实现，所有 API 调用包裹 try-catch，失败时仅记录日志不影响本地功能
- 扩展的本地功能 (标签页监控、工作组管理、历史记录) 完全独立于后端运行
- 后端接口规范见 `openapi.yaml`

---

## 6. 已知边界情况

1. **Service Worker 重启**: SW 被终止再唤醒时，`pendingReopens` Map 会丢失。但因为预注册条目生命周期仅 5 秒，这在实际中不构成问题。
2. **重复 URL 的工作组标签页**: 预注册使用 URL 队列 (FIFO) 匹配，同一 URL 的多个标签页能正确处理。
3. **`chrome.tabs.get()` 的竞态**: 在检测标签页是否存在和实际操作之间，标签页可能被用户关闭。所有 Chrome API 调用都应包裹 try-catch。
4. **Prettier 自动格式化**: 编辑器保存时可能自动格式化代码，导致"File has been modified since read"错误。编辑前应先重新读取文件。

---

## 7. 扩展加载与测试

1. 运行 `npm run build` (或 `npm run dev`)
2. 打开 `chrome://extensions`，启用"开发者模式"
3. 点击"加载已解压的扩展程序"，选择项目 `dist` 目录
4. 验证: Popup 弹出、SidePanel 可打开、Dashboard 可在新标签页中打开
5. 打开/关闭/切换标签页，观察 Service Worker 控制台日志

---

## 8. 后续开发建议

- 未实现的功能: Side Panel 组件 (TabList, SearchBar, WorkspaceQuick)
- 可优化项: 扩展图标 Badge 显示同步状态/未同步事件数
- 后端实现后: 集成 MSW (Mock Service Worker) 进行端到端测试
- 考虑添加 ESLint + Prettier 配置以统一代码风格
