import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'

// ElMessageBox / ElMessage 是命令式 API，unplugin-vue-components 不会自动导入其样式，需手动导入
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-overlay.css'

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
      redirect: '/tabs',
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
      path: '/history',
      name: 'History',
      component: () => import('./views/HistoryView.vue'),
      meta: {
        dataSource: { label: '本地', desc: '数据来自当前浏览器', type: 'info' },
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
app.mount('#app')
