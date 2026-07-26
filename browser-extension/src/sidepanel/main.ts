import { createApp } from 'vue'
import App from './App.vue'

// ElMessage 等命令式 API 的样式需手动导入（auto-import 不会自动引入）
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-overlay.css'

// 配置 Element Plus 全局汉化（zh-CN）：作用在全局配置上，命令式 API
// （ElMessage / ElMessageBox / ElNotification）的默认文案都会自动使用中文
import { provideGlobalConfig } from 'element-plus/es/components/config-provider/src/hooks/use-global-config'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const app = createApp(App)
// 设置全局语言为中文（第三个参数 true = 写入全局配置，命令式 API 也能生效）
provideGlobalConfig({ locale: zhCn }, app, true)
app.mount('#app')
