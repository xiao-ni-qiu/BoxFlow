import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { SERVER_NAME, SERVER_TITLE, MCP_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from './protocol'
import {
  RpcError,
  failure,
  success,
  type JsonRpcRequest,
  type JsonRpcResponse
} from './protocol'
import { callTool, listTools, type ToolContext } from './tools'

export interface McpServerOptions {
  port: number
  token: string
  version: string
  /** 客户端调用写入流水后用于刷新界面 */
  onActivity?: () => void
}

export interface McpServerHandle {
  port: number
  close: () => Promise<void>
}

interface Session {
  client: string
  createdAt: number
}

const MAX_BODY = 4 * 1024 * 1024

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Token, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    'Cache-Control': 'no-store',
    ...headers
  })
  res.end(body)
}

function sendText(res: ServerResponse, status: number, text: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  })
  res.end(text)
}

function extractToken(req: IncomingMessage): string {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  const header = req.headers['x-mcp-token']
  if (typeof header === 'string' && header.trim()) return header.trim()
  const url = new URL(req.url ?? '/', 'http://localhost')
  return url.searchParams.get('token') ?? ''
}

export async function startMcpServer(options: McpServerOptions): Promise<McpServerHandle> {
  const { port, token, version } = options
  const sessions = new Map<string, Session>()
  /** 兼容旧版 HTTP+SSE 传输：GET /sse 建立的长连接 */
  const sseClients = new Set<ServerResponse>()

  function currentClient(req: IncomingMessage): string {
    const id = req.headers['mcp-session-id']
    if (typeof id === 'string') {
      const session = sessions.get(id)
      if (session) return session.client
    }
    return 'unknown'
  }

  function toolCtx(req: IncomingMessage): ToolContext {
    return { client: currentClient(req) }
  }

  async function dispatch(req: IncomingMessage, message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = message.id ?? null
    const method = message.method
    const params = (message.params ?? {}) as Record<string, unknown>
    const ctx = toolCtx(req)

    switch (method) {
      /* ---------------- 生命周期 ---------------- */
      case 'initialize': {
        const requested = String(params.protocolVersion ?? '')
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : MCP_PROTOCOL_VERSION

        const clientInfo = (params.clientInfo ?? {}) as { name?: string; version?: string }
        const clientName = clientInfo.name || 'unknown'

        const sessionId = randomUUID()
        sessions.set(sessionId, { client: clientName, createdAt: Date.now() })

        const result = {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            logging: {}
          },
          serverInfo: {
            name: SERVER_NAME,
            title: SERVER_TITLE,
            version
          },
          instructions:
            '这是本机运行的 BoxFlow 库存管理程序，统一管理电子元器件、开发板、电子模块、五金与耗材。' +
            '用户要求"添加库存/入库/收货"时优先调用 add_stock（型号不存在会自动建档），' +
            '用 kind 参数指定大类（默认电子元器件）；查询库存用 search_components，可用 kind 过滤；' +
            '修改数量不要用 update_component。数量单位默认"个"。'
        }

        // 通过 result 之外的响应头回传 session，见下方 handler 处理
        ;(result as Record<string, unknown>).__sessionId = sessionId
        return success(id, result)
      }

      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/roots/list_changed':
        return null

      case 'ping':
        return success(id, {})

      /* ---------------- 能力 ---------------- */
      case 'tools/list':
        return success(id, { tools: listTools() })

      case 'tools/call': {
        const name = String(params.name ?? '')
        const args = (params.arguments ?? {}) as Record<string, unknown>
        if (!name) {
          return failure(id, RpcError.invalidParams, '缺少工具名 name')
        }
        const result = callTool(name, args, ctx)
        if (!result.isError) {
          try {
            options.onActivity?.()
          } catch {
            /* 界面刷新失败不影响调用结果 */
          }
        }
        return success(id, result)
      }

      case 'resources/list':
        return success(id, { resources: [] })

      case 'prompts/list':
        return success(id, { prompts: [] })

      default:
        return failure(id, RpcError.methodNotFound, `不支持的方法：${method}`)
    }
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Token, Mcp-Session-Id, Mcp-Protocol-Version',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '86400'
      })
      res.end()
      return
    }

    /* 健康检查不需要鉴权，方便用户/脚本探测服务是否在跑 */
    if (path === '/health') {
      sendJson(res, 200, {
        ok: true,
        name: SERVER_NAME,
        title: SERVER_TITLE,
        version,
        protocolVersion: MCP_PROTOCOL_VERSION,
        tools: listTools().length,
        sessions: sessions.size
      })
      return
    }

    /* 根路径给一段人类可读的接入说明 */
    if (path === '/' && req.method === 'GET') {
      sendText(
        res,
        200,
        [
          `${SERVER_TITLE} MCP 服务运行中`,
          '',
          `端点      : POST http://127.0.0.1:${port}/mcp`,
          `健康检查  : GET  http://127.0.0.1:${port}/health`,
          `协议版本  : ${MCP_PROTOCOL_VERSION}`,
          `已注册工具: ${listTools().length} 个`,
          '',
          '请求需携带 Authorization: Bearer <访问令牌>，令牌可在程序「设置 → AI 接入」中查看。'
        ].join('\n')
      )
      return
    }

    if (path !== '/mcp' && path !== '/sse' && path !== '/message') {
      sendJson(res, 404, { ok: false, error: '未找到该路径' })
      return
    }

    /* ---------------- 鉴权 ---------------- */
    const provided = extractToken(req)
    if (!token) {
      sendJson(res, 503, {
        jsonrpc: '2.0',
        id: null,
        error: { code: RpcError.unauthorized, message: '服务端未配置访问令牌' }
      })
      return
    }
    if (provided !== token) {
      sendJson(res, 401, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: RpcError.unauthorized,
          message: '访问令牌无效，请在程序「设置 → AI 接入」中复制正确的令牌'
        }
      })
      return
    }

    /* ---------------- GET /sse：旧版 SSE 传输 ---------------- */
    if (req.method === 'GET' && (path === '/sse' || path === '/mcp')) {
      const accept = String(req.headers.accept ?? '')
      if (!accept.includes('text/event-stream')) {
        sendJson(res, 405, {
          ok: false,
          error: '请使用 POST /mcp 提交 JSON-RPC 请求，或附带 Accept: text/event-stream 建立 SSE 通道'
        })
        return
      }
      const sessionId = randomUUID()
      sessions.set(sessionId, { client: 'sse', createdAt: Date.now() })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })
      res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`)
      sseClients.add(res)
      const keepAlive = setInterval(() => {
        try {
          res.write(': ping\n\n')
        } catch {
          /* 忽略 */
        }
      }, 25000)
      req.on('close', () => {
        clearInterval(keepAlive)
        sseClients.delete(res)
      })
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: '仅支持 POST' })
      return
    }

    /* ---------------- POST：JSON-RPC ---------------- */
    let raw: string
    try {
      raw = await readBody(req)
    } catch (err) {
      sendJson(res, 413, {
        jsonrpc: '2.0',
        id: null,
        error: { code: RpcError.parse, message: (err as Error).message }
      })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw || 'null')
    } catch {
      sendJson(res, 400, failure(null, RpcError.parse, '请求体不是合法 JSON'))
      return
    }

    const isBatch = Array.isArray(parsed)
    const messages: JsonRpcRequest[] = isBatch ? (parsed as JsonRpcRequest[]) : [parsed as JsonRpcRequest]

    if (!messages.length) {
      sendJson(res, 400, failure(null, RpcError.invalidRequest, '空请求'))
      return
    }

    const responses: JsonRpcResponse[] = []
    let sessionIdOut: string | null = null

    for (const message of messages) {
      if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        responses.push(failure(message?.id ?? null, RpcError.invalidRequest, '不是合法的 JSON-RPC 2.0 请求'))
        continue
      }
      const response = await dispatch(req, message)
      if (!response) continue

      const result =
        'result' in response ? (response.result as Record<string, unknown> | undefined) : undefined
      if (result && typeof result === 'object' && '__sessionId' in result) {
        sessionIdOut = String(result.__sessionId)
        delete result.__sessionId
      }
      responses.push(response)
    }

    const headers: Record<string, string> = {}
    if (sessionIdOut) headers['Mcp-Session-Id'] = sessionIdOut

    /* 全部是通知时按规范返回 202 */
    if (!responses.length) {
      res.writeHead(202, { 'Access-Control-Allow-Origin': '*', ...headers })
      res.end()
      return
    }

    const payload = isBatch ? responses : responses[0]

    const accept = String(req.headers.accept ?? '')
    const wantsSse = accept.includes('text/event-stream') && !accept.includes('application/json')
    if (wantsSse) {
      const body = `event: message\ndata: ${JSON.stringify(payload)}\n\n`
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id',
        ...headers
      })
      res.end(body)
      return
    }

    sendJson(res, 200, payload, headers)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of sseClients) {
          try {
            client.end()
          } catch {
            /* 忽略 */
          }
        }
        sseClients.clear()
        sessions.clear()
        server.close(() => resolve())
        // 兜底：连接可能被 keep-alive 挂住
        setTimeout(resolve, 1500).unref?.()
      })
  }
}
