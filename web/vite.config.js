import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 纯静态站点：没有后端接口，构建产物可直接丢到 Cloudflare Pages / 任何静态托管。
export default defineConfig({
  // 部署到子路径（如 GitHub Pages 的 /仓库名/）时，用 VITE_BASE_PATH 覆盖
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2019',
    // 静态资源体积很小，直接内联小图，减小首屏请求数
    assetsInlineLimit: 4096,
  },
})
