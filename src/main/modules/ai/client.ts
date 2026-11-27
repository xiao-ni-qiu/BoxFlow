import type { AiModelInfo, AiProtocol } from '@shared/ai'
import { AppError } from '../../errors'

/**
 * 两种协议的最小流式客户端。
 * 只依赖 Node 20 自带的 fetch，不引第三方 SDK：
 * 一是不用为每家厂商装一个包，二是 Key 始终留在主进程，不经过渲染层。
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatToolCall {
  id: string
  name: string
  /** 原始 JSON 字符串，边流边拼，最后再 parse */
  args: string
}

export interface ChatMessage {
  role: ChatRole
  content: string
  toolCalls?: ChatToolCall[]
  toolCallId?: string
}

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface StreamHandlers {
  onDelta?: (text: string) => void
  /** 部分推理模型会单独吐思考过程，界面上可以淡显 */
  onReasoning?: (text: string) => void
}

export interface TurnResult {
  content: string
  toolCalls: ChatToolCall[]
  finishReason: string
}

export interface StreamOptions {
  protocol: AiProtocol
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  messages: ChatMessage[]
  tools: ToolSchema[]
  system: string
  signal: AbortSignal
  handlers: StreamHandlers
}

const ANTHROPIC_VERSION = '2023-06-01'

/* ------------------------------ SSE 读取 ------------------------------ */

async function readSse(
  response: Response,
  onData: (payload: string) => void
): Promise<void> {
  const body = response.body
  if (!body) throw new AppError('AI_FAILED', '模型服务没有返回数据流')

  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以空行分隔事件；这里只关心 data 行，忽略 event/id/retry
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '')
      buffer = buffer.slice(index + 1)
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim()
        if (payload) onData(payload)
      }
      index = buffer.indexOf('\n')
    }
  }

  const tail = buffer.trim()
  if (tail.startsWith('data:')) {
    const payload = tail.slice(5).trim()
    if (payload) onData(payload)
  }
}

function explainHttpError(status: number, bodyText: string, providerLabel: string): AppError {
  let detail = bodyText.trim()
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof parsed.error === 'string') detail = parsed.error
    else if (parsed.error?.message) detail = parsed.error.message
    else if (parsed.message) detail = parsed.message
  } catch {
    /* 非 JSON 就保留原文 */
  }
  detail = detail.slice(0, 400)

  if (status === 401 || status === 403) {
    return new AppError('AI_AUTH_FAILED', `${providerLabel} 拒绝了这次请求：API Key 无效或没有权限。${detail}`)
  }
  if (status === 404) {
    return new AppError('AI_FAILED', `接口地址或模型名不存在（404）。请检查 Base URL 与模型名。${detail}`)
  }
  if (status === 429) {
    return new AppError('AI_FAILED', `请求过于频繁或额度用尽（429）。${detail}`)
  }
  return new AppError('AI_FAILED', `模型服务返回 ${status}：${detail || '无详细信息'}`)
}

function endpoint(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}${path}`
}

/* --------------------------- OpenAI 兼容协议 --------------------------- */

interface OpenAiDeltaToolCall {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

function toOpenAiMessages(system: string, messages: ChatMessage[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [{ role: 'system', content: system }]
  for (const message of messages) {
    if (message.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: message.toolCallId ?? '',
        content: message.content
      })
      continue
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      result.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.args || '{}' }
        }))
      })
      continue
    }
    result.push({ role: message.role, content: message.content })
  }
  return result
}

async function streamOpenAi(options: StreamOptions): Promise<TurnResult> {
  const response = await fetch(endpoint(options.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey || 'local'}`
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature,
      stream: true,
      messages: toOpenAiMessages(options.system, options.messages),
      ...(options.tools.length
        ? {
            tools: options.tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            })),
            tool_choice: 'auto'
          }
        : {})
    }),
    signal: options.signal
  })

  if (!response.ok) {
    throw explainHttpError(response.status, await response.text(), '模型服务')
  }

  let content = ''
  let finishReason = ''
  const toolDrafts = new Map<number, ChatToolCall>()

  await readSse(response, (payload) => {
    if (payload === '[DONE]') return
    let parsed: {
      choices?: {
        delta?: {
          content?: string | null
          reasoning_content?: string | null
          tool_calls?: OpenAiDeltaToolCall[]
        }
        finish_reason?: string | null
      }[]
      error?: { message?: string }
    }
    try {
      parsed = JSON.parse(payload)
    } catch {
      return
    }
    if (parsed.error?.message) {
      throw new AppError('AI_FAILED', parsed.error.message)
    }

    const choice = parsed.choices?.[0]
    if (!choice) return
    const delta = choice.delta
    if (delta?.content) {
      content += delta.content
      options.handlers.onDelta?.(delta.content)
    }
    if (delta?.reasoning_content) {
      options.handlers.onReasoning?.(delta.reasoning_content)
    }
    if (delta?.tool_calls) {
      for (const item of delta.tool_calls) {
        const index = item.index ?? 0
        const draft = toolDrafts.get(index) ?? { id: '', name: '', args: '' }
        if (item.id) draft.id = item.id
        if (item.function?.name) draft.name += item.function.name
        if (item.function?.arguments) draft.args += item.function.arguments
        toolDrafts.set(index, draft)
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason
  })

  const toolCalls = [...toolDrafts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, draft]) => ({
      id: draft.id || `call_${index}_${Date.now()}`,
      name: draft.name,
      args: draft.args || '{}'
    }))
    .filter((call) => call.name)

  return { content, toolCalls, finishReason: finishReason || (toolCalls.length ? 'tool_calls' : 'stop') }
}

