import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeDatabase, getDataDir, initDatabase } from './db'
import { seedExtraKinds, seedIfEmpty } from './db/seed'
import { applyLoginItem, loadSettings } from './settings'
import { createMainWindow } from './window'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc'
import { disposeMcp, onMcpActivity, startMcp } from './mcp'
import { autoBackupIfDue } from './modules/backup/service'
import { installCrashHandlers, logMain } from './crashlog'

const isScreenshotMode = process.argv.includes('--screenshot')
const startHidden = process.argv.includes('--hidden')

let mainWindow: BrowserWindow | null = null
let quitting = false

if (isScreenshotMode) {
  app.disableHardwareAcceleration()
}

app.setAppUserModelId('com.pcxx.boxflow')
installCrashHandlers()

/** 改名前的 userData 目录，用于把老用户的设置接过来 */
const LEGACY_USER_DATA = ['InventoryManager', 'inventory-manager']

function migrateLegacyUserData(): void {
  const target = app.getPath('userData')
  const targetSettings = join(target, 'settings.json')
  if (existsSync(targetSettings)) return

  const appData = app.getPath('appData')
  for (const name of LEGACY_USER_DATA) {
    const legacySettings = join(appData, name, 'settings.json')
    if (!existsSync(legacySettings)) continue
    try {
      mkdirSync(target, { recursive: true })
      copyFileSync(legacySettings, targetSettings)
      logMain('migrate', `沿用旧配置 ${legacySettings}`)
    } catch (err) {
      logMain('migrate', err)
    }
    return
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  logMain('singleInstance', '已有实例在运行，本进程退出')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    logMain('boot', `启动 version=${app.getVersion()} packaged=${app.isPackaged} userData=${app.getPath('userData')}`)

    migrateLegacyUserData()
    const settings = loadSettings()
    logMain('boot', `dataDir=${settings.dataDir}`)

    initDatabase(settings.dataDir)
    seedIfEmpty()
    seedExtraKinds()
    applyLoginItem(settings.launchAtLogin)
    logMain('boot', '数据库就绪')

    registerIpcHandlers(() => mainWindow)

    mainWindow = createMainWindow(startHidden)
    logMain('boot', '窗口已创建')

    mainWindow.on('close', (event) => {
      const live = loadSettings()
      if (!quitting && live.closeToTray) {
        event.preventDefault()
        mainWindow?.hide()
      }
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    mainWindow.on('minimize', () => {
      if (loadSettings().minimizeToTray) {
        mainWindow?.hide()
      }
    })

    createTray(
      () => mainWindow,
      () => {
        quitting = true
        app.quit()
      }
    )

    // AI 通过 MCP 写入数据后，通知界面刷新
    onMcpActivity(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('main:message', 'mcp-activity')
      }
    })

    void startMcp()

    // 每日一次的 WebDAV 自动备份：延后 45 秒，避开启动时的数据库与界面初始化
    setTimeout(() => {
      void autoBackupIfDue()
    }, 45_000)

    if (isScreenshotMode) {
      captureAndExit(mainWindow)
    }
  }).catch((err) => {
    // 初始化失败时进程还活着但没窗口，必须留下线索
    logMain('whenReady', err)
  })

  app.on('before-quit', () => {
    quitting = true
    void disposeMcp()
    closeDatabase()
  })

  app.on('window-all-closed', () => {
    const settings = loadSettings()
    if (!settings.closeToTray) {
      quitting = true
      app.quit()
    }
  })
}

function captureAndExit(win: BrowserWindow): void {
  // 调试用：--shot-delay=9000 可延后截图，便于在窗口存活期间验证联动行为
  const delayArg = process.argv.find((arg) => arg.startsWith('--shot-delay='))
  const delay = delayArg ? Math.max(Number(delayArg.slice('--shot-delay='.length)) || 0, 500) : 3500

  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        // 调试用：--eval-file=xxx.js 先执行一段脚本，便于把复杂场景注入界面再截图
        const evalArg = process.argv.find((arg) => arg.startsWith('--eval-file='))
        if (evalArg) {
          const scriptPath = evalArg.slice('--eval-file='.length)
          if (existsSync(scriptPath)) {
            const code = readFileSync(scriptPath, 'utf8')
            const returned = await win.webContents.executeJavaScript(code)
            process.stdout.write(`EVAL:${JSON.stringify(returned)?.slice(0, 800)}\n`)
            await new Promise((resolve) => setTimeout(resolve, 900))
          } else {
            process.stdout.write(`EVAL_MISSING:${scriptPath}\n`)
          }
        }

        const clickArg = process.argv.find((arg) => arg.startsWith('--click='))
        if (clickArg) {
          const steps = clickArg.slice('--click='.length).split('|')
          for (const step of steps) {
            await win.webContents.executeJavaScript(step)
            await new Promise((resolve) => setTimeout(resolve, 700))
          }
        }

        const diag = await win.webContents.executeJavaScript(
          `JSON.stringify([...document.querySelectorAll('*')].filter(e => e.scrollTop > 0).map(e => [(e.className && String(e.className).slice(0,40)) || e.tagName, e.scrollTop]))`
        )
        process.stdout.write(`DIAG:${diag}\n`)
        const image = await win.webContents.capturePage()
        // 开发期存进仓库便于比对；打包后 app 目录是只读的 asar，改存临时目录
        const dir = app.isPackaged
          ? join(app.getPath('temp'), 'boxflow-shots')
          : join(app.getAppPath(), 'docs', 'shots')
        mkdirSync(dir, { recursive: true })
        const file = join(dir, `app-${Date.now()}.png`)
        writeFileSync(file, image.toPNG())
        process.stdout.write(`SCREENSHOT:${file}\n`)
        process.stdout.write(`DATADIR:${getDataDir()}\n`)
      } catch (err) {
        process.stdout.write(`SCREENSHOT_FAILED:${String(err)}\n`)
      } finally {
        quitting = true
        app.exit(0)
      }
    }, delay)
  })
}
