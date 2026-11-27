import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { resourcePath } from './paths'

export function createMainWindow(hidden = false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#FAFAF9',
    title: 'BoxFlow',
    icon: resourcePath('icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  const pushState = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send('window:state', { maximized: win.isMaximized() })
    }
  }

  win.on('maximize', pushState)
  win.on('unmaximize', pushState)

  win.once('ready-to-show', () => {
    if (!hidden) {
      win.show()
    }
    // 初始状态也推一次，避免渲染端默认值与实际窗口状态不一致
    pushState()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const isDevServer = process.env['ELECTRON_RENDERER_URL']?.startsWith(url)
    if (!isDevServer) event.preventDefault()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const viewArg = process.argv.find((arg) => arg.startsWith('--view='))
  const hash = viewArg ? viewArg.slice('--view='.length) : undefined

  if (devUrl) {
    void win.loadURL(hash ? `${devUrl}#${hash}` : devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }

  return win
}
