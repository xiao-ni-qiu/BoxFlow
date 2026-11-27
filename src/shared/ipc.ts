export const IPC = {
  componentsList: 'components:list',
  componentsGet: 'components:get',
  componentsCreate: 'components:create',
  componentsUpdate: 'components:update',
  componentsArchive: 'components:archive',
  componentsRestore: 'components:restore',
  componentsRemovalImpact: 'components:removalImpact',
  componentsDelete: 'components:delete',
  componentsFacets: 'components:facets',
  componentsMovements: 'components:movements',

  suppliersList: 'suppliers:list',
  suppliersGet: 'suppliers:get',
  suppliersCreate: 'suppliers:create',
  suppliersUpdate: 'suppliers:update',
  suppliersArchive: 'suppliers:archive',

  movementsCreate: 'movements:create',
  movementsList: 'movements:list',

  locationsTree: 'locations:tree',
  locationsCreate: 'locations:create',
  locationsUpdate: 'locations:update',
  locationsDelete: 'locations:delete',

  stats: 'stats:overview',

  mcpStatus: 'mcp:status',
  mcpRestart: 'mcp:restart',
  mcpRotateToken: 'mcp:rotateToken',

  aiConfig: 'ai:config',
  aiSaveConfig: 'ai:saveConfig',
  aiTest: 'ai:test',
  aiListModels: 'ai:listModels',
  aiConversations: 'ai:conversations',
  aiLatest: 'ai:latest',
  aiMessages: 'ai:messages',
  aiNewConversation: 'ai:newConversation',
  aiDeleteConversation: 'ai:deleteConversation',
  aiSend: 'ai:send',
  aiAbort: 'ai:abort',
  aiConfirm: 'ai:confirm',
  aiPickReport: 'ai:pickReport',
  aiOpenKeyUrl: 'ai:openKeyUrl',

  transferExport: 'transfer:export',
  transferTemplate: 'transfer:template',
  transferPickFile: 'transfer:pickFile',
  transferPreview: 'transfer:preview',
  transferRemap: 'transfer:remap',
  transferRun: 'transfer:run',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsPickDataDir: 'settings:pickDataDir',
  settingsOpenDataDir: 'settings:openDataDir',
  settingsBackupNow: 'settings:backupNow',
  settingsResetDemo: 'settings:resetDemo',

  webdavStatus: 'webdav:status',
  webdavSave: 'webdav:save',
  webdavTest: 'webdav:test',
  webdavBackup: 'webdav:backup',
  webdavList: 'webdav:list',
  webdavRestore: 'webdav:restore',

  appInfo: 'app:info',
  appOpenExternal: 'app:openExternal',

  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface IpcOk<T> {
  ok: true
  data: T
}

export interface IpcFail {
  ok: false
  error: { code: string; message: string; details?: unknown }
}

export type IpcResult<T> = IpcOk<T> | IpcFail

export interface WindowState {
  maximized: boolean
}

export interface ApiBridge {
  invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<IpcResult<T>>
  onMainMessage: (handler: (message: string) => void) => () => void
  /** AI 助手的流式事件：token 增量、工具调用、确认请求等 */
  onAiEvent: (handler: (event: unknown) => void) => () => void
  /** 窗口最大化/还原状态变化（含双击标题栏、拖拽吸附等非按钮触发的场景） */
  onWindowState: (handler: (state: WindowState) => void) => () => void
}
