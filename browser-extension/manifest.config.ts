import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'Tab Sync', // pkg.name,
  version: pkg.version,
  description: '同步和管理浏览器标签页，支持多设备共享、工作组管理',
  permissions: [
    'tabs',
    'tabGroups',
    'storage',
    'alarms',
    'activeTab',
    'sidePanel',
    'notifications',
    'contextMenus',
  ],
  host_permissions: [
    '<all_urls>',
  ],
  web_accessible_resources: [
    {
      // 把 src/picker/index.html 加入 web_accessible_resources（CRXJS 只打包在 manifest 中引用的 HTML，不加这一步弹窗页面不会被构建）
      resources: [
        'src/picker/index.html',
        // 'src/dashboard/index.html',
      ],
      matches: ['<all_urls>'],
    },
  ],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_icon: {
      16: 'public/icons/icon-16.png',
      32: 'public/icons/icon-32.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png',
    },
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  "options_ui": {
    "page": "src/dashboard/index.html",
    "open_in_tab": true,   // 是否在新标签页打开
  },
  icons: {
    16: 'public/icons/icon-16.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },

  // 最多只能定义4个快捷键 超出的需要用户手动注册
  // 否则会报错: Too many shortcuts specified for 'commands': The maximum is 4.
  commands: {
    // Chrome contextMenus 不支持菜单项内联快捷键（accessKey 为 Firefox 专属），
    // 用 commands 注册全局快捷键，并在右键菜单标题中显示提示文本
    'open-sidepanel': {
      // Alt+Shift+P 与 Chrome 内置“创建标签页组”快捷键冲突，改用 L（栏）
      // suggested_key: { default: 'Alt+Shift+L' },
      description: '打开侧栏',
    },
    'open-settings': {
      // suggested_key: { default: 'Alt+Shift+O' },
      description: '打开设置页',
    },
    // 快捷键针对当前激活标签页（无法像右键菜单那样作用于被右键的标签页）
    // 添加到用户设置的默认分组
    'save-and-close': {
      suggested_key: { default: 'Shift+Alt+S' },
      description: '【加入默认工作组并关闭】将当前标签页加入工作组并关闭（默认：Shift+Alt+S）',
    },
    // 添加到 [未分组]
    'save-ungrouped': {
      suggested_key: { default: 'Alt+Shift+U' },
      description: '【保存到 [未分组]】保存当前标签页到 [未分组] 并关闭（默认：Shift+Alt+U）',
    },
    // 选择指定分组，然后添加
    'save-pick': {
      suggested_key: { default: 'Alt+Shift+G' },
      description: '【保存到选定分组】保存当前标签页到选定分组（默认：Alt+Shift+G）',
    },
    // 注意：Chrome 仅自动分配前 4 个命令的快捷键，多余的键需在 chrome://extensions/shortcuts 手动绑定
  },
})
