import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'

// ElMessageBox / ElMessage 是命令式 API，unplugin-vue-components 不会自动导入其样式，需手动导入
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-overlay.css'

// 配置 Element Plus 全局汉化（zh-CN）：作用在全局配置上，模板组件与命令式 API
// （ElMessageBox / ElMessage / ElNotification）的默认文案都会自动使用中文
import { provideGlobalConfig } from 'element-plus/es/components/config-provider/src/hooks/use-global-config'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

/** 扩展 vue-router 的 RouteMeta，声明数据来源字段 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 数据来源标识：显示在顶部标题旁 */
    dataSource?: {
      label: string
      desc?: string
      /** el-tag 的 type 属性 */
      type: 'info' | 'success'
    }
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('./views/DashboardView.vue'),
    },
    {
      path: '/tabs',
      name: 'Tabs',
      component: () => import('./views/TabsView.vue'),
      meta: {
        dataSource: { label: '本地', desc: '数据来自当前浏览器', type: 'info' },
      },
    },
    {
      path: '/workspaces',
      name: 'Workspaces',
      component: () => import('./views/WorkspacesView.vue'),
      meta: {
        dataSource: { label: '云端', desc: '数据跨设备同步', type: 'success' },
      },
    },
    {
      path: '/tags',
      name: 'Tags',
      component: () => import('./views/TagsView.vue'),
      meta: {
        dataSource: { label: '云端', desc: '数据跨设备同步', type: 'success' },
      },
    },
    {
      path: '/synced',
      name: 'Synced',
      component: () => import('./views/SyncedView.vue'),
      meta: {
        dataSource: { label: '云端', desc: '数据跨设备同步', type: 'success' },
      },
    },
    {
      path: '/recyclebin',
      name: 'RecycleBin',
      component: () => import('./views/RecycleBinView.vue'),
      meta: {
        dataSource: { label: '云端', desc: '被移除的标签页暂存于此，可恢复', type: 'success' },
      },
    },
    {
      path: '/devices',
      name: 'Devices',
      component: () => import('./views/DevicesView.vue'),
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('./views/SettingsView.vue'),
    },
  ],
})

const app = createApp(App)
app.use(router)
// 设置全局语言为中文（第三个参数 true = 写入全局配置，命令式 API 也能生效）
provideGlobalConfig({ locale: zhCn }, app, true)
app.mount('#app')
