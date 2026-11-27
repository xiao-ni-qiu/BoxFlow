import type { ApiBridge } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import type { ItemKind } from '@shared/constants'
import type {
  AiChatMessage,
  AiConfigPatch,
  AiConfigView,
  AiConversation,
  AiEvent,
  AiModelListQuery,
  AiModelListResult,
  AiSendPayload,
  AiTestResult,
  ParsedReport
} from '@shared/ai'
import type {
  DuplicateStrategy,
  ImportPreview,
  ImportResult,
  TransferEntity
} from '@shared/transfer'
import type {
  AppSettings,
  Component,
  ComponentListQuery,
  InventoryStats,
  Movement,
  MovementListQuery,
  Page,
  StorageLocation,
  Supplier,
  SupplierListQuery
} from '@shared/types'

declare global {
  interface Window {
    api: ApiBridge
  }
}

export class ApiError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await window.api.invoke<T>(channel, payload)
  if (!result.ok) {
    throw new ApiError(result.error.code, result.error.message, result.error.details)
  }
  return result.data
}

export interface Facets {
  manufacturers: string[]
  categories: string[]
  locations: string[]
}

export interface LocationNode extends StorageLocation {
  children: LocationNode[]
  componentCount: number
}

export interface OverviewPayload extends InventoryStats {
  lowStock: Component[]
  suppliers: Supplier[]
}

export interface McpStatus {
  running: boolean
  enabled: boolean
  port: number
  endpoint: string
  healthUrl: string
  bridgePath: string
  toolCount: number
  error: string | null
  version: string
}

export interface WebdavStatus {
  configured: boolean
  enabled: boolean
  url: string
  username: string
  hasPassword: boolean
  encrypted: boolean
  remoteDir: string
  autoBackup: boolean
  keepCount: number
  lastBackupAt: string | null
  lastBackupFile: string | null
  lastError: string | null
}

export interface WebdavPatch {
  enabled?: boolean
  url?: string
  username?: string
  password?: string
  remoteDir?: string
  autoBackup?: boolean
  keepCount?: number
}

export interface RemoteBackup {
  name: string
  href: string
  size: number
  modifiedAt: string
}

export interface WebdavTestResult {
  ok: boolean
  message: string
  latencyMs: number
}

export interface WebdavBackupResult {
  file: string
  bytes: number
  at: string
  pruned: string[]
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  v8: string
  platform: string
  packaged: boolean
  dataDir: string
  userData: string
  dbBytes: number
  counts: {
    components: number
    suppliers: number
    movements: number
    locations: number
  }
}

export interface RemovalImpact {
  partNumber: string
  quantity: number
  movements: number
  attachments: number
}

export interface RemovalResult {
  id: string
  partNumber: string
  movements: number
  attachments: number
}

