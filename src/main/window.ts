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

  win.once('ready-to-show', () => {
    if (!hidden) {
      win.show()
    }
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
