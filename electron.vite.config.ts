import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared, '@main': resolve('src/main') } },
    define: { __APP_VERSION__: JSON.stringify(pkg.version) }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@shared': shared, '@renderer': resolve('src/renderer/src') }
    },
    // 版本号只在 package.json 里维护一处，界面文案不再写死
    define: { __APP_VERSION__: JSON.stringify(pkg.version) }
  }
})