export const api = {
  components: {
    list: (query: ComponentListQuery) => call<Page<Component>>(IPC.componentsList, query),
    get: (id: string) => call<Component>(IPC.componentsGet, { id }),
    create: (input: Record<string, unknown>) => call<Component>(IPC.componentsCreate, input),
    update: (id: string, patch: Record<string, unknown>) =>
      call<Component>(IPC.componentsUpdate, { id, patch }),
    archive: (id: string) => call<boolean>(IPC.componentsArchive, { id }),
    restore: (id: string) => call<boolean>(IPC.componentsRestore, { id }),
    removalImpact: (id: string) => call<RemovalImpact>(IPC.componentsRemovalImpact, { id }),
    remove: (id: string) => call<RemovalResult>(IPC.componentsDelete, { id }),
    facets: (kind?: ItemKind) => call<Facets>(IPC.componentsFacets, { kind }),
    movements: (id: string, limit = 20) => call<Movement[]>(IPC.componentsMovements, { id, limit })
  },
  suppliers: {
    list: (query: SupplierListQuery) => call<Page<Supplier>>(IPC.suppliersList, query),
    create: (input: Record<string, unknown>) => call<Supplier>(IPC.suppliersCreate, input),
    update: (id: string, patch: Record<string, unknown>) =>
      call<Supplier>(IPC.suppliersUpdate, { id, patch }),
    archive: (id: string) => call<boolean>(IPC.suppliersArchive, { id })
  },
  movements: {
    list: (query: MovementListQuery) => call<Page<Movement>>(IPC.movementsList, query),
    create: (input: Record<string, unknown>) =>
      call<{ movement: Movement; quantity: number }>(IPC.movementsCreate, input)
  },
  locations: {
    tree: () => call<LocationNode[]>(IPC.locationsTree),
    create: (input: Record<string, unknown>) => call<StorageLocation>(IPC.locationsCreate, input),
    update: (input: Record<string, unknown>) => call<StorageLocation>(IPC.locationsUpdate, input),
    remove: (id: string) => call<{ id: string }>(IPC.locationsDelete, { id })
  },
  stats: () => call<OverviewPayload>(IPC.stats),
  settings: {
    get: () => call<AppSettings>(IPC.settingsGet),
    update: (patch: Partial<AppSettings>) => call<AppSettings>(IPC.settingsUpdate, patch),
    pickDataDir: () => call<string | null>(IPC.settingsPickDataDir),
    openDataDir: () => call<boolean>(IPC.settingsOpenDataDir),
    backupNow: () => call<{ path: string }>(IPC.settingsBackupNow),
    resetData: () => call<boolean>(IPC.settingsResetDemo)
  },
  mcp: {
    status: () => call<McpStatus>(IPC.mcpStatus),
    restart: () => call<McpStatus>(IPC.mcpRestart),
    rotateToken: () => call<McpStatus>(IPC.mcpRotateToken)
  },
  ai: {
    config: () => call<AiConfigView>(IPC.aiConfig),
    saveConfig: (patch: AiConfigPatch) => call<AiConfigView>(IPC.aiSaveConfig, patch),
    test: () => call<AiTestResult>(IPC.aiTest),
    listModels: (query: AiModelListQuery = {}) =>
      call<AiModelListResult>(IPC.aiListModels, query),
    conversations: () => call<AiConversation[]>(IPC.aiConversations),
    latest: () => call<AiConversation | null>(IPC.aiLatest),
    messages: (conversationId: string) =>
      call<AiChatMessage[]>(IPC.aiMessages, { conversationId }),
    newConversation: () => call<AiConversation>(IPC.aiNewConversation),
    removeConversation: (id: string) => call<boolean>(IPC.aiDeleteConversation, { id }),
    send: (payload: AiSendPayload) =>
      call<{ conversationId: string; userMessageId: string; assistantId: string }>(
        IPC.aiSend,
        payload
      ),
    abort: () => call<boolean>(IPC.aiAbort),
    confirm: (callId: string, approved: boolean) =>
      call<boolean>(IPC.aiConfirm, { callId, approved }),
    pickReport: () => call<ParsedReport | null>(IPC.aiPickReport),
    openKeyUrl: (url: string) => call<boolean>(IPC.aiOpenKeyUrl, { url }),
    onEvent: (handler: (event: AiEvent) => void) =>
      window.api.onAiEvent((event) => handler(event as AiEvent))
  },
  webdav: {
    status: () => call<WebdavStatus>(IPC.webdavStatus),
    save: (patch: WebdavPatch) => call<WebdavStatus>(IPC.webdavSave, patch),
    test: () => call<WebdavTestResult>(IPC.webdavTest),
    backup: () => call<WebdavBackupResult>(IPC.webdavBackup),
    list: () => call<RemoteBackup[]>(IPC.webdavList),
    restore: (name: string) =>
      call<{ file: string; safetySnapshot: string }>(IPC.webdavRestore, { name })
  },
  app: {
    info: () => call<AppInfo>(IPC.appInfo),
    openExternal: (url: string) => call<boolean>(IPC.appOpenExternal, { url })
  },
  transfer: {
    export: (entity: TransferEntity, format: 'xlsx' | 'csv', kind?: ItemKind) =>
      call<{ path: string; rows: number } | null>(IPC.transferExport, { entity, format, kind }),
    template: (entity: 'components' | 'suppliers', format: 'xlsx' | 'csv') =>
      call<{ path: string } | null>(IPC.transferTemplate, { entity, format }),
    pickFile: () => call<string | null>(IPC.transferPickFile),
    preview: (entity: 'components' | 'suppliers', filePath: string, kind?: ItemKind) =>
      call<{ token: string; preview: ImportPreview }>(IPC.transferPreview, {
        entity,
        filePath,
        kind
      }),
    remap: (
      token: string,
      entity: 'components' | 'suppliers',
      mapping: Record<string, string>,
      strategy: DuplicateStrategy,
      kind?: ItemKind
    ) => call<ImportPreview>(IPC.transferRemap, { token, entity, mapping, strategy, kind }),
    run: (entity: 'components' | 'suppliers', preview: ImportPreview, strategy: DuplicateStrategy) =>
      call<ImportResult>(IPC.transferRun, { entity, preview, strategy })
  },
  window: {
    minimize: () => call<boolean>(IPC.windowMinimize),
    maximize: () => call<boolean>(IPC.windowMaximize),
    close: () => call<boolean>(IPC.windowClose)
  }
}
