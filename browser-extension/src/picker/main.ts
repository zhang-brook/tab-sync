import { createApp } from 'vue'
import App from './App.vue'

// ElMessageBox / ElMessage 是命令式 API，unplugin-vue-components 不会自动导入其样式，需手动导入
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-overlay.css'

// 配置 Element Plus 全局汉化（zh-CN）
import { provideGlobalConfig } from 'element-plus/es/components/config-provider/src/hooks/use-global-config'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const app = createApp(App)
// 写入全局配置，命令式 API 也能生效
provideGlobalConfig({ locale: zhCn }, app, true)
app.mount('#app')
