import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'

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
