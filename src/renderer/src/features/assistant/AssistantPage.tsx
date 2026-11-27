import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUp,
  Check,
  FileSpreadsheet,
  Plus,
  Settings2,
  Sparkles,
  Square,
  Wrench,
  X
} from 'lucide-react'
import type { AiChatMessage, AiToolTrace, ParsedReport } from '@shared/ai'
import { api, ApiError } from '@renderer/lib/api'
import { Button, IconButton, useToast } from '@renderer/components/ui'
import { Markdown } from './Markdown'

interface UiMessage extends AiChatMessage {
  streaming?: boolean
}

interface PendingConfirm {
  callId: string
  name: string
  title: string
  summary: string
  args: Record<string, unknown>
}

const SUGGESTIONS = [
  '现在有哪些物料快用完了？按缺口从大到小列一下',
  '帮我查一下 STM32F103C8T6 还剩多少、放在哪',
  '这批新到的 10kΩ 电阻入库 500 个，放到 A-01-03'
]

function ToolCard({ trace }: { trace: AiToolTrace }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="mt-1.5 overflow-hidden rounded-ctl border"
      style={{ borderColor: 'var(--hair)', background: 'var(--bg-panel)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Wrench size={12} strokeWidth={1.7} className="shrink-0 text-t3" />
        <span className="shrink-0 text-[12px] text-t2">{trace.title}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-t3">{trace.summary}</span>
        {trace.ok ? (
          <Check size={12} strokeWidth={2} style={{ color: 'var(--ok)' }} />
        ) : (
          <X size={12} strokeWidth={2} style={{ color: 'var(--danger)' }} />
        )}
      </button>
      {open ? (
        <pre
          className="mono max-h-40 overflow-auto px-3 pb-2 text-[11px] leading-relaxed text-t3"
          style={{ borderTop: '1px solid var(--hair)' }}
        >
          {JSON.stringify(trace.args, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

function Typing() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1 w-1 animate-pulse rounded-full"
          style={{ background: 'var(--text-3)', animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  )
}

export function AssistantPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const toast = useToast()
  const { data: config } = useQuery({ queryKey: ['ai-config'], queryFn: () => api.ai.config() })

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [report, setReport] = useState<ParsedReport | null>(null)
  const [running, setRunning] = useState(false)
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const [loading, setLoading] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 打开页面先接上上次的会话
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void (async () => {
      try {
        const latest = await api.ai.latest()
        if (latest) {
          const history = await api.ai.messages(latest.id)
          setConversationId(latest.id)
          setMessages(history)
        }
      } catch {
        /* 首次使用没有会话是正常的 */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 流式事件：全部按 id 合并到最后一条 assistant 消息上
  useEffect(() => {
    const off = api.ai.onEvent((event) => {
      switch (event.type) {
        case 'start':
          setConversationId(event.conversationId)
          setRunning(true)
          setMessages((prev) => [
            ...prev,
            {
              id: event.assistantId,
              role: 'assistant',
              content: '',
              tools: [],
              attachments: [],
              createdAt: new Date().toISOString(),
              streaming: true
            }
          ])
          break
        case 'delta':
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + event.text }
            }
            return next
          })
          break
        case 'tool-start':
          setMessages((prev) => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i -= 1) {
              if (next[i].role !== 'assistant') continue
              next[i] = {
                ...next[i],
                tools: [
                  ...next[i].tools,
                  {
                    callId: event.callId,
                    name: event.name,
                    title: event.title,
                    args: event.args,
                    ok: true,
                    summary: '执行中…'
                  }
                ]
              }
              break
            }
            return next
          })
          break
        case 'tool-result':
          setConfirm((prev) => (prev && prev.callId === event.callId ? null : prev))
          setMessages((prev) =>
            prev.map((message) =>
              message.role === 'assistant'
                ? {
                    ...message,
                    tools: message.tools.map((tool) =>
                      tool.callId === event.callId
                        ? { ...tool, ok: event.ok, summary: event.summary }
                        : tool
                    )
                  }
                : message
            )
          )
          break
        case 'confirm-request':
          setConfirm({
            callId: event.callId,
            name: event.name,
            title: event.title,
            summary: event.summary,
            args: event.args
          })
          break
        case 'step':
          break
        case 'done':
          setRunning(false)
          setConfirm(null)
          setMessages((prev) =>
            prev.map((message) =>
              message.id === event.messageId ? { ...message, streaming: false } : message
            )
          )
          break
        case 'aborted':
          setRunning(false)
          setConfirm(null)
          setMessages((prev) =>
            prev.map((message) => (message.streaming ? { ...message, streaming: false } : message))
          )
          break
        case 'error':
          setRunning(false)
          setConfirm(null)
          setMessages((prev) =>
            prev.map((message) =>
              message.streaming ? { ...message, streaming: false, error: event.message } : message
            )
          )
          toast.push(event.message, 'error')
          break
        default:
          break
      }
    })
    return off
  }, [toast])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, confirm])

  const configured = Boolean(config?.ready)

  const submit = useCallback(async () => {
    const text = input.trim()
    if (running || (!text && !report)) return
    if (!configured) {
      onOpenSettings()
      return
    }

    const localMessage: UiMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      tools: [],
      attachments: report ? [report.meta] : [],
      createdAt: new Date().toISOString()
    }

    setMessages((prev) => [...prev, localMessage])
    setInput('')
    setRunning(true)

    try {
      const result = await api.ai.send({
        conversationId: conversationId ?? undefined,
        text,
        reportText: report?.text,
        reportMeta: report?.meta
      })
      setConversationId(result.conversationId)
      setReport(null)
    } catch (err) {
      setRunning(false)
      const message = err instanceof ApiError ? err.message : '发送失败'
      toast.push(message, 'error')
      if (err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED') onOpenSettings()
    }
  }, [configured, conversationId, input, onOpenSettings, report, running, toast])

  const stop = (): void => {
    void api.ai.abort()
  }

  const answer = async (approved: boolean): Promise<void> => {
    if (!confirm) return
    const callId = confirm.callId
    setConfirm(null)
    await api.ai.confirm(callId, approved)
  }

  const attach = async (): Promise<void> => {
    try {
      const parsed = await api.ai.pickReport()
      if (!parsed) return
      setReport(parsed)
      if (parsed.truncated) {
        toast.push(`报表较大，只读取了前 ${parsed.meta.rows} 行的一部分`)
      }
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : '读取报表失败', 'error')
    }
  }

  const newChat = async (): Promise<void> => {
    if (running) stop()
    setMessages([])
    setConfirm(null)
    setInput('')
    setReport(null)
    const conversation = await api.ai.newConversation()
    setConversationId(conversation.id)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center px-7 pb-3 pt-6">
        <div>
          <h1 className="text-[20px] font-medium leading-[1.3] tracking-[-0.2px] text-t1">AI 助手</h1>
          <p className="mt-1.5 text-[12px] text-t2">
            {config
              ? config.ready
                ? `当前模型 ${config.model} · 改动库存${config.confirmWrites ? '前会先问你' : '会直接执行'}`
                : '还没配置模型，先去设置里填一下'
              : '正在读取配置…'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {config && !config.ready ? (
            <Button onClick={onOpenSettings}>
              <Settings2 size={13} strokeWidth={1.6} />
              去设置
            </Button>
          ) : null}
          <Button onClick={() => void newChat()} disabled={!messages.length}>
            <Plus size={13} strokeWidth={1.7} />
            新对话
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[820px] px-7 pb-6">
          {loading ? (
            <p className="py-16 text-center text-[12.5px] text-t3">加载对话…</p>
          ) : messages.length === 0 ? (
            <div className="py-12">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[12px]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <Sparkles size={20} strokeWidth={1.6} />
              </div>
              <h2 className="mt-4 text-[17px] font-medium text-t1">
                {configured ? '想让仓库做点什么？' : '先配一个模型再聊'}
              </h2>
              <p className="mt-1.5 max-w-[520px] text-[12.5px] leading-relaxed text-t2">
                {configured
                  ? '直接说人话就行——查库存、入库、出库、盘点，或者把一份到货清单丢进来让它逐行核对。也可以问和库存无关的技术问题。'
                  : '到「设置 → AI 助手」选一家服务商，填上 API Key 即可。支持 DeepSeek、Kimi、通义千问、智谱、OpenAI、Claude、Gemini 和本地 Ollama。'}
              </p>

              {configured ? (
                <div className="mt-5 grid gap-2">
                  {SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setInput(item)
                        textareaRef.current?.focus()
                      }}
                      className="rounded-ctl border px-3.5 py-2.5 text-left text-[12.5px] text-t2 transition-colors duration-fast hover:text-t1"
                      style={{ borderColor: 'var(--hair)' }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : (
                <Button variant="primary" className="mt-5" onClick={onOpenSettings}>
                  打开模型设置
                </Button>
              )}
            </div>
          ) : (
            <div className="pt-2">
              {messages.map((message) =>
                message.role === 'user' ? (
                  <div key={message.id} className="mt-6 flex justify-end">
                    <div
                      className="max-w-[78%] rounded-card px-3.5 py-2.5 text-[13px] leading-relaxed text-t1"
                      style={{ background: 'var(--accent-soft)' }}
                    >
                      {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
                      {message.attachments.map((file) => (
                        <div
                          key={file.name}
                          className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-t2"
                        >
                          <FileSpreadsheet size={12} strokeWidth={1.6} />
                          {file.name} · {file.rows} 行
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="mt-6">
                    <div className="flex items-center gap-1.5 text-[11.5px] text-t3">
                      <Sparkles size={12} strokeWidth={1.7} />
                      助手
                    </div>
                    <div className="mt-1.5">
                      {message.content ? (
                        <Markdown text={message.content} />
                      ) : message.streaming ? (
                        <Typing />
                      ) : null}
                    </div>
                    {message.tools.map((trace) => (
                      <ToolCard key={trace.callId} trace={trace} />
                    ))}
                    {message.error ? (
                      <p className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>
                        {message.error}
                      </p>
                    ) : null}
                  </div>
                )
              )}

              {confirm ? (
                <div
                  className="mt-4 rounded-card border px-4 py-3"
                  style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
                >
                  <p className="text-[12.5px] font-medium text-t1">需要你确认这次写入</p>
                  <p className="mt-1 text-[12px] text-t2">
                    {confirm.title} · {confirm.summary}
                  </p>
                  <pre className="mono mt-2 max-h-32 overflow-auto text-[11px] leading-relaxed text-t3">
                    {JSON.stringify(confirm.args, null, 2)}
                  </pre>
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="primary" onClick={() => void answer(true)}>
                      <Check size={13} strokeWidth={2} />
                      执行
                    </Button>
                    <Button onClick={() => void answer(false)}>跳过</Button>
                    <span className="ml-auto text-[11px] text-t3">5 分钟内不选会自动跳过</span>
                  </div>
                </div>
              ) : null}

              <div ref={bottomRef} className="h-1" />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-7 pb-5 pt-2">
        <div className="mx-auto w-full max-w-[820px]">
          {report ? (
            <div
              className="mb-2 flex items-center gap-2 rounded-ctl px-3 py-2 text-[12px] text-t2"
              style={{ background: 'var(--bg-sunken)' }}
            >
              <FileSpreadsheet size={13} strokeWidth={1.6} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {report.meta.name} · {report.meta.rows} 行
                {report.truncated ? '（过长已截断）' : ''}
              </span>
              <IconButton label="移除报表" onClick={() => setReport(null)}>
                <X size={13} strokeWidth={1.8} />
              </IconButton>
            </div>
          ) : null}

          <div
            className="rounded-card border px-3 py-2 transition-colors focus-within:border-accent"
            style={{ borderColor: 'var(--hair)', background: 'var(--bg-surface)' }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void submit()
                }
              }}
              rows={2}
              placeholder={
                configured
                  ? '例如：把这份表里的数量都入到库存 / 5 个 10kΩ 电阻出库给样机 / 哪些物料该补货了'
                  : '还没配置模型，先到设置里填 Key'
              }
              className="max-h-40 w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-t1 outline-none placeholder:text-t3"
            />
            <div className="flex items-center gap-1.5 px-1">
              <IconButton label="上传物料报表" onClick={() => void attach()} disabled={running}>
                <FileSpreadsheet size={15} strokeWidth={1.6} />
              </IconButton>
              <span className="text-[11px] text-t3">
                {running ? '正在生成，可点右侧停止' : 'Enter 发送 · Shift+Enter 换行'}
              </span>
              <div className="ml-auto">
                {running ? (
                  <button
                    type="button"
                    onClick={stop}
                    aria-label="停止生成"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-ctl text-t2 transition-colors duration-fast hover:bg-sunken hover:text-t1"
                  >
                    <Square size={13} strokeWidth={2} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!input.trim() && !report}
                    aria-label="发送"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-ctl text-white transition-opacity duration-fast disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}
                  >
                    <ArrowUp size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="mt-2 text-center text-[11px] text-t3">
            {configured && config?.confirmWrites
              ? '涉及库存的写入会先给你看明细，确认后才执行'
              : 'AI 可能出错，重要数据建议先备份'}
          </p>
        </div>
      </div>
    </div>
  )
}
