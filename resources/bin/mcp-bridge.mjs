#!/usr/bin/env node
/**
 * BoxFlow · MCP stdio 桥
 *
 * 把只支持 stdio 传输的 MCP 客户端（Codex CLI、Claude Desktop 等）
 * 接到本机已经运行的「BoxFlow」桌面程序上。
 *
 * 用法（无需任何参数，会自动发现端口与令牌）：
 *   node mcp-bridge.mjs
 *
 * 也可显式指定：
 *   node mcp-bridge.mjs --port 8788 --token xxxx
 *
 * 客户端配置示例（Codex / Claude Desktop 的 mcpServers 段）：
 *   "inventory": {
 *     "command": "node",
 *     "args": ["C:/Users/<你的用户名>/AppData/Local/Programs/BoxFlow/resources/bin/mcp-bridge.mjs"]
 *   }
 */

import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_PORT = 8788
const HOST = '127.0.0.1'

/* ------------------------------- 参数解析 ------------------------------- */

function readArg(flag) {
  const index = process.argv.indexOf(flag)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`))
  return inline ? inline.slice(flag.length + 1) : null
}

/** 与主进程约定好的发现文件位置 */
function candidateDiscoveryFiles() {
  const files = []
  if (process.env.BOXFLOW_MCP_DISCOVERY) files.push(process.env.BOXFLOW_MCP_DISCOVERY)
  if (process.env.INVENTORY_MCP_DISCOVERY) files.push(process.env.INVENTORY_MCP_DISCOVERY)

  // 兼容改名前的目录名，老用户的连接配置不用改
  const names = ['BoxFlow', 'boxflow', 'InventoryManager', 'inventory-manager']
  const roots = []
  if (process.platform === 'win32') {
    if (process.env.APPDATA) roots.push(process.env.APPDATA)
    roots.push(join(homedir(), 'AppData', 'Roaming'))
  } else if (process.platform === 'darwin') {
    roots.push(join(homedir(), 'Library', 'Application Support'))
  } else {
    roots.push(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'))
  }

  for (const root of roots) {
    for (const name of names) {
      files.push(join(root, name, 'mcp-connection.json'))
    }
  }
  return files
}

function readDiscovery() {
  for (const file of candidateDiscoveryFiles()) {
    try {
      if (!existsSync(file)) continue
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (parsed && typeof parsed.port === 'number') return parsed
    } catch {
      /* 文件损坏就试下一个 */
    }
  }
  return null
}

function resolveTarget() {
  const envPort = process.env.INVENTORY_MCP_PORT
  const envToken = process.env.INVENTORY_MCP_TOKEN
  const argPort = readArg('--port')
  const argToken = readArg('--token')

  if (argPort || argToken || envPort || envToken) {
    return {
      port: Number(argPort || envPort) || DEFAULT_PORT,
      token: argToken || envToken || ''
    }
  }

  const found = readDiscovery()
  if (found) return { port: found.port, token: found.token }

  return { port: DEFAULT_PORT, token: '' }
}

/* ------------------------------- 日志（走 stderr） ------------------------------- */

function log(message) {
  process.stderr.write(`[mcp-bridge] ${message}\n`)
}

/* ------------------------------- HTTP 转发 ------------------------------- */

let sessionId = null

async function forward(message) {
  const { port, token } = resolveTarget()
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  const response = await fetch(`http://${HOST}:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(message)
  })

  const issued = response.headers.get('mcp-session-id')
  if (issued) sessionId = issued

  if (response.status === 202) return null

  const contentType = response.headers.get('content-type') || ''
  const raw = await response.text()

  if (contentType.includes('text/event-stream')) {
    // 从 SSE 帧里抽出 data 行
    const dataLines = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
    if (!dataLines.length) return null
    return JSON.parse(dataLines[dataLines.length - 1])
  }

  if (!raw) return null
  return JSON.parse(raw)
}

function connectionError(message) {
  const { port } = resolveTarget()
  return {
    jsonrpc: '2.0',
    id: message?.id ?? null,
    error: {
      code: -32000,
      message:
        `无法连接「BoxFlow」MCP 服务（127.0.0.1:${port}）。` +
        '请确认 BoxFlow 已启动，且「设置 → AI 接入」中的 MCP 服务处于运行状态。'
    }
  }
}

/* ------------------------------- stdio 主循环 ------------------------------- */

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

let queue = Promise.resolve()

rl.on('line', (line) => {
  const text = line.trim()
  if (!text) return

  let message
  try {
    message = JSON.parse(text)
  } catch {
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } }) + '\n'
    )
    return
  }

  queue = queue
    .then(async () => {
      try {
        const result = await forward(message)
        if (result !== null && result !== undefined) {
          process.stdout.write(JSON.stringify(result) + '\n')
        }
      } catch (err) {
        log(err?.message || String(err))
        process.stdout.write(JSON.stringify(connectionError(message)) + '\n')
      }
    })
    .catch(() => undefined)
})

rl.on('close', () => {
  queue.finally(() => process.exit(0))
})

log('就绪，等待 MCP 客户端请求')
