import { TOOLS, callTool, type ToolContext } from '../../mcp/tools'
import type { ToolSchema } from './client'

/**
 * 内置助手复用 MCP 的工具实现，不另写一套库存逻辑。
 * 这样界面、外部 AI、内置助手三条路径改的是同一批 service，
 * 业务规则（重复校验、负库存拦截、位置自动建档）只有一份。
 */

/** 给助手的工具集：只读查询 + 增减 + 建档/改档，故意不含归档与删除 */
const ASSISTANT_TOOLS = [
  'search_components',
  'get_component',
  'list_low_stock',
  'list_movements',
  'list_locations',
  'get_stats',
  'list_suppliers',
  'add_supplier',
  'add_stock',
  'bulk_add_stock',
  'remove_stock',
  'set_stock',
  'update_component'
]

/** 会改动库存或档案的工具，开启「执行前确认」时先问用户 */
export const WRITE_TOOLS = new Set([
  'add_stock',
  'bulk_add_stock',
  'remove_stock',
  'set_stock',
  'add_supplier',
  'update_component'
])

const TITLES = new Map(TOOLS.map((tool) => [tool.name, tool.title ?? tool.name]))

export function assistantToolSchemas(): ToolSchema[] {
  return TOOLS.filter((tool) => ASSISTANT_TOOLS.includes(tool.name)).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }))
}

export function toolTitle(name: string): string {
  return TITLES.get(name) ?? name
}

export interface ToolExecution {
  ok: boolean
  /** 一句话结果，直接贴在工具卡片上 */
  summary: string
  /** 完整结果，作为 tool 消息回喂给模型 */
  text: string
}

function summarize(name: string, args: Record<string, unknown>, raw: Record<string, unknown> | undefined): string {
  if (raw) {
    if (typeof raw.message === 'string' && raw.message.trim()) return raw.message.trim()
    if (raw.ok === false && typeof raw.error === 'string') return raw.error
  }
  const part = args.partNumber ? String(args.partNumber) : ''
  const qty = args.quantity !== undefined ? ` ${String(args.quantity)}` : ''
  const items = Array.isArray(args.items) ? ` ${args.items.length} 条` : ''
  return `${name}${part ? ` ${part}` : ''}${qty}${items}`
}

export function executeAssistantTool(name: string, args: Record<string, unknown>): ToolExecution {
  const ctx: ToolContext = { client: 'assistant', channel: 'ai' }
  const result = callTool(name, args, ctx)
  const text = result.content
    .map((part) => part.text)
    .join('\n')
    .slice(0, 12000)

  const structured = result.structuredContent
  if (result.isError) {
    return { ok: false, summary: summarize(name, args, structured) || text.slice(0, 200), text }
  }

  return { ok: true, summary: summarize(name, args, structured), text }
}
