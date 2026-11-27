import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { AppSettings } from '@shared/types'
import { DEFAULT_MCP_PORT } from '@shared/constants'

let cache: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function defaultDataDir(): string {
  return join(app.getPath('userData'), 'data')
}

function defaults(): AppSettings {
  return {
    dataDir: defaultDataDir(),
    mcpPort: DEFAULT_MCP_PORT,
    mcpToken: randomBytes(24).toString('hex'),
    mcpEnabled: true,
    minimizeToTray: true,
    closeToTray: true,
    launchAtLogin: false,
    fontFamily: 'misans'
  }
}

export function loadSettings(): AppSettings {
  if (cache) return cache
  const file = settingsFile()
  const base = defaults()
  if (!existsSync(file)) {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file, JSON.stringify(base, null, 2), 'utf8')
    cache = base
    return base
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
    cache = { ...base, ...parsed }
    if (!cache.mcpToken) cache.mcpToken = base.mcpToken
    return cache
  } catch {
    cache = base
    return base
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const next: AppSettings = { ...current, ...patch }
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  cache = next
  return next
}

export function applyLoginItem(launchAtLogin: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: launchAtLogin,
    path: process.execPath,
    args: ['--hidden']
  })
}
