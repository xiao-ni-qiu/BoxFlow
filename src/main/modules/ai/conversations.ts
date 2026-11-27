import { getDb } from '../../db'
import { newId, nowIso } from '../../ids'
import type { AiChatMessage, AiConversation, AiToolTrace } from '@shared/ai'

interface ConversationRow {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  tools: string | null
  attachments: string | null
  error: string | null
  created_at: string
}

function mapConversation(row: ConversationRow): AiConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function mapMessage(row: MessageRow): AiChatMessage {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    tools: parseJson<AiToolTrace[]>(row.tools, []),
    attachments: parseJson<AiChatMessage['attachments']>(row.attachments, []),
    error: row.error ?? undefined,
    createdAt: row.created_at
  }
}

export const conversationsRepo = {
  create(title: string): AiConversation {
    const id = newId()
    const ts = nowIso()
    getDb()
      .prepare('INSERT INTO ai_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, title.slice(0, 80), ts, ts)
    return { id, title: title.slice(0, 80), createdAt: ts, updatedAt: ts }
  },

  get(id: string): AiConversation | null {
    const row = getDb().prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id) as
      | ConversationRow
      | undefined
    return row ? mapConversation(row) : null
  },

  latest(): AiConversation | null {
    const row = getDb()
      .prepare('SELECT * FROM ai_conversations ORDER BY updated_at DESC LIMIT 1')
      .get() as ConversationRow | undefined
    return row ? mapConversation(row) : null
  },

  list(limit = 30): AiConversation[] {
    const rows = getDb()
      .prepare('SELECT * FROM ai_conversations ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as ConversationRow[]
    return rows.map(mapConversation)
  },

  touch(id: string, title?: string): void {
    const ts = nowIso()
    if (title) {
      getDb()
        .prepare('UPDATE ai_conversations SET updated_at = ?, title = ? WHERE id = ?')
        .run(ts, title.slice(0, 80), id)
      return
    }
    getDb().prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?').run(ts, id)
  },

  messages(conversationId: string, limit = 200): AiChatMessage[] {
    const rows = getDb()
      .prepare(
        'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
      )
      .all(conversationId, limit) as MessageRow[]
    return rows.map(mapMessage)
  },

  append(message: {
    id?: string
    conversationId: string
    role: 'user' | 'assistant'
    content: string
    tools?: AiToolTrace[]
    attachments?: AiChatMessage['attachments']
    error?: string | null
  }): AiChatMessage {
    const id = message.id ?? newId()
    const ts = nowIso()
    getDb()
      .prepare(
        `INSERT INTO ai_messages (id, conversation_id, role, content, tools, attachments, error, created_at)
         VALUES (@id, @conversationId, @role, @content, @tools, @attachments, @error, @ts)`
      )
      .run({
        id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        tools: message.tools?.length ? JSON.stringify(message.tools) : null,
        attachments: message.attachments?.length ? JSON.stringify(message.attachments) : null,
        error: message.error ?? null,
        ts
      })
    return {
      id,
      role: message.role,
      content: message.content,
      tools: message.tools ?? [],
      attachments: message.attachments ?? [],
      error: message.error ?? undefined,
      createdAt: ts
    }
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM ai_conversations WHERE id = ?').run(id)
  }
}