/* ---------------------------- Anthropic 协议 ---------------------------- */

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function toAnthropicMessages(
  messages: ChatMessage[]
): { role: 'user' | 'assistant'; content: AnthropicBlock[] }[] {
  const result: { role: 'user' | 'assistant'; content: AnthropicBlock[] }[] = []
  let pendingToolResults: AnthropicBlock[] = []

  const flushTools = (): void => {
    if (!pendingToolResults.length) return
    result.push({ role: 'user', content: pendingToolResults })
    pendingToolResults = []
  }

  for (const message of messages) {
    if (message.role === 'system') continue

    if (message.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? '',
        content: message.content
      })
      continue
    }

    flushTools()

    if (message.role === 'assistant') {
      const blocks: AnthropicBlock[] = []
      if (message.content) blocks.push({ type: 'text', text: message.content })
      for (const call of message.toolCalls ?? []) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(call.args || '{}') as Record<string, unknown>
        } catch {
          input = {}
        }
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input })
      }
      if (blocks.length) result.push({ role: 'assistant', content: blocks })
      continue
    }

    result.push({ role: 'user', content: [{ type: 'text', text: message.content }] })
  }

  flushTools()
  return result
}

async function streamAnthropic(options: StreamOptions): Promise<TurnResult> {
  const response = await fetch(endpoint(options.baseUrl, '/messages'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 4096,
      temperature: options.temperature,
      system: options.system,
      messages: toAnthropicMessages(options.messages),
      ...(options.tools.length
        ? {
            tools: options.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters
            }))
          }
        : {})
    }),
    signal: options.signal
  })

  if (!response.ok) {
    throw explainHttpError(response.status, await response.text(), 'Anthropic')
  }

  let content = ''
  let stopReason = ''
  const toolDrafts = new Map<number, { id: string; name: string; args: string }>()

  await readSse(response, (payload) => {
    let parsed: {
      type?: string
      index?: number
      delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }
      content_block?: { type?: string; id?: string; name?: string }
      error?: { message?: string }
    }
    try {
      parsed = JSON.parse(payload)
    } catch {
      return
    }

    if (parsed.type === 'error') {
      throw new AppError('AI_FAILED', parsed.error?.message ?? 'Anthropic 返回错误')
    }
    if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
      toolDrafts.set(parsed.index ?? 0, {
        id: parsed.content_block.id ?? '',
        name: parsed.content_block.name ?? '',
        args: ''
      })
      return
    }
    if (parsed.type === 'content_block_delta') {
      const delta = parsed.delta
      if (delta?.type === 'text_delta' && delta.text) {
        content += delta.text
        options.handlers.onDelta?.(delta.text)
      }
      if (delta?.type === 'input_json_delta' && delta.partial_json !== undefined) {
        const draft = toolDrafts.get(parsed.index ?? 0)
        if (draft) draft.args += delta.partial_json
      }
      if (delta?.type === 'thinking_delta' && delta.text) {
        options.handlers.onReasoning?.(delta.text)
      }
      return
    }
    if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
      stopReason = parsed.delta.stop_reason
    }
  })

  const toolCalls = [...toolDrafts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, draft]) => ({
      id: draft.id || `call_${index}_${Date.now()}`,
      name: draft.name,
      args: draft.args || '{}'
    }))
    .filter((call) => call.name)

  return {
    content,
    toolCalls,
    finishReason: stopReason || (toolCalls.length ? 'tool_use' : 'end_turn')
  }
}

export async function streamChat(options: StreamOptions): Promise<TurnResult> {
  try {
    return options.protocol === 'anthropic'
      ? await streamAnthropic(options)
      : await streamOpenAi(options)
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof Error) {
      if (err.name === 'AbortError') throw err
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(err.message)) {
        throw new AppError(
          'AI_FAILED',
          `连不上模型服务，请检查网络或 Base URL 是否正确（${err.message}）`
        )
      }
      throw new AppError('AI_FAILED', err.message)
    }
    throw new AppError('AI_FAILED', '调用模型失败')
  }
}

