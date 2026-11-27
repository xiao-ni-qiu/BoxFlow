import { app } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 主进程把当前 MCP 监听信息写到一个固定、可预测的位置，
 * 这样独立运行的 stdio 桥（mcp-bridge.mjs，纯 Node）不需要任何参数就能连上。
 *
 * 直接写进 userData，跟着应用名字走：
 * Windows: %APPDATA%\BoxFlow\mcp-connection.json
 * macOS  : ~/Library/Application Support/BoxFlow/mcp-connection.json
 */
export const DISCOVERY_DIR_NAME = 'BoxFlow'
export const DISCOVERY_FILE_NAME = 'mcp-connection.json'

export function discoveryDir(): string {
  // 这里不放 appData/<固定名>，避免应用改名后桥脚本找不到
  return app.getPath('userData')
}

export function discoveryFile(): string {
  return join(discoveryDir(), DISCOVERY_FILE_NAME)
}

export interface DiscoveryPayload {
  name: string
  port: number
  token: string
  endpoint: string
  transport: 'streamable-http'
  pid: number
  updatedAt: string
}

export function writeDiscovery(port: number, token: string): void {
  try {
    mkdirSync(discoveryDir(), { recursive: true })
    const payload: DiscoveryPayload = {
      name: 'boxflow',
      port,
      token,
      endpoint: `http://127.0.0.1:${port}/mcp`,
      transport: 'streamable-http',
      pid: process.pid,
      updatedAt: new Date().toISOString()
    }
    writeFileSync(discoveryFile(), JSON.stringify(payload, null, 2), 'utf8')
  } catch {
    /* 写不进去不影响主流程 */
  }
}

export function clearDiscovery(): void {
  try {
    rmSync(discoveryFile(), { force: true })
  } catch {
    /* 忽略 */
  }
}
