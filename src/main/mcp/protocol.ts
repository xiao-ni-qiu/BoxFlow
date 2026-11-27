/**
 * 最小可用的 MCP（Model Context Protocol）报文定义。
 * 只实现 tools 能力，足够 WorkBuddy / Codex / 豆包 等客户端驱动本程序。
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18'
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

export const SERVER_NAME = 'boxflow'
export const SERVER_TITLE = 'BoxFlow 库存管理'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0'
  id: string | number | null
  result: unknown
}

export interface JsonRpcFailure {
  jsonrpc: '2.0'
  id: string | number | null
  error: { code: number; message: string; data?: unknown }
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

/** JSON-RPC 标准错误码 */
export const RpcError = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** MCP 自定义：鉴权失败 */
  unauthorized: -32001
} as const

export interface ToolContent {
  type: 'text'
  text: string
}

export interface ToolResult {
  content: ToolContent[]
  isError?: boolean
  /** 结构化结果，方便支持 structuredContent 的客户端直接取值 */
  structuredContent?: Record<string, unknown>
}

export interface ToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export function success(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result }
}

export function failure(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcFailure {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } }
}

/** 把任意值序列化成适合喂给模型的紧凑文本 */
export function textResult(payload: unknown, note?: string): ToolResult {
  // 提示语不能拼在 JSON 外面，否则客户端无法解析文本内容；
  // 统一塞进 payload 的 notice 字段，保证 content[0].text 始终是合法 JSON。
  let value = payload
  if (
    note &&
    payload !== null &&
    typeof payload === 'object' &&
    !Array.isArray(payload)
  ) {
    value = { ...(payload as Record<string, unknown>), notice: note }
  }

  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return {
    content: [{ type: 'text', text: body }],
    structuredContent:
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : { data: value }
  }
}

export function errorResult(message: string, code?: string): ToolResult {
  return {
    content: [{ type: 'text', text: code ? `[${code}] ${message}` : message }],
    isError: true
  }
}
