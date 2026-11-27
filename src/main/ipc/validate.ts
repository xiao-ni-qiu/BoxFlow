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

  return patch
}
