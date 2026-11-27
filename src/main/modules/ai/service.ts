import { app, type BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  findProvider,
  type AiChatMessage,
  type AiConfigPatch,
  type AiConfigView,
  type AiConversation,
  type AiEvent,
  type AiSendPayload,
  type AiTestResult,
  type AiToolTrace,
  type ParsedReport
} from '@shared/ai'
import { AppError } from '../../errors'
import { ITEM_KINDS, KIND_META } from '@shared/constants'
import { newId } from '../../ids'
import { componentsService } from '../components/service'
import { parseSheet } from '../transfer/import'
import { loadConfig, readApiKey, rememberConversation, saveConfig, toView } from './store'
import { conversationsRepo } from './conversations'
import { streamChat, testConnection, type ChatMessage, type ChatToolCall } from './client'
import {
  assistantToolSchemas,
  executeAssistantTool,
  toolTitle,
  WRITE_TOOLS
} from './tools'

export const AI_EVENT_CHANNEL = 'ai:event'

/** 一轮对话最多允许几次工具往返，防止模型来回打转 */
const MAX_STEPS = 6
/** 等待用户点「执行」的最长时间 */
const CONFIRM_TIMEOUT_MS = 5 * 60 * 1000
/** 历史上下文最多带多少条消息 */
const HISTORY_LIMIT = 24

interface ActiveRun {
  controller: AbortController
  window: BrowserWindow | null
}

let activeRun: ActiveRun | null = null
const pendingConfirms = new Map<string, (approved: boolean) => void>()

function emit(window: BrowserWindow | null, event: AiEvent): void {
  if (!window || window.isDestroyed()) return
  window.webContents.send(AI_EVENT_CHANNEL, event)
}

/* ------------------------------ 系统提示词 ------------------------------ */

