import Database from 'better-sqlite3'
import { mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS } from './migrations'

export type DB = Database.Database

let instance: DB | null = null
let currentDataDir = ''

export function initDatabase(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'inventory.db')

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('cache_size = -65536')
  db.pragma('temp_store = MEMORY')

  runMigrations(db)

  instance = db
  currentDataDir = dataDir
  return db
}

export function getDb(): DB {
  if (!instance) throw new Error('数据库尚未初始化')
  return instance
}

export function getDataDir(): string {
  return currentDataDir
}

export function closeDatabase(): void {
  if (instance) {
    try {
      instance.close()
    } catch {
      /* ignore */
    }
    instance = null
  }
}

function runMigrations(db: DB): void {
  const current = Number(db.pragma('user_version', { simple: true }) ?? 0)
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })
    apply()
  }
}

export async function backupDatabase(targetDir: string): Promise<string> {
  const db = getDb()
  mkdirSync(targetDir, { recursive: true })
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 13)
  const target = join(targetDir, `inventory-${stamp}.db`)
  await db.backup(target)
  return target
}

export function databaseSize(): number {
  const file = join(currentDataDir, 'inventory.db')
  return existsSync(file) ? statSync(file).size : 0
}

export function exportCopy(targetFile: string): void {
  copyFileSync(join(currentDataDir, 'inventory.db'), targetFile)
}
