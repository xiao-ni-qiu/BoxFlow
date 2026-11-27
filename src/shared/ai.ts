/**
 * AI 助手：提供商预设与共享类型。
 *
 * 接入方式参考市面上主流做法：
 * - 绝大多数国内厂商（DeepSeek、Kimi、通义、智谱、硅基流动）与聚合平台（OpenRouter）
 *   都提供 OpenAI 兼容的 /chat/completions，一套协议即可覆盖；
 * - Anthropic Claude 用原生 /messages 协议，单独适配；
 * - Google Gemini 提供 OpenAI 兼容层，走同一套；
 * - Ollama / LM Studio 本地模型同样暴露 OpenAI 兼容端点。
 * 因此「选择服务商 → 自动填 Base URL 与常用模型 → 只填 Key」是最省心的配置路径，
 * 同时保留自定义 Base URL 与模型名，便于接私有网关。
 */

export type AiProtocol = 'openai' | 'anthropic'

export interface AiProviderPreset {
  id: string
  label: string
  protocol: AiProtocol
  baseUrl: string
  /**
   * 仅作占位与离线兜底：真正的可用列表由 GET /models 按当前 Key 实时读取，
   * 这样服务商上下架模型（例如 deepseek-chat 换代）时不必改代码。
   */
  models: string[]
  /** 申请 API Key 的页面 */
  keyUrl?: string
  /** 设置页上的一句提示 */
  note?: string
  /** 本地部署，无需 API Key */
  local?: boolean
}

export const AI_PROVIDERS: AiProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek 深度求索',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: '中文与工具调用都比较稳，价格低，适合日常库存管理'
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-latest', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    note: '长上下文，适合一次性丢进整份物料报表'
  },
  {
    id: 'dashscope',
    label: '阿里云百炼（通义千问）',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    note: '走 DashScope 的 OpenAI 兼容模式'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
    keyUrl: 'https://bigmodel.cn/usercenter/apikeys',
    note: 'GLM-4-Flash 价格极低，适合高频查询'
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '一个 Key 可以调多家开源模型'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    note: '国内访问需要自备网络条件'
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-3-5-sonnet-latest'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: '使用 Anthropic 原生 /messages 协议'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    keyUrl: 'https://aistudio.google.com/apikey',
    note: '走 Gemini 的 OpenAI 兼容层'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter 聚合',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'],
    keyUrl: 'https://openrouter.ai/keys',
    note: '一个 Key 转发各家模型，模型名要带前缀'
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    protocol: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: ['qwen2.5:7b', 'qwen3:8b', 'llama3.1:8b'],
    note: '本机跑模型，数据不出内网；Key 随便填或留空',
    local: true
  },
  {
    id: 'lmstudio',
    label: 'LM Studio（本地）',
    protocol: 'openai',
    baseUrl: 'http://127.0.0.1:1234/v1',
    models: ['local-model'],
    note: '在 LM Studio 里启动本地服务后使用',
    local: true
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    protocol: 'openai',
    baseUrl: '',
    models: [],
    note: '填写公司网关或自建服务的 Base URL 与模型名'
  }
]

export const DEFAULT_AI_PROVIDER = 'deepseek'

export function findProvider(id: string): AiProviderPreset {
  return AI_PROVIDERS.find((item) => item.id === id) ?? AI_PROVIDERS[0]
}

/** 发给界面的配置视图：永远不含明文 Key */
export interface AiConfigView {
  providerId: string
  protocol: AiProtocol
  baseUrl: string
  model: string
  hasApiKey: boolean
  encrypted: boolean
  temperature: number
  /** 修改库存前是否需要在界面上点一次确认 */
  confirmWrites: boolean
  /** 追加到系统提示词里的自定义说明，例如公司物料命名习惯 */
  extraPrompt: string
  /** 是否已经具备发起对话的条件 */
  ready: boolean
  lastConversationId: string | null
}

export interface AiConfigPatch {
  providerId?: string
  baseUrl?: string
  model?: string
  /** 不传＝保持原 Key；传空字符串＝清除 */
  apiKey?: string
  temperature?: number
  confirmWrites?: boolean
  extraPrompt?: string
}

export interface AiTestResult {
  ok: boolean
  message: string
  latencyMs: number
  model: string
  /** 模型返回的示例文本，用来确认链路通 */
  sample?: string
}

/* ------------------------------ 可用模型 ------------------------------ */

export interface AiModelInfo {
  /** 请求时填进 model 字段的标识 */
  id: string
  /** 服务商给的可读名称，例如 Claude 的 display_name */
  label?: string
  /** 上下文长度之类的补充信息 */
  hint?: string
}

export interface AiModelListQuery {
  providerId?: string
  baseUrl?: string
  /** 界面上刚填、还没保存的 Key；为空时用已保存的那份 */
  apiKey?: string
}

export interface AiModelListResult {
  models: AiModelInfo[]
  latencyMs: number
}

/* ------------------------------ 对话数据 ------------------------------ */

export interface AiAttachmentMeta {
  name: string
  rows: number
  bytes: number
}

export interface AiToolTrace {
  callId: string
  name: string
  title: string
  args: Record<string, unknown>
  ok: boolean
  summary: string
}

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools: AiToolTrace[]
  attachments: AiAttachmentMeta[]
  createdAt: string
  /** 该条助手消息未能完成时的错误说明 */
  error?: string
}

export interface AiConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------ 流式事件 ------------------------------ */

export type AiEvent =
  | { type: 'start'; assistantId: string; conversationId: string }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-start'; callId: string; name: string; title: string; args: Record<string, unknown> }
  | { type: 'tool-result'; callId: string; ok: boolean; summary: string }
  | {
      type: 'confirm-request'
      callId: string
      name: string
      title: string
      args: Record<string, unknown>
      summary: string
    }
  | { type: 'step'; step: number }
  | { type: 'done'; messageId: string }
  | { type: 'aborted' }
  | { type: 'error'; message: string; code?: string }

export interface AiSendPayload {
  conversationId?: string
  text: string
  /** 由主进程解析好的报表文本，直接拼进本轮上下文 */
  reportText?: string
  reportMeta?: AiAttachmentMeta
}

export interface ParsedReport {
  meta: AiAttachmentMeta
  text: string
  /** 解析到的表头，界面上可以顺手展示 */
  headers: string[]
  truncated: boolean
}
