// 校验打包产物：asar 版本、渲染进程产物、原生模块解包、MCP 桥文件
import asar from '@electron/asar'
import fs from 'node:fs'
import path from 'node:path'

const outDir = process.argv[2] ?? 'dist'
const appDir = path.join(outDir, 'win-unpacked')
const asarFile = path.join(appDir, 'resources/app.asar')

if (!fs.existsSync(asarFile)) {
  console.error('缺少 app.asar:', asarFile)
  process.exit(1)
}

const pkg = JSON.parse(asar.extractFile(asarFile, 'package.json').toString())
const files = asar.listPackage(asarFile)

console.log('asar 版本      :', pkg.version)
console.log('main           :', pkg.main)
console.log('asar 文件数    :', files.length)

const bundle = files.find((f) => /out[\\/]renderer[\\/]assets[\\/]index-.*\.js$/.test(f))
console.log('渲染 bundle    :', bundle ?? '未找到')
if (bundle) {
  const js = asar.extractFile(asarFile, bundle.replace(/^[\\/]/, '')).toString()
  // 1.2.3 修复点：StockDialog 里乐观更新改为先取 activeId
  console.log('包含 activeId  :', js.includes('activeId'))
  console.log('bundle 体积    :', (js.length / 1024).toFixed(0) + ' KB')
}

console.log('原生模块解包   :', fs.existsSync(path.join(appDir, 'resources/app.asar.unpacked/node_modules/better-sqlite3')))
const binDir = path.join(appDir, 'resources/bin')
console.log('MCP 桥文件     :', fs.existsSync(binDir) ? fs.readdirSync(binDir).join(', ') : '缺失')
console.log('图标资源       :', fs.existsSync(path.join(appDir, 'resources/icon.png')))

const exe = fs.readdirSync(outDir).find((f) => f.endsWith('.exe'))
if (exe) {
  const size = fs.statSync(path.join(outDir, exe)).size
  console.log('安装包         :', exe, (size / 1024 / 1024).toFixed(1) + ' MB')
}
