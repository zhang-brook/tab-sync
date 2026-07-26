import { createApp } from 'vue'
import App from './App.vue'

// ElMessage 等命令式 API 的样式需手动导入（auto-import 不会自动引入）
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-overlay.css'

const app = createApp(App)
app.mount('#app')
