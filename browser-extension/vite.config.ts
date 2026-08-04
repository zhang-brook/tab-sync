import path from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import zip from 'vite-plugin-zip-pack'
import manifest from './manifest.config.ts'
import { name, version } from './package.json' with { type: 'json' }
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  resolve: {
    alias: {
      '@': `${path.resolve(import.meta.dirname, 'src')}`,
    },
  },
  plugins: [
    vue(),
    crx({ manifest }),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    zip({ outDir: 'release', outFileName: `crx-${name}-${version}.zip` }),
  ],
  server: {
    port: 6886,
    host: true,
    strictPort: true,
    // 浏览器扩展页面运行在 extensions:// 协议下，location.host 为空，
    // Vite 的 HMR 客户端无法据此推断 WebSocket 地址，会退化为 localhost:80 而连接失败。
    // 显式指定 clientPort（及 host）让 HMR 客户端稳定连到 dev server。
    hmr: {
      host: 'localhost',
      clientPort: 6886,
    },
    cors: {
      origin: [
        /chrome-extension:\/\//,
      ],
    },
  },
  // 确保 element-plus 图标被完整预打包，避免依赖优化缓存因扫描时机不同而漏掉某些具名导出（如 Aim）。
  optimizeDeps: {
    include: ['@element-plus/icons-vue'],
  },
})