function systemPrompt(): string {
  const config = loadConfig()
  let brief = '（尚未读取到库存）'
  try {
    const stats = componentsService.stats()
    brief = `${stats.skuCount} 种物料，总量 ${stats.totalQuantity}，低于安全库存 ${stats.lowStockCount} 种`
  } catch {
    /* 数据库还没就绪时不影响对话 */
  }

  const kinds = ITEM_KINDS.map((kind) => KIND_META[kind].label).join(' / ')
  const now = new Date().toLocaleString('zh-CN', { hour12: false })

  return [
    '你是 BoxFlow 的内置库存助手，运行在用户本机的桌面库存软件里。你可以查询和修改本机库存，也能回答一般性的技术问题与常识问题。',
    '',
    '## 数据模型',
    `- 物料分五大类：${kinds}，共用一张表，用 kind 区分。`,
    '- 关键字段：型号 partNumber、厂商 manufacturer、分类 category、封装/尺寸 package、库存 quantity、单位 unit、安全库存 safetyStock、存放位置编码 locationCode（形如 A-01-03）、供应商 supplierName、单价 unitPrice。',
    '- 每次出入库都会留一条流水，来源记为 ai:assistant，用户能在「出入库流水」里看到。',
    '',
    '## 工作纪律',
    '1. 涉及具体物料时先查证：用 search_components 或 get_component，不要凭印象报数字。',
    '2. 入库、到货、补货、增加 → add_stock；出库、领用、消耗、扣减 → remove_stock；盘点、改成、修正为 → set_stock。',
    '3. 一次处理多行清单用 bulk_add_stock，不要反复单条调用。',
    '4. 型号对不上就如实说「没找到」，并给出最接近的候选让用户确认；绝不自己编造型号直接入库。',
    '5. 改库存必须真的调用工具，不要在文字里假装已经改好。',
    '6. 你没有删除物料的权限。用户要删除时，告诉他到物料页选中该条 → 点删除。',
    '7. 拿不准的操作先问一句，比改错数据好。',
    '',
    '## 报表处理',
    '用户可能粘贴表格文本，或上传 Excel/CSV（已转成制表符分隔的文本）。请按这个顺序处理：',
    '1. 先识别表头，判断哪一列是型号、哪一列是数量（也可能是「入库数量」「出库数量」「结存」）。',
    '2. 逐行核对型号是否存在，能唯一匹配才动库存；同一型号有多个厂商时用厂商列匹配。',
    '3. 核对完再批量提交，最后汇报「成功 N 条 / 失败 M 条」以及失败原因。',
    '4. 明显异常（负数、数量为空、型号缺失、合计行）先列出来问用户，不要猜着执行。',
    '5. 如果报表是「结存/盘点」而不是「增减」，用 set_stock 把库存改成报表值，并在回答里说明这是覆盖式盘点。',
    '',
    '## 回答风格',
    '- 中文，结论先行，短句；需要时用列表。',
    '- 不要复述工具返回的 JSON，不要贴内部 id。',
    '- 数量带单位，金额用人民币。',
    '- 与库存无关的常识或技术问题正常回答，不必硬扯到库存。',
    '',
    '## 当前状态',
    `- 时间：${now}`,
    `- 库存概况：${brief}`,
    `- 软件版本：BoxFlow ${app.getVersion()}`,
    config.extraPrompt.trim() ? `- 用户补充说明：${config.extraPrompt.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/* ------------------------------- 报表解析 ------------------------------- */

const MAX_REPORT_ROWS = 300
const MAX_REPORT_CHARS = 14000

export async function readReport(filePath: string): Promise<ParsedReport> {
  if (!existsSync(filePath)) throw new AppError('VALIDATION_FAILED', '文件不存在')
  const ext = extname(filePath).toLowerCase()
  if (!['.xlsx', '.xlsm', '.csv'].includes(ext)) {
    throw new AppError('VALIDATION_FAILED', '只支持 .xlsx 与 .csv 报表')
  }

  const { headers, rows } = await parseSheet(filePath)
  if (!rows.length) throw new AppError('VALIDATION_FAILED', '报表里没有数据行')

  const limited = rows.slice(0, MAX_REPORT_ROWS)
  const lines = [headers.join('\t'), ...limited.map((row) => row.cells.join('\t'))]
  let text = lines.join('\n')
  let truncated = rows.length > limited.length
  if (text.length > MAX_REPORT_CHARS) {
    text = `${text.slice(0, MAX_REPORT_CHARS)}\n…（内容过长已截断）`
    truncated = true
  }

  return {
    meta: {
      name: basename(filePath),
      rows: rows.length,
      bytes: statSync(filePath).size
    },
    text,
    headers,
    truncated
  }
}

/* ------------------------------- 对话主体 ------------------------------- */

function toChatMessages(history: AiChatMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const item of history.slice(-HISTORY_LIMIT)) {
    if (!item.content.trim()) continue
    messages.push({ role: item.role, content: item.content })
  }
  return messages
}

function waitForConfirm(callId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | null = null
    const finish = (approved: boolean): void => {
      if (timer) clearTimeout(timer)
      pendingConfirms.delete(callId)
      resolve(approved)
    }
    timer = setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS)
    pendingConfirms.set(callId, finish)
  })
}

export function resolveConfirm(callId: string, approved: boolean): boolean {
  const finish = pendingConfirms.get(callId)
  if (!finish) return false
  finish(approved)
  return true
}

export function abortRun(): boolean {
  const run = activeRun
  if (!run) return false
  activeRun = null
  for (const finish of [...pendingConfirms.values()]) finish(false)
  run.controller.abort()
  return true
}

function assertReady(): { config: ReturnType<typeof loadConfig>; apiKey: string } {
  const config = loadConfig()
  const preset = findProvider(config.providerId)
  if (!config.baseUrl.trim() || !config.model.trim()) {
    throw new AppError('AI_NOT_CONFIGURED', '还没配置模型，请到「设置 → AI 助手」填写接口地址与模型名')
  }
  const apiKey = readApiKey()
  if (!apiKey && !preset.local) {
    throw new AppError('AI_NOT_CONFIGURED', '还没填 API Key，请到「设置 → AI 助手」填写')
  }
  return { config, apiKey }
}

export interface SendResult {
  conversationId: string
  userMessageId: string
  assistantId: string
}

export function send(payload: AiSendPayload, window: BrowserWindow | null): SendResult {
  if (activeRun) {
    throw new AppError('AI_BUSY', '上一个问题还在回答中，先等它结束或点停止')
  }

  const text = (payload.text ?? '').trim()
  const reportText = (payload.reportText ?? '').trim()
  if (!text && !reportText) throw new AppError('VALIDATION_FAILED', '说点什么再发送')

  const { config, apiKey } = assertReady()
  const preset = findProvider(config.providerId)

  const conversation = payload.conversationId
    ? (conversationsRepo.get(payload.conversationId) ?? conversationsRepo.create(text.slice(0, 24)))
    : conversationsRepo.create(text.slice(0, 24) || '新对话')
  rememberConversation(conversation.id)

  const history = conversationsRepo.messages(conversation.id)

  const userMessage = conversationsRepo.append({
    conversationId: conversation.id,
    role: 'user',
    content: text,
    attachments: payload.reportMeta ? [payload.reportMeta] : []
  })
  conversationsRepo.touch(conversation.id)

  const assistantId = newId()
  const controller = new AbortController()
  activeRun = { controller, window }
  emit(window, { type: 'start', assistantId, conversationId: conversation.id })

  // 后台跑完再落库，界面立刻能拿到占位 id 开始接流
  void runTurn({
    conversationId: conversation.id,
    history,
    userText: text,
    reportText,
    config,
    apiKey,
    protocol: preset.protocol,
    controller,
    window,
    assistantId
  })

  return { conversationId: conversation.id, userMessageId: userMessage.id, assistantId }
}

async function runTurn(input: {
  conversationId: string
  history: AiChatMessage[]
  userText: string
  reportText: string
  config: ReturnType<typeof loadConfig>
  apiKey: string
  protocol: 'openai' | 'anthropic'
  controller: AbortController
  window: BrowserWindow | null
  assistantId: string
}): Promise<void> {
  const { controller, window } = input
  const traces: AiToolTrace[] = []
  let text = ''

  const messages: ChatMessage[] = toChatMessages(input.history)
  const composed = input.reportText
    ? `${input.userText || '这是我这份物料报表，请帮我核对并更新库存。'}\n\n【报表内容】\n${input.reportText}`
    : input.userText
  messages.push({ role: 'user', content: composed })

  const tools = assistantToolSchemas()

  const persist = (error?: string): void => {
    conversationsRepo.append({
      id: input.assistantId,
      conversationId: input.conversationId,
      role: 'assistant',
      content: text,
      tools: traces,
      error: error ?? null
    })
    conversationsRepo.touch(input.conversationId)
  }

  try {
    for (let step = 1; step <= MAX_STEPS; step += 1) {
      if (controller.signal.aborted) return
      if (step > 1) emit(window, { type: 'step', step })

      const turn = await streamChat({
        protocol: input.protocol,
        baseUrl: input.config.baseUrl,
        apiKey: input.apiKey,
        model: input.config.model,
        temperature: input.config.temperature,
        messages,
        tools,
        system: systemPrompt(),
        signal: controller.signal,
        handlers: {
          onDelta: (delta) => {
            text += delta
            emit(window, { type: 'delta', text: delta })
          },
          onReasoning: (delta) => emit(window, { type: 'reasoning', text: delta })
        }
      })

      if (!turn.toolCalls.length) break

      messages.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })

      for (const call of turn.toolCalls) {
        if (controller.signal.aborted) return
        const args = parseArgs(call)
        const title = toolTitle(call.name)

        let approved = true
        if (input.config.confirmWrites && WRITE_TOOLS.has(call.name)) {
          emit(window, {
            type: 'confirm-request',
            callId: call.id,
            name: call.name,
            title,
            args,
            summary: describeArgs(args)
          })
          approved = await waitForConfirm(call.id)
        }

        if (!approved) {
          // 用户拒绝或超时：告诉模型跳过，别继续硬改
          traces.push({
            callId: call.id,
            name: call.name,
            title,
            args,
            ok: false,
            summary: '未获确认，已跳过'
          })
          emit(window, { type: 'tool-result', callId: call.id, ok: false, summary: '未获确认，已跳过' })
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: '用户没有确认执行这次操作，请说明已跳过，并询问是否需要调整。'
          })
          continue
        }

        emit(window, { type: 'tool-start', callId: call.id, name: call.name, title, args })
        const result = executeAssistantTool(call.name, args)
        traces.push({
          callId: call.id,
          name: call.name,
          title,
          args,
          ok: result.ok,
          summary: result.summary
        })
        emit(window, { type: 'tool-result', callId: call.id, ok: result.ok, summary: result.summary })
        messages.push({ role: 'tool', toolCallId: call.id, content: result.text })

        // 库存变了，让物料列表与概览立刻刷新
        if (result.ok && WRITE_TOOLS.has(call.name)) {
          if (window && !window.isDestroyed()) window.webContents.send('main:message', 'mcp-activity')
        }
      }
    }

    persist()
    emit(window, { type: 'done', messageId: input.assistantId })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    if (aborted) {
      persist()
      emit(window, { type: 'aborted' })
      return
    }
    const message =
      err instanceof AppError
        ? err.message
        : err instanceof Error
          ? err.message
          : '调用模型失败'
    persist(message)
    emit(window, {
      type: 'error',
      message,
      code: err instanceof AppError ? err.code : 'AI_FAILED'
    })
  } finally {
    if (activeRun?.controller === controller) activeRun = null
    for (const finish of [...pendingConfirms.values()]) finish(false)
  }
}

function parseArgs(call: ChatToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.args || '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function describeArgs(args: Record<string, unknown>): string {
  const parts: string[] = []
  if (args.partNumber) parts.push(String(args.partNumber))
  if (args.quantity !== undefined) parts.push(`数量 ${String(args.quantity)}`)
  if (args.kind) parts.push(String(args.kind))
  if (args.locationCode) parts.push(`位置 ${String(args.locationCode)}`)
  if (Array.isArray(args.items)) parts.push(`${args.items.length} 条`)
  if (args.name) parts.push(String(args.name))
  return parts.join(' · ') || '等待确认'
}

/* -------------------------------- 对外接口 -------------------------------- */

export const aiService = {
  config(): AiConfigView {
    return toView()
  },

  saveConfig(patch: AiConfigPatch): AiConfigView {
    return saveConfig(patch)
  },

  async test(): Promise<AiTestResult> {
    const { config, apiKey } = assertReady()
    const preset = findProvider(config.providerId)
    const result = await testConnection({
      protocol: preset.protocol,
      baseUrl: config.baseUrl,
      apiKey,
      model: config.model
    })
    return {
      ok: true,
      message: `连接正常，${result.latencyMs} ms`,
      latencyMs: result.latencyMs,
      model: config.model,
      sample: result.sample
    }
  },

  conversations(): AiConversation[] {
    return conversationsRepo.list()
  },

  messages(conversationId: string): AiChatMessage[] {
    return conversationsRepo.messages(conversationId)
  },

  latestConversation(): AiConversation | null {
    return conversationsRepo.latest()
  },

  newConversation(): AiConversation {
    const conversation = conversationsRepo.create('新对话')
    rememberConversation(conversation.id)
    return conversation
  },

  deleteConversation(id: string): boolean {
    conversationsRepo.remove(id)
    if (loadConfig().lastConversationId === id) rememberConversation(null)
    return true
  },

  readReport,
  send,
  abort: abortRun,
  resolveConfirm
}
