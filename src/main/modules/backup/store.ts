import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 落盘的原始形态：密码只以密文出现，明文不进 settings.json，也不发给渲染进程 */
interface StoredConfig {
  enabled: boolean
  url: string
  username: string
  /** `enc:<base64>` 系统级加密；`raw:<base64>` 系统不支持加密时的降级形态 */
  secret: string
  remoteDir: string
  autoBackup: boolean
  keepCount: number
  lastBackupAt: string | null
  lastBackupFile: string | null
  lastError: string | null
}

/** 给界面的视图模型：永远不含密码，只告诉界面「有没有设过」 */
export interface WebdavStatus {
  configured: boolean
  enabled: boolean
  url: string
  username: string
  hasPassword: boolean
  encrypted: boolean
  remoteDir: string
  autoBackup: boolean
  keepCount: number
  lastBackupAt: string | null
  lastBackupFile: string | null
  lastError: string | null
}

export interface WebdavPatch {
  enabled?: boolean
  url?: string
  username?: string
  /** 不传＝保持原密码；传空字符串＝清除 */
  password?: string
  remoteDir?: string
  autoBackup?: boolean
  keepCount?: number
}

const DEFAULTS: StoredConfig = {
  enabled: false,
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  secret: '',
  remoteDir: 'BoxFlow',
  autoBackup: false,
  keepCount: 7,
  lastBackupAt: null,
  lastBackupFile: null,
  lastError: null
}

let cache: StoredConfig | null = null

function storeFile(): string {
  return join(app.getPath('userData'), 'webdav.json')
}

export function loadConfig(): StoredConfig {
  if (cache) return cache
  const file = storeFile()
  if (!existsSync(file)) {
    cache = { ...DEFAULTS }
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoredConfig>
    cache = { ...DEFAULTS, ...parsed }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

function persist(next: StoredConfig): void {
  const file = storeFile()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  cache = next
}

export function saveConfig(patch: WebdavPatch): WebdavStatus {
  const current = loadConfig()
  const next: StoredConfig = { ...current }

  if (patch.enabled !== undefined) next.enabled = patch.enabled
  if (patch.url !== undefined) next.url = patch.url.trim()
  if (patch.username !== undefined) next.username = patch.username.trim()
  if (patch.remoteDir !== undefined) {
    next.remoteDir = patch.remoteDir.trim().replace(/^\/+|\/+$/g, '')
  }
  if (patch.autoBackup !== undefined) next.autoBackup = patch.autoBackup
  if (patch.keepCount !== undefined) {
    next.keepCount = Math.min(Math.max(Math.round(patch.keepCount), 1), 60)
  }
  if (patch.password !== undefined) {
    next.secret = patch.password ? encrypt(patch.password) : ''
  }

  persist(next)
  return toStatus(next)
}

function encrypt(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(plain).toString('base64')}`
  }
  // 极少数环境（无系统密钥环）降级为 base64，仅避免明文直读，安全性有限
  return `raw:${Buffer.from(plain, 'utf8').toString('base64')}`
}

export function readPassword(): string {
  const { secret } = loadConfig()
  if (!secret) return ''
  const [scheme, payload] = [secret.slice(0, 4), secret.slice(4)]
  try {
    if (scheme === 'enc:') return safeStorage.decryptString(Buffer.from(payload, 'base64'))
    if (scheme === 'raw:') return Buffer.from(payload, 'base64').toString('utf8')
  } catch {
    return ''
  }
  return ''
}

export function isEncrypted(): boolean {
  return loadConfig().secret.startsWith('enc:')
}

export function toStatus(config: StoredConfig = loadConfig()): WebdavStatus {
  return {
    configured: Boolean(config.url && config.username && config.secret),
    enabled: config.enabled,
    url: config.url,
    username: config.username,
    hasPassword: Boolean(config.secret),
    encrypted: config.secret.startsWith('enc:'),
    remoteDir: config.remoteDir,
    autoBackup: config.autoBackup,
    keepCount: config.keepCount,
    lastBackupAt: config.lastBackupAt,
    lastBackupFile: config.lastBackupFile,
    lastError: config.lastError
  }
}

export function recordBackup(file: string): void {
  const current = loadConfig()
  persist({ ...current, lastBackupAt: new Date().toISOString(), lastBackupFile: file, lastError: null })
}

export function recordError(message: string): void {
  const current = loadConfig()
  persist({ ...current, lastError: message })
}
