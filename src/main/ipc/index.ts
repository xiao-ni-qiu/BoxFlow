import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { normalizeKind } from '@shared/constants'
import { componentsService } from '../modules/components/service'
import { suppliersService } from '../modules/suppliers/service'
import { movementsService } from '../modules/movements/service'
import { locationsService } from '../modules/locations/service'
import { AppError, serializeError } from '../errors'
import { backupDatabase, closeDatabase, databaseSize, getDataDir, initDatabase, getDb } from '../db'
import { loadSettings, saveSettings } from '../settings'
import { assertSettingsPatch, assertWebdavPatch } from './validate'
import { mcpStatus, restartMcp } from '../mcp'
import * as webdav from '../modules/backup/service'
import { randomBytes } from 'node:crypto'
import {
  exportEntity,
  exportTemplate,
  pickImportFile,
  previewImport,
  remapPreview,
  runImport
} from './transfer'

type Handler = (payload: unknown) => unknown | Promise<unknown>

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    try {
      const data = await fn(payload)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: serializeError(err) }
    }
  })
}

function asObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  handle(IPC.componentsList, (p) => componentsService.list(asObject(p) as never))
  handle(IPC.componentsGet, (p) => componentsService.get(String(asObject(p).id)))
  handle(IPC.componentsCreate, (p) => componentsService.create(p))
  handle(IPC.componentsUpdate, (p) => {
    const { id, patch } = asObject(p) as { id: string; patch: unknown }
    return componentsService.update(id, patch)
  })
  handle(IPC.componentsArchive, (p) => {
    componentsService.archive(String(asObject(p).id))
    return true
  })
  handle(IPC.componentsRestore, (p) => {
    componentsService.restore(String(asObject(p).id))
    return true
  })
  handle(IPC.componentsFacets, (p) => {
    const { kind } = asObject(p) as { kind?: string }
    return componentsService.facets(kind ? normalizeKind(kind) : undefined)
  })
  handle(IPC.componentsMovements, (p) => {
    const { id, limit } = asObject(p) as { id: string; limit?: number }
    return componentsService.movements(id, limit ?? 20)
  })

  handle(IPC.suppliersList, (p) => suppliersService.list(asObject(p) as never))
  handle(IPC.suppliersGet, (p) => suppliersService.get(String(asObject(p).id)))
  handle(IPC.suppliersCreate, (p) => suppliersService.create(p))
  handle(IPC.suppliersUpdate, (p) => {
    const { id, patch } = asObject(p) as { id: string; patch: unknown }
    return suppliersService.update(id, patch)
  })
  handle(IPC.suppliersArchive, (p) => {
    suppliersService.archive(String(asObject(p).id))
    return true
  })

  handle(IPC.movementsCreate, (p) => movementsService.create(p))
  handle(IPC.movementsList, (p) => movementsService.list(asObject(p) as never))

  handle(IPC.locationsTree, () => locationsService.tree())
  handle(IPC.locationsCreate, (p) => locationsService.create(p))
  handle(IPC.locationsUpdate, (p) => locationsService.update(p))
  handle(IPC.locationsDelete, (p) => locationsService.remove(p))

  handle(IPC.stats, () => ({
    ...componentsService.stats(),
    lowStock: componentsService.lowStock(8),
    suppliers: suppliersService.allActive().slice(0, 6)
  }))

  handle(IPC.transferExport, (p) => exportEntity(getWindow, asObject(p) as never))
  handle(IPC.transferTemplate, (p) => exportTemplate(getWindow, asObject(p) as never))
  handle(IPC.transferPickFile, () => pickImportFile(getWindow))
  handle(IPC.transferPreview, (p) => previewImport(asObject(p) as never))
  handle(IPC.transferRemap, (p) => remapPreview(asObject(p) as never))
  handle(IPC.transferRun, (p) => runImport(asObject(p) as never))

  handle(IPC.mcpStatus, () => mcpStatus())
  handle(IPC.mcpRestart, async () => restartMcp())

  handle(IPC.mcpRotateToken, async () => {
    saveSettings({ mcpToken: randomBytes(24).toString('hex') })
    return restartMcp()
  })

  handle(IPC.settingsGet, () => loadSettings())

  handle(IPC.settingsUpdate, async (p) => {
    const patch = assertSettingsPatch(asObject(p))
    const current = loadSettings()

    if (patch.dataDir && patch.dataDir !== current.dataDir) {
      const targetDir = patch.dataDir
      mkdirSync(targetDir, { recursive: true })
      const targetDb = join(targetDir, 'inventory.db')
      if (!existsSync(targetDb)) {
        const sourceDb = join(getDataDir(), 'inventory.db')
        if (existsSync(sourceDb)) {
          getDb().pragma('wal_checkpoint(TRUNCATE)')
          closeDatabase()
          cpSync(sourceDb, targetDb)
          const filesDir = join(getDataDir(), 'files')
          if (existsSync(filesDir)) cpSync(filesDir, join(targetDir, 'files'), { recursive: true })
        } else {
          closeDatabase()
        }
        initDatabase(targetDir)
      } else {
        closeDatabase()
        initDatabase(targetDir)
      }
    }

    const next = saveSettings(patch)

    // 端口 / 令牌 / 开关变更需要重建监听
    if (patch.mcpPort !== undefined || patch.mcpEnabled !== undefined) {
      await restartMcp()
    }

    return next
  })

  handle(IPC.settingsPickDataDir, async () => {
    const win = getWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: '选择数据存放目录' })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: '选择数据存放目录' })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  handle(IPC.settingsOpenDataDir, async () => {
    await shell.openPath(getDataDir())
    return true
  })

  handle(IPC.settingsBackupNow, async () => {
    const target = await backupDatabase(join(getDataDir(), 'backups'))
    return { path: target }
  })

  handle(IPC.settingsResetDemo, () => {
    const db = getDb()
    const run = db.transaction(() => {
      db.exec('DELETE FROM stock_movements; DELETE FROM attachments; DELETE FROM components;')
      db.exec('DELETE FROM suppliers; DELETE FROM storage_locations;')
    })
    run()
    return true
  })

  handle(IPC.webdavStatus, () => webdav.status())
  handle(IPC.webdavSave, (p) => webdav.save(assertWebdavPatch(asObject(p))))
  handle(IPC.webdavTest, () => webdav.test())
  handle(IPC.webdavBackup, () => webdav.backupNow())
  handle(IPC.webdavList, () => webdav.listRemote())
  handle(IPC.webdavRestore, (p) => webdav.restore(String(asObject(p).name ?? '')))

  handle(IPC.appInfo, () => {
    const db = getDb()
    const countOf = (table: string): number => {
      try {
        const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n?: number } | undefined
        return Number(row?.n ?? 0)
      } catch {
        return 0
      }
    }
    return {
      name: 'BoxFlow',
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8,
      platform: `${process.platform} ${process.arch}`,
      packaged: app.isPackaged,
      dataDir: getDataDir(),
      userData: app.getPath('userData'),
      dbBytes: databaseSize(),
      counts: {
        components: countOf('components'),
        suppliers: countOf('suppliers'),
        movements: countOf('stock_movements'),
        locations: countOf('storage_locations')
      }
    }
  })

  handle(IPC.appOpenExternal, async (p) => {
    const url = String(asObject(p).url ?? '')
    // 只放行项目自己的两个站点，避免 IPC 变成任意 URL 打开器
    if (!/^https:\/\/(github\.com|www\.jianguoyun\.com)\//i.test(url)) {
      throw new AppError('VALIDATION_FAILED', '不允许打开该地址')
    }
    await shell.openExternal(url)
    return true
  })

  handle(IPC.windowMinimize, () => {
    getWindow()?.minimize()
    return true
  })
  handle(IPC.windowMaximize, () => {
    const win = getWindow()
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  handle(IPC.windowClose, () => {
    getWindow()?.close()
    return true
  })
}
