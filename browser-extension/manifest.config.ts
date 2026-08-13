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
  commands: {
    'save-and-close': {
      suggested_key: { default: 'Shift+Alt+S' },
      description: '将当前标签页加入工作组并关闭',
    },
  },
})
