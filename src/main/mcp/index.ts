import { app } from 'electron'
import { join } from 'node:path'
import { loadSettings } from '../settings'
import { listTools } from './tools'
import { startMcpServer, type McpServerHandle } from './server'
import { clearDiscovery, writeDiscovery } from './discovery'
import { resourcePath } from '../paths'

export interface McpStatus {
  running: boolean
  enabled: boolean
  port: number
  endpoint: string
  healthUrl: string
  bridgePath: string
  toolCount: number
  error: string | null
  version: string
}

let handle: McpServerHandle | null = null
let lastError: string | null = null
let starting: Promise<void> | null = null

function appVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}

/** 供界面在 AI 写入数据后刷新列表 */
let activityListener: (() => void) | null = null

export function onMcpActivity(listener: () => void): void {
  activityListener = listener
}

/** stdio 桥脚本的真实路径，设置页会展示给用户放进客户端配置 */
export function bridgeScriptPath(): string {
  return join(resourcePath('bin'), 'mcp-bridge.mjs')
}

export function mcpStatus(): McpStatus {
  const settings = loadSettings()
  return {
    running: handle !== null,
    enabled: settings.mcpEnabled !== false,
    port: settings.mcpPort,
    endpoint: `http://127.0.0.1:${settings.mcpPort}/mcp`,
    healthUrl: `http://127.0.0.1:${settings.mcpPort}/health`,
    bridgePath: bridgeScriptPath(),
    toolCount: listTools().length,
    error: lastError,
    version: appVersion()
  }
}

async function boot(): Promise<void> {
  const settings = loadSettings()

  if (settings.mcpEnabled === false) {
    lastError = null
    clearDiscovery()
    return
  }

  try {
    handle = await startMcpServer({
      port: settings.mcpPort,
      token: settings.mcpToken,
      version: appVersion(),
      onActivity: () => activityListener?.()
    })
    writeDiscovery(settings.mcpPort, settings.mcpToken)
    lastError = null
    process.stdout.write(`MCP:listening on 127.0.0.1:${settings.mcpPort}\n`)
  } catch (err) {
    handle = null
    clearDiscovery()
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EADDRINUSE') {
      lastError = `端口 ${settings.mcpPort} 已被其他程序占用，请在设置中改用其他端口`
    } else {
      lastError = (err as Error).message || '启动失败'
    }
    process.stdout.write(`MCP:failed ${lastError}\n`)
  }
}

export async function startMcp(): Promise<McpStatus> {
  if (starting) await starting
  if (handle) return mcpStatus()

  starting = boot().finally(() => {
    starting = null
  })
  await starting
  return mcpStatus()
}

export async function stopMcp(): Promise<void> {
  if (!handle) return
  const current = handle
  handle = null
  await current.close().catch(() => undefined)
}

/** 端口 / 令牌 / 开关变更后重建服务 */
export async function restartMcp(): Promise<McpStatus> {
  await stopMcp()
  lastError = null
  return startMcp()
}

export async function disposeMcp(): Promise<void> {
  await stopMcp()
  clearDiscovery()
}
