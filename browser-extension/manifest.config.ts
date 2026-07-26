import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'SpiderMemos Tab Sync', // pkg.name,
  version: pkg.version,
  description: '同步和管理浏览器标签页，支持多设备共享、工作组管理',
  permissions: [
    'tabs',
    'tabGroups',
    'storage',
    'alarms',
    'activeTab',
    'sidePanel',
  ],
  host_permissions: [
    '<all_urls>',
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
    default_popup: 'src/popup/index.html',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  icons: {
    16: 'public/icons/icon-16.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },
})