/** 设置页的「测试连接」：不流式，只要通就行 */export async function testConnection(options: {
  protocol: AiProtocol
  baseUrl: string
  apiKey: string
  model: string
}): Promise<{ latencyMs: number; sample: string }> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  try {
    if (options.protocol === 'anthropic') {
      const response = await fetch(endpoint(options.baseUrl, '/messages'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: 32,
          messages: [{ role: 'user', content: '回复"连接成功"四个字即可' }]
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        throw explainHttpError(response.status, await response.text(), 'Anthropic')
      }
      const data = (await response.json()) as { content?: { type: string; text?: string }[] }
      const sample = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
      return { latencyMs: Date.now() - started, sample: sample.slice(0, 80) }
    }

    const response = await fetch(endpoint(options.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey || 'local'}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        max_tokens: 32,
        messages: [
          { role: 'system', content: '你是连通性测试助手，只用一句话回答。' },
          { role: 'user', content: '回复"连接成功"四个字即可' }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) {
      throw explainHttpError(response.status, await response.text(), '模型服务')
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return {
      latencyMs: Date.now() - started,
      sample: (data.choices?.[0]?.message?.content ?? '').slice(0, 80)
    }
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------------------- 可用模型列表 ---------------------------- */

/**
 * 这些多半不是对话模型，读回来一股脑塞进下拉框反而难找。
 * 过滤只影响菜单展示，不影响手填——用户想用哪个仍然可以直接输入。
 */
const NON_CHAT_MODEL =
  /(embed|embedding|whisper|tts|dall-e|moderation|rerank|stable-diffusion|sdxl|flux|image|audio|realtime|transcribe|ocr|bge-|m3e)/i

function readModelRow(row: unknown): AiModelInfo | null {
  if (typeof row === 'string') return { id: row }
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const id =
    typeof record.id === 'string'
      ? record.id
      : typeof record.name === 'string'
        ? record.name
        : typeof record.model === 'string'
          ? record.model
          : ''
  if (!id) return null

  const display =
    typeof record.display_name === 'string'
      ? record.display_name
      : typeof record.displayName === 'string'
        ? record.displayName
        : ''
  const context =
    typeof record.context_length === 'number'
      ? record.context_length
      : typeof record.context_window === 'number'
        ? record.context_window
        : typeof record.max_context_length === 'number'
          ? record.max_context_length
          : null

  return {
    id,
    label: display && display !== id ? display : undefined,
    hint: context && context > 0 ? `${Math.round(context / 1000)}K 上下文` : undefined
  }
}

/**
 * 按当前 Key 读取服务商开放的模型清单。
 *
 * - OpenAI 兼容（含 DeepSeek / Kimi / 通义 / 智谱 / 硅基流动 / Gemini 兼容层 /
 *   OpenRouter / Ollama / LM Studio）：GET {base}/models，返回 { data: [{ id }] }
 * - Anthropic：GET {base}/models，需要 x-api-key 与 anthropic-version
 *
 * 没开放这个接口的服务商返回 404/405，这里抛 AI_NO_MODEL_LIST，由界面提示手填。
 */
export async function listModels(options: {
  protocol: AiProtocol
  baseUrl: string
  apiKey: string
}): Promise<AiModelInfo[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    let path = '/models'
    if (options.protocol === 'anthropic') {
      headers['x-api-key'] = options.apiKey
      headers['anthropic-version'] = ANTHROPIC_VERSION
      path = '/models?limit=200'
    } else if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`
    }

    const response = await fetch(endpoint(options.baseUrl, path), {
      headers,
      signal: controller.signal
    })

    if (!response.ok) {
      if (response.status === 404 || response.status === 405 || response.status === 501) {
        throw new AppError(
          'AI_NO_MODEL_LIST',
          '这家服务商没有开放模型列表接口，请直接填写模型名（可参考下方常用项）'
        )
      }
      throw explainHttpError(response.status, await response.text(), '模型服务')
    }

    const payload = (await response.json()) as {
      data?: unknown[]
      models?: unknown[]
    }
    const raw = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []

    const rows = raw.map(readModelRow).filter((item): item is AiModelInfo => Boolean(item))
    const chatRows = rows.filter((item) => !NON_CHAT_MODEL.test(item.id))

    // 本地部署可能只装了 embedding 或图像模型，别让菜单空着
    const picked = chatRows.length ? chatRows : rows
    const seen = new Set<string>()
    return picked
      .filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 400)
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new AppError('AI_FAILED', '读取模型列表超时，请检查网络或 Base URL')
      }
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(err.message)) {
        throw new AppError('AI_FAILED', `连不上模型服务，无法读取模型列表（${err.message}）`)
      }
      throw new AppError('AI_FAILED', err.message)
    }
    throw new AppError('AI_FAILED', '读取模型列表失败')
  } finally {
    clearTimeout(timer)
  }
}
