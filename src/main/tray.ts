import { app, Menu, nativeImage, Tray, BrowserWindow } from 'electron'
import { resourcePath } from './paths'

let tray: Tray | null = null

export function createTray(getWindow: () => BrowserWindow | null, quit: () => void): void {
  if (tray) return

  const image = nativeImage.createFromPath(resourcePath('tray.png'))
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('BoxFlow · 常驻运行，AI 可随时读写库存')

  const showWindow = (): void => {
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  const menu = Menu.buildFromTemplate([
    { label: '打开 BoxFlow', click: showWindow },
    { type: 'separator' },
    {
      label: '数据位置',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quit()
      }
    }
  ])

  tray.setContextMenu(menu)
  tray.on('double-click', showWindow)
  tray.on('click', showWindow)

  void app
}
