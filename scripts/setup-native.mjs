import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ELECTRON_MIRROR = process.env.ELECTRON_MIRROR ?? 'https://cdn.npmmirror.com/binaries/electron'
const BS3_MIRROR =
  process.env.BETTER_SQLITE3_MIRROR ?? 'https://cdn.npmmirror.com/binaries/better-sqlite3'

function log(message) {
  process.stdout.write(`[setup-native] ${message}\n`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function download(url, target) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`下载失败 ${response.status} ${url}`)
  writeFileSync(target, Buffer.from(await response.arrayBuffer()))
}

async function ensureElectron() {
  const electronDir = join(process.cwd(), 'node_modules', 'electron')
  if (!existsSync(electronDir)) {
    log('未安装 electron，跳过')
    return null
  }

  const version = readJson(join(electronDir, 'package.json')).version
  const distDir = join(electronDir, 'dist')
  const exe = join(distDir, 'electron.exe')

  if (!existsSync(exe)) {
    log(`下载 Electron ${version} 运行时…`)
    const zip = join(electronDir, 'electron.zip')
    await download(`${ELECTRON_MIRROR}/${version}/electron-v${version}-win32-x64.zip`, zip)
    mkdirSync(distDir, { recursive: true })
    execFileSync('tar', ['-xf', 'electron.zip', '-C', 'dist'], { cwd: electronDir, stdio: 'inherit' })
    rmSync(zip, { force: true })
    writeFileSync(join(electronDir, 'path.txt'), 'electron.exe', 'utf8')
    log('Electron 运行时就绪')
  }

  return { electronDir, distDir, exe, version }
}

function readElectronAbi(exe) {
  const output = execFileSync(exe, ['-p', 'process.versions.modules'], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  return output.trim()
}

async function ensureBetterSqlite3(abi) {
  const moduleDir = join(process.cwd(), 'node_modules', 'better-sqlite3')
  if (!existsSync(moduleDir)) {
    log('未安装 better-sqlite3，跳过')
    return
  }

  const version = readJson(join(moduleDir, 'package.json')).version
  const releaseDir = join(moduleDir, 'build', 'Release')
  const target = join(releaseDir, 'better_sqlite3.node')

  log(`获取 better-sqlite3 ${version} 的 Electron ABI ${abi} 预编译模块…`)
  const work = mkdtempSync(join(tmpdir(), 'bs3-'))
  const tarball = join(work, 'prebuild.tar.gz')
  await download(
    `${BS3_MIRROR}/v${version}/better-sqlite3-v${version}-electron-v${abi}-win32-x64.tar.gz`,
    tarball
  )
  mkdirSync(join(work, 'unpacked'), { recursive: true })
  execFileSync('tar', ['-xzf', 'prebuild.tar.gz', '-C', 'unpacked'], {
    cwd: work,
    stdio: 'inherit'
  })

  const built = join(work, 'unpacked', 'build', 'Release', 'better_sqlite3.node')
  if (!existsSync(built)) throw new Error('预编译包内未找到 better_sqlite3.node')

  mkdirSync(releaseDir, { recursive: true })
  copyFileSync(built, target)
  rmSync(work, { recursive: true, force: true })
  log('better-sqlite3 已匹配 Electron ABI')
}

async function main() {
  try {
    const electron = await ensureElectron()
    if (!electron) return
    const abi = readElectronAbi(electron.exe)
    await ensureBetterSqlite3(abi)
    log('原生依赖准备完成')
  } catch (error) {
    log(`自动准备失败：${error instanceof Error ? error.message : String(error)}`)
    log('可手动执行：npx @electron/rebuild -f -w better-sqlite3')
  }
}

await main()
