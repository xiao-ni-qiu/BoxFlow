import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_AI_PROVIDER,
  findProvider,
  type AiConfigPatch,
  type AiConfigView
} from '@shared/ai'

/**
 * 落盘形态：API Key 只以密文出现。
 * 与 WebDAV 密码同样的策略——settings.json 里不出现任何密钥，
 * 明文只在主进程内存里短暂存在，永远不通过 IPC 回传给渲染进程。
 */
interface StoredAiConfig {
  providerId: string
  baseUrl: string
  model: string
  /** `enc:<base64>` 系统密钥加密；`raw:<base64>` 无密钥环时的降级形态 */
  secret: string
  temperature: number
  confirmWrites: boolean
  extraPrompt: string
  lastConversationId: string | null
}

function defaults(): StoredAiConfig {
  const preset = findProvider(DEFAULT_AI_PROVIDER)
  return {
    providerId: preset.id,
    baseUrl: preset.baseUrl,
    model: preset.models[0] ?? '',
    secret: '',
    temperature: 0.3,
    confirmWrites: true,
    extraPrompt: '',
    lastConversationId: null
  }
}

let cache: StoredAiConfig | null = null

function storeFile(): string {
  return join(app.getPath('userData'), 'ai.json')
}

export function loadConfig(): StoredAiConfig {
  if (cache) return cache
  const file = storeFile()
  if (!existsSync(file)) {
    cache = defaults()
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoredAiConfig>
    cache = { ...defaults(), ...parsed }
  } catch {
    cache = defaults()
  }
  return cache
}

function persist(next: StoredAiConfig): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(storeFile(), JSON.stringify(next, null, 2), 'utf8')
  cache = next
}

function encrypt(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(plain).toString('base64')}`
  }
  return `raw:${Buffer.from(plain, 'utf8').toString('base64')}`
}

export function readApiKey(): string {
  const { secret } = loadConfig()
  if (!secret) return ''
  const scheme = secret.slice(0, 4)
  const payload = secret.slice(4)
  try {
    if (scheme === 'enc:') return safeStorage.decryptString(Buffer.from(payload, 'base64'))
    if (scheme === 'raw:') return Buffer.from(payload, 'base64').toString('utf8')
  } catch {
    return ''
  }
  return ''
}

export function toView(config: StoredAiConfig = loadConfig()): AiConfigView {
  const preset = findProvider(config.providerId)
  return {
    providerId: config.providerId,
    protocol: preset.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: Boolean(config.secret),
    encrypted: config.secret.startsWith('enc:'),
    temperature: config.temperature,
    confirmWrites: config.confirmWrites,
    extraPrompt: config.extraPrompt,
    ready: Boolean(config.baseUrl.trim() && config.model.trim() && (config.secret || preset.local)),
    lastConversationId: config.lastConversationId
  }
}

export function saveConfig(patch: AiConfigPatch): AiConfigView {
  const current = loadConfig()
  const next: StoredAiConfig = { ...current }

  if (patch.providerId !== undefined) next.providerId = patch.providerId
  if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl.trim().replace(/\/+$/, '')
  if (patch.model !== undefined) next.model = patch.model.trim()
  if (patch.temperature !== undefined) {
    next.temperature = Math.min(Math.max(patch.temperature, 0), 2)
  }
  if (patch.confirmWrites !== undefined) next.confirmWrites = patch.confirmWrites
  if (patch.extraPrompt !== undefined) next.extraPrompt = patch.extraPrompt.slice(0, 4000)
  if (patch.apiKey !== undefined) next.secret = patch.apiKey ? encrypt(patch.apiKey) : ''

  persist(next)
  return toView(next)
}

export function rememberConversation(conversationId: string | null): void {
  const current = loadConfig()
  if (current.lastConversationId === conversationId) return
  persist({ ...current, lastConversationId: conversationId })
}
