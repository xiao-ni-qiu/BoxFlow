import { AppError } from '../errors'
import type { AppSettings } from '@shared/types'

export function assertSettingsPatch(payload: Record<string, unknown>): Partial<AppSettings> {
  const patch: Partial<AppSettings> = {}

  if ('dataDir' in payload) {
    const value = String(payload.dataDir ?? '').trim()
    if (!value) throw new AppError('VALIDATION_FAILED', '数据目录不能为空')
    patch.dataDir = value
  }
  if ('mcpPort' in payload) {
    const port = Number(payload.mcpPort)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new AppError('VALIDATION_FAILED', '端口必须在 1024 - 65535 之间')
    }
    patch.mcpPort = port
  }
  if ('mcpEnabled' in payload) patch.mcpEnabled = Boolean(payload.mcpEnabled)
  if ('minimizeToTray' in payload) patch.minimizeToTray = Boolean(payload.minimizeToTray)
  if ('closeToTray' in payload) patch.closeToTray = Boolean(payload.closeToTray)
  if ('launchAtLogin' in payload) patch.launchAtLogin = Boolean(payload.launchAtLogin)
  if ('fontFamily' in payload) {
    const value = String(payload.fontFamily ?? '').trim()
    if (!value) throw new AppError('VALIDATION_FAILED', '字体不能为空')
    patch.fontFamily = value
  }

  return patch
}

export interface WebdavPatchInput {
  enabled?: boolean
  url?: string
  username?: string
  password?: string
  remoteDir?: string
  autoBackup?: boolean
  keepCount?: number
}

export function assertWebdavPatch(payload: Record<string, unknown>): WebdavPatchInput {
  const patch: WebdavPatchInput = {}

  if ('url' in payload) {
    const url = String(payload.url ?? '').trim()
    if (!url) throw new AppError('VALIDATION_FAILED', '服务地址不能为空')
    if (!/^https?:\/\//i.test(url)) {
      throw new AppError('VALIDATION_FAILED', '服务地址必须以 http:// 或 https:// 开头')
    }
    patch.url = url
  }
  if ('username' in payload) patch.username = String(payload.username ?? '').trim()
  if ('password' in payload) patch.password = String(payload.password ?? '')
  if ('remoteDir' in payload) {
    const dir = String(payload.remoteDir ?? '').trim()
    if (!dir) throw new AppError('VALIDATION_FAILED', '远程目录不能为空')
    patch.remoteDir = dir
  }
  if ('enabled' in payload) patch.enabled = Boolean(payload.enabled)
  if ('autoBackup' in payload) patch.autoBackup = Boolean(payload.autoBackup)
  if ('keepCount' in payload) {
    const keep = Number(payload.keepCount)
    if (!Number.isInteger(keep) || keep < 1 || keep > 60) {
      throw new AppError('VALIDATION_FAILED', '保留份数必须在 1 - 60 之间')
    }
    patch.keepCount = keep
  }

  return patch
}
