import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'

// ElMessageBox / ElMessage 是命令式 API，unplugin-vue-components 不会自动导入其样式，需手动导入
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-overlay.css'

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
    },
    {
      path: '/workspaces',
      name: 'Workspaces',
      component: () => import('./views/WorkspacesView.vue'),
    },
    {
      path: '/history',
      name: 'History',
      component: () => import('./views/HistoryView.vue'),
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
