import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { IPC } from '@shared/ipc'
import {
  ENTITY_COLUMNS,
  ENTITY_LABELS,
  type DuplicateStrategy,
  type ImportPreview,
  type TransferEntity
} from '@shared/transfer'
import { componentsRepo } from '../modules/components/repository'
import { suppliersRepo } from '../modules/suppliers/repository'
import { movementsRepo } from '../modules/movements/repository'
import {
  buildPreview,
  ensureLocationsFromRows,
  executeImport,
  parseSheet,
  templateRows,
  type ParsedSheet
} from '../modules/transfer/import'
import { writeExportFile, type ExportRow } from '../modules/transfer/export'
import { MOVEMENT_LABELS, KIND_META, type ItemKind } from '@shared/constants'
import { AppError } from '../errors'

/** 解析过的文件按 token 缓存，允许前端反复调映射而不用重复读盘 */
const sheetCache = new Map<string, ParsedSheet>()

function rememberSheet(sheet: ParsedSheet): string {
  const token = randomUUID()
  sheetCache.set(token, sheet)
  if (sheetCache.size > 8) {
    const oldest = sheetCache.keys().next().value
    if (oldest) sheetCache.delete(oldest)
  }
  return token
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ------------------------------ 取全量数据 ------------------------------ */

function collectComponents(kind?: ItemKind): ExportRow[] {
  const rows: ExportRow[] = []
  let page = 1

  for (;;) {
    const chunk = componentsRepo.list({ page, pageSize: 200, status: 'all', sort: 'updated', kind })
    for (const c of chunk.items) {
      rows.push({
        kind: KIND_META[c.kind].label,
        partNumber: c.partNumber,
        manufacturer: c.manufacturer,
        category: c.category,
        package: c.package,
        quantity: c.quantity,
        unit: c.unit,
        safetyStock: c.safetyStock,
        locationCode: c.locationFullCode,
        unitPrice: c.unitPrice,
        currency: c.currency,
        packaging: c.packaging,
        dateCode: c.dateCode,
        msl: c.msl,
        rohs: c.rohs ? true : false,
        supplierName: c.supplierName,
        tags: c.tags,
        description: c.description,
        note: c.status === 'archived' ? `[已归档] ${c.note ?? ''}`.trim() : c.note
      })
    }
    if (rows.length >= chunk.total || !chunk.items.length) break
    page += 1
  }

  return rows
}

function collectSuppliers(): ExportRow[] {
  const rows: ExportRow[] = []
  let page = 1

  for (;;) {
    const chunk = suppliersRepo.list({ page, pageSize: 200, status: 'all' })
    for (const s of chunk.items) {
      rows.push({
        name: s.name,
        code: s.code,
        shortName: s.shortName,
        contactName: s.contactName,
        phone: s.phone,
        email: s.email,
        address: s.address,
        website: s.website,
        paymentTerms: s.paymentTerms,
        level: s.level,
        tags: s.tags,
        note: s.status === 'archived' ? `[已归档] ${s.note ?? ''}`.trim() : s.note
      })
    }
    if (rows.length >= chunk.total || !chunk.items.length) break
    page += 1
  }

  return rows
}

function collectMovements(): ExportRow[] {
  const rows: ExportRow[] = []
  let page = 1

  for (;;) {
    const chunk = movementsRepo.list({ page, pageSize: 200 })
    for (const m of chunk.items) {
      rows.push({
        occurredAt: fmtDateTime(m.occurredAt),
        partNumber: m.partNumber ?? '',
        manufacturer: m.manufacturer ?? '',
        type: MOVEMENT_LABELS[m.type] ?? m.type,
        quantity: m.quantity,
        beforeQty: m.beforeQty,
        afterQty: m.afterQty,
        unitPrice: m.unitPrice,
        supplierName: m.supplierName ?? '',
        projectRef: m.projectRef,
        operator: m.operator,
        note: m.note
      })
    }
    if (rows.length >= chunk.total || !chunk.items.length) break
    page += 1
  }

  return rows
}

function collectRows(entity: TransferEntity, kind?: ItemKind): ExportRow[] {
  if (entity === 'components') return collectComponents(kind)
  if (entity === 'suppliers') return collectSuppliers()
  return collectMovements()
}

/* ------------------------------ 导出 ------------------------------ */

export async function exportEntity(
  getWindow: () => BrowserWindow | null,
  payload: { entity: TransferEntity; format: 'xlsx' | 'csv'; filePath?: string; kind?: ItemKind }
): Promise<{ path: string; rows: number } | null> {
  const entity = payload.entity
  const format = payload.format ?? 'xlsx'
  // 在某个大类页面导出时只导出该大类，文件名也跟着变
  const kind = entity === 'components' ? payload.kind : undefined
  const label = kind ? KIND_META[kind].label : (ENTITY_LABELS[entity] ?? '数据')
  const stamp = fmtDateTime(new Date().toISOString()).replace(/[: ]/g, '-').slice(0, 16)

  let target = payload.filePath

  // 指定了路径就直接写（自动化测试与批量导出场景），否则走系统保存对话框
  if (!target) {
    const win = getWindow()
    const defaultName = `${label}-${stamp}.${format}`
    const result = win
      ? await dialog.showSaveDialog(win, {
          title: `导出${label}`,
          defaultPath: defaultName,
          filters:
            format === 'csv'
              ? [{ name: 'CSV 文件', extensions: ['csv'] }]
              : [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
        })
      : await dialog.showSaveDialog({ title: `导出${label}`, defaultPath: defaultName })

    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }

  const rows = collectRows(entity, kind)
  await writeExportFile(ENTITY_COLUMNS[entity], rows, target, label)
  return { path: target, rows: rows.length }
}

/** 导出一份只含表头和一行示例的模板 */
export async function exportTemplate(
  getWindow: () => BrowserWindow | null,
  payload: { entity: 'components' | 'suppliers'; format: 'xlsx' | 'csv' }
): Promise<{ path: string } | null> {
  const entity = payload.entity
  const format = payload.format ?? 'xlsx'
  const label = ENTITY_LABELS[entity]

  const win = getWindow()
  const defaultName = `${label}-导入模板.${format}`
  const result = win
    ? await dialog.showSaveDialog(win, {
        title: `保存${label}模板`,
        defaultPath: defaultName,
        filters:
          format === 'csv'
            ? [{ name: 'CSV 文件', extensions: ['csv'] }]
            : [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
      })
    : await dialog.showSaveDialog({ title: `保存${label}模板`, defaultPath: defaultName })

  if (result.canceled || !result.filePath) return null

  await writeExportFile(ENTITY_COLUMNS[entity], templateRows(entity) as ExportRow[], result.filePath, label)
  return { path: result.filePath }
}

/* ------------------------------ 导入 ------------------------------ */

export async function pickImportFile(getWindow: () => BrowserWindow | null): Promise<string | null> {
  const win = getWindow()
  const options = {
    title: '选择要导入的文件',
    properties: ['openFile' as const],
    filters: [
      { name: '表格文件', extensions: ['xlsx', 'xlsm', 'csv'] },
      { name: 'Excel 工作簿', extensions: ['xlsx', 'xlsm'] },
      { name: 'CSV 文件', extensions: ['csv'] }
    ]
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
}

export interface PreviewPayload {
  token: string
  preview: ImportPreview
}

export async function previewImport(payload: {
  entity: 'components' | 'suppliers'
  filePath: string
  mapping?: Record<string, string>
  kind?: ItemKind
}): Promise<PreviewPayload> {
  const sheet = await parseSheet(payload.filePath)
  if (!sheet.rows.length) {
    throw new AppError('VALIDATION_FAILED', '文件里没有数据行')
  }

  const token = rememberSheet(sheet)
  const preview = buildPreview({
    entity: payload.entity,
    sheet,
    mapping: payload.mapping ?? autoMap(payload.entity, sheet),
    strategy: 'skip',
    defaultKind: payload.kind
  })

  return { token, preview }
}

/** 用缓存的文件重新按新映射生成预览 */
export function remapPreview(payload: {
  token: string
  entity: 'components' | 'suppliers'
  mapping: Record<string, string>
  strategy: DuplicateStrategy
  kind?: ItemKind
}): ImportPreview {
  const sheet = sheetCache.get(payload.token)
  if (!sheet) throw new AppError('VALIDATION_FAILED', '文件缓存已失效，请重新选择文件')
  return buildPreview({
    entity: payload.entity,
    sheet,
    mapping: payload.mapping,
    strategy: payload.strategy,
    defaultKind: payload.kind
  })
}

export function runImport(payload: {
  entity: 'components' | 'suppliers'
  preview: ImportPreview
  strategy: DuplicateStrategy
  operator?: string
}) {
  // 先把库里没有的库位补上，避免逐行建档时反复查不到
  ensureLocationsFromRows(payload.preview.rows)

  const result = executeImport({
    entity: payload.entity,
    preview: payload.preview,
    strategy: payload.strategy,
    operator: payload.operator?.trim() || 'ui:import'
  })

  // 导入完清掉缓存，避免内存里压着整张表
  for (const [token, sheet] of sheetCache) {
    if (sheet.rows.length === payload.preview.rows.length) sheetCache.delete(token)
  }

  return result
}

/** 表头自动映射：能对上就对上，剩下的让用户在界面里指定 */
function autoMap(entity: 'components' | 'suppliers', sheet: ParsedSheet): Record<string, string> {
  const columns = ENTITY_COLUMNS[entity]
  const mapping: Record<string, string> = {}
  const normalize = (s: string): string =>
    s.replace(/^\uFEFF/, '').replace(/[\s_\-()[\]（）]/g, '').toLowerCase()

  // 精确匹配优先，其次做包含匹配，避免"数量"和"数量(个)"被漏掉
  const used = new Set<string>()

  for (const header of sheet.headers) {
    if (!header) continue
    const key = normalize(header)
    const exact = columns.find(
      (c) =>
        !used.has(c.key) &&
        (normalize(c.label) === key ||
          normalize(c.key) === key ||
          c.aliases.some((a) => normalize(a) === key))
    )
    if (exact) {
      mapping[header] = exact.key
      used.add(exact.key)
    }
  }

  for (const header of sheet.headers) {
    if (!header || mapping[header]) continue
    const key = normalize(header)
    const loose = columns.find(
      (c) =>
        !used.has(c.key) &&
        (key.includes(normalize(c.label)) || normalize(c.label).includes(key))
    )
    if (loose && key.length >= 2) {
      mapping[header] = loose.key
      used.add(loose.key)
    }
  }

  return mapping
}

export const TRANSFER_IPC = {
  export: IPC.transferExport,
  exportTemplate: IPC.transferTemplate,
  pickFile: IPC.transferPickFile,
  preview: IPC.transferPreview,
  remap: IPC.transferRemap,
  run: IPC.transferRun
} as const
