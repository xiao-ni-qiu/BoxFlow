import { app } from 'electron'
import { mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../../errors'
import { closeDatabase, getDataDir, getDb, initDatabase } from '../../db'
import {
  deleteFile,
  downloadFile,
  ensureDir,
  listFiles,
  testConnection,
  uploadFile,
  WebdavError,
  type RemoteBackup,
  type WebdavAuth
} from './webdav'
import { loadConfig, readPassword, recordBackup, recordError, saveConfig, toStatus } from './store'
import type { WebdavPatch, WebdavStatus } from './store'

export type { WebdavStatus, WebdavPatch }

export interface BackupResult {
  file: string
  bytes: number
  at: string
  pruned: string[]
}

export interface RestoreResult {
  file: string
  safetySnapshot: string
}

export interface TestResult {
  ok: boolean
  message: string
  latencyMs: number
}

const AUTO_BACKUP_INTERVAL_MS = 23 * 60 * 60 * 1000

function requireAuth(): WebdavAuth {
  const config = loadConfig()
  if (!config.url || !config.username || !config.secret) {
    throw new AppError('WEBDAV_NOT_CONFIGURED', '还没有配置 WebDAV：请先填写服务地址、账号与应用密码')
  }
  const password = readPassword()
  if (!password) {
    throw new AppError('WEBDAV_NOT_CONFIGURED', '应用密码无法解密，请重新填写一次')
  }
  return { url: config.url, username: config.username, password }
}

function stamp(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

function tempDir(): string {
  const dir = join(app.getPath('temp'), 'boxflow-backup')
  mkdirSync(dir, { recursive: true })
  return dir
}

function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof WebdavError) return new AppError('WEBDAV_FAILED', error.message)
  return new AppError('WEBDAV_FAILED', error instanceof Error ? error.message : '备份失败')
}

export function status(): WebdavStatus {
  return toStatus()
}

export function save(patch: WebdavPatch): WebdavStatus {
  return saveConfig(patch)
}

export async function test(): Promise<TestResult> {
  const auth = requireAuth()
  const config = loadConfig()
  const started = Date.now()
  try {
    await testConnection(auth, config.remoteDir)
    return { ok: true, message: `连接正常，目标目录 ${config.remoteDir}/ 可写`, latencyMs: Date.now() - started }
  } catch (error) {
    const appError = asAppError(error)
    recordError(appError.message)
    throw appError
  }
}

export async function backupNow(): Promise<BackupResult> {
  const auth = requireAuth()
  const config = loadConfig()
  const name = `boxflow-${stamp()}.db`
  const snapshot = join(tempDir(), name)

  try {
    // SQLite 在线备份：一致性快照，不阻塞正在进行的读写
    await getDb().backup(snapshot)
    const bytes = statSync(snapshot).size
    if (bytes > 256 * 1024 * 1024) {
      throw new AppError('WEBDAV_FAILED', '数据库超过 256 MB，整库上传容易中断，建议改用「打开数据目录」手动拷贝')
    }
    const content = readFileSync(snapshot)

    await ensureDir(auth, config.remoteDir)
    await uploadFile(auth, config.remoteDir, name, content)

    const pruned = await prune(auth, config.remoteDir, Math.max(config.keepCount, 1))
    recordBackup(name)

    return { file: name, bytes, at: new Date().toISOString(), pruned }
  } catch (error) {
    const appError = asAppError(error)
    recordError(appError.message)
    throw appError
  } finally {
    rmSync(snapshot, { force: true })
  }
}

/** 只保留最近 keep 份自己的备份，其余按时间从旧到新删除；用户自己放进去的 .db 一律不碰 */
async function prune(auth: WebdavAuth, dir: string, keep: number): Promise<string[]> {
  const files = await listFiles(auth, dir)
  const ours = files.filter((file) => file.name.startsWith('boxflow-'))
  const overflow = ours.slice(keep)
  for (const file of overflow) {
    await deleteFile(auth, dir, file.name)
  }
  return overflow.map((file) => file.name)
}

export async function listRemote(): Promise<RemoteBackup[]> {
  const auth = requireAuth()
  return listFiles(auth, loadConfig().remoteDir)
}

export async function restore(name: string): Promise<RestoreResult> {
  if (!/^[A-Za-z0-9._-]+\.db$/.test(name)) {
    throw new AppError('VALIDATION_FAILED', '备份文件名不合法')
  }
  const auth = requireAuth()
  const config = loadConfig()

  let content: Buffer
  try {
    content = await downloadFile(auth, config.remoteDir, name)
  } catch (error) {
    throw asAppError(error)
  }

  // 只接受真正的 SQLite 文件，避免把损坏或错位的文件盖到主库上
  if (content.subarray(0, 16).toString('utf8') !== 'SQLite format 3\u0000') {
    throw new AppError('WEBDAV_FAILED', '下载到的文件不是有效的 SQLite 数据库')
  }

  const dataDir = getDataDir()
  const mainDb = join(dataDir, 'inventory.db')
  const safetyDir = join(dataDir, 'backups')
  mkdirSync(safetyDir, { recursive: true })
  const safetySnapshot = join(safetyDir, `pre-restore-${stamp()}.db`)

  // 覆盖前先给当前数据留一份，恢复错了还能退回去
  await getDb().backup(safetySnapshot)
  closeDatabase()

  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${mainDb}${suffix}`
    if (existsSync(sidecar)) unlinkSync(sidecar)
  }
  writeFileSync(mainDb, content)
  initDatabase(dataDir)

  return { file: name, safetySnapshot }
}

/** 每日一次自动备份：启动后调用，不满足条件就静默跳过 */
export async function autoBackupIfDue(): Promise<void> {
  const config = loadConfig()
  if (!config.enabled || !config.autoBackup) return
  if (!config.url || !config.username || !config.secret) return
  if (config.lastBackupAt) {
    const elapsed = Date.now() - Date.parse(config.lastBackupAt)
    if (Number.isFinite(elapsed) && elapsed < AUTO_BACKUP_INTERVAL_MS) return
  }
  try {
    await backupNow()
  } catch {
    // 自动备份失败只在设置页展示 lastError，不打扰用户
  }
}
