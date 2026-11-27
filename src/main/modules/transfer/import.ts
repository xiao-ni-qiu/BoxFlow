import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable, type Stream } from 'node:stream'
import iconv from 'iconv-lite'
import { componentsRepo } from '../components/repository'
import { componentsService } from '../components/service'
import { suppliersRepo } from '../suppliers/repository'
import { suppliersService } from '../suppliers/service'
import { movementsService } from '../movements/service'
import { locationsService } from '../locations/service'
import type {
  ColumnDef,
  DuplicateStrategy,
  ImportPreview,
  ImportPreviewRow,
  ImportResult,
  TransferEntity
} from '@shared/transfer'
import { ENTITY_COLUMNS } from '@shared/transfer'
import { normalizeKind, type ItemKind } from '@shared/constants'

/* ---------------------------- 文件解析 ---------------------------- */

export interface ParsedSheet {
  headers: string[]
  rows: { row: number; cells: string[] }[]
}

/**
 * Excel 另存的 CSV 在国内多为 GBK，直接按 UTF-8 读会全是乱码。
 * 先看 BOM，再看 UTF-8 解码是否出现替换字符，兜底走 GBK。
 */
function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8')
  }
  const asUtf8 = buffer.toString('utf8')
  if (!asUtf8.includes('\uFFFD')) return asUtf8
  return iconv.decode(buffer, 'gbk')
}

function cellToText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const anyValue = value as unknown as Record<string, unknown>
    if (typeof anyValue.text === 'string') return anyValue.text.trim()
    if (Array.isArray(anyValue.richText)) {
      return (anyValue.richText as { text: string }[]).map((p) => p.text).join('').trim()
    }
    if (anyValue.result !== undefined && anyValue.result !== null) return String(anyValue.result)
    if (typeof anyValue.hyperlink === 'string') return anyValue.hyperlink
  }
  return String(value).trim()
}

export async function parseSheet(filePath: string): Promise<ParsedSheet> {
  const ext = extname(filePath).toLowerCase()
  const workbook = new ExcelJS.Workbook()

  if (ext === '.csv' || ext === '.txt') {
    const text = decodeCsvBuffer(readFileSync(filePath))
    await workbook.csv.read(Readable.from([text]) as unknown as Stream)
  } else if (ext === '.xlsx' || ext === '.xlsm') {
    await workbook.xlsx.load(readFileSync(filePath) as unknown as ArrayBuffer)
  } else {
    throw new Error('只支持 .xlsx 与 .csv 文件')
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('文件里没有工作表')

  // 找第一行非空行当表头
  let headerRowNumber = 0
  const headers: string[] = []

  for (let r = 1; r <= Math.min(sheet.rowCount, 10); r += 1) {
    const row = sheet.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= row.cellCount; c += 1) cells.push(cellToText(row.getCell(c)))
    if (cells.filter(Boolean).length >= 1) {
      headerRowNumber = r
      headers.push(...cells)
      break
    }
  }

  if (!headerRowNumber) throw new Error('没找到表头行')

  const rows: { row: number; cells: string[] }[] = []
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    const cells: string[] = []
    let hasValue = false
    for (let c = 1; c <= headers.length; c += 1) {
      const text = cellToText(row.getCell(c))
      if (text) hasValue = true
      cells.push(text)
    }
    if (hasValue) rows.push({ row: r, cells })
  }

  // 表头去空尾
  while (headers.length && !headers[headers.length - 1]) headers.pop()

  return { headers, rows }
}

/* ---------------------------- 值转换 ---------------------------- */

function toInt(raw: string): number | null {
  const cleaned = raw.replace(/[,\s，]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value)
}

function toPrice(raw: string): number | null {
  const cleaned = raw.replace(/[¥$€,\s，]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function toBool(raw: string): boolean | null {
  const key = raw.trim().toLowerCase()
  if (!key) return null
  if (['是', 'y', 'yes', 'true', '1', '√', '符合'].includes(key)) return true
  if (['否', 'n', 'no', 'false', '0', '×', '不符合', ''].includes(key)) return false
  return null
}

function convertValue(col: ColumnDef, raw: string): { value: string | number | boolean | null; error?: string } {
  if (!raw) return { value: null }
  if (col.kind === 'int') {
    const value = toInt(raw)
    return value === null ? { value: null, error: `${col.label}「${raw}」不是整数` } : { value }
  }
  if (col.kind === 'price') {
    const value = toPrice(raw)
    return value === null ? { value: null, error: `${col.label}「${raw}」不是有效数字` } : { value }
  }
  if (col.kind === 'bool') {
    const value = toBool(raw)
    return value === null ? { value: null, error: `${col.label}「${raw}」无法识别为是/否` } : { value }
  }
  return { value: raw }
}

/* ---------------------------- 预览 ---------------------------- */

export interface BuildPreviewInput {
  entity: Extract<TransferEntity, 'components' | 'suppliers'>
  sheet: ParsedSheet
  mapping: Record<string, string>
  strategy: DuplicateStrategy
  /** 文件里没有"大类"列时，按发起导入的页面归类 */
  defaultKind?: ItemKind
}

export function buildPreview(input: BuildPreviewInput): ImportPreview {
  const { entity, sheet, mapping, strategy, defaultKind } = input
  const columns = ENTITY_COLUMNS[entity]
  const byKey = new Map(columns.map((c) => [c.key, c]))

  // 表头索引 -> 字段 key
  const columnIndex: { index: number; key: string }[] = []
  sheet.headers.forEach((header, index) => {
    const key = mapping[header]
    if (key) columnIndex.push({ index, key })
  })

  const unmapped = sheet.headers.filter((h) => h && !mapping[h])
  const rows: ImportPreviewRow[] = []

  for (const source of sheet.rows) {
    const values: Record<string, string | number | boolean | null> = {}
    const errors: string[] = []

    for (const { index, key } of columnIndex) {
      const col = byKey.get(key)
      if (!col) continue
      const { value, error } = convertValue(col, source.cells[index] ?? '')
      if (error) errors.push(error)
      values[key] = value
    }

    // 大类在文件里是可选的：没有就归到当前页面所属大类
    if (entity === 'components') {
      values.kind = normalizeKind(values.kind ?? defaultKind)
    }

    for (const col of columns) {
      if (!col.required) continue
      const value = values[col.key]
      if (value === null || value === undefined || value === '') {
        // 供应商的名称必填，元器件的型号必填
        if (!errors.some((e) => e.includes(col.label))) errors.push(`${col.label}不能为空`)
      }
    }

    let action: ImportPreviewRow['action'] = errors.length ? 'error' : 'create'
    let existingId: string | undefined
    let existingLabel: string | undefined

    if (!errors.length) {
      if (entity === 'components') {
        const part = String(values.partNumber ?? '').trim()
        const maker = String(values.manufacturer ?? '').trim()
        const pkg = String(values.package ?? '').trim() || null
        const existing = componentsRepo.findByPart(part, maker, pkg)
        if (existing) {
          existingId = existing.id
          existingLabel = `${existing.partNumber}（现有 ${existing.quantity} ${existing.unit}）`
          action = strategy === 'skip' ? 'skip' : 'update'
        }
      } else {
        const name = String(values.name ?? '').trim()
        const existing = suppliersRepo.findByName(name)
        if (existing) {
          existingId = existing.id
          existingLabel = existing.name
          action = strategy === 'skip' ? 'skip' : 'update'
        }
      }
    }

    rows.push({ row: source.row, values, errors, action, existingId, existingLabel })
  }

  const summary = {
    total: rows.length,
    create: rows.filter((r) => r.action === 'create').length,
    update: rows.filter((r) => r.action === 'update').length,
    skip: rows.filter((r) => r.action === 'skip').length,
    error: rows.filter((r) => r.action === 'error').length
  }

  return { headers: sheet.headers, mapping, unmapped, rows, summary }
}

/* ---------------------------- 执行 ---------------------------- */

export interface ExecuteInput {
  entity: Extract<TransferEntity, 'components' | 'suppliers'>
  preview: ImportPreview
  strategy: DuplicateStrategy
  operator: string
}

export function executeImport(input: ExecuteInput): ImportResult {
  const { entity, preview, strategy, operator } = input
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: [] }

  for (const row of preview.rows) {
    if (row.action === 'error') {
      result.failed.push({ row: row.row, message: row.errors.join('；') || '数据不合法' })
      continue
    }
    if (row.action === 'skip') {
      result.skipped += 1
      continue
    }

    try {
      if (entity === 'components') {
        importComponentRow(row, strategy, operator, result)
      } else {
        importSupplierRow(row, strategy, result)
      }
    } catch (err) {
      result.failed.push({
        row: row.row,
        message: err instanceof Error ? err.message : '写入失败'
      })
    }
  }

  return result
}

function importComponentRow(
  row: ImportPreviewRow,
  strategy: DuplicateStrategy,
  operator: string,
  result: ImportResult
): void {
  const v = row.values
  const partNumber = String(v.partNumber ?? '').trim()
  const manufacturer = String(v.manufacturer ?? '').trim()
  const quantity = typeof v.quantity === 'number' ? v.quantity : 0
  const supplierName = String(v.supplierName ?? '').trim()

  const supplier = supplierName ? suppliersRepo.findByName(supplierName) : null
  const locationCode = String(v.locationCode ?? '').trim()
  const rawPhoto = String(v.imageUrl ?? '').trim()

  const payload = {
    kind: normalizeKind(v.kind),
    partNumber,
    manufacturer,
    category: (v.category as string) || null,
    package: (v.package as string) || null,
    description: (v.description as string) || null,
    dateCode: (v.dateCode as string) || null,
    packaging: (v.packaging as string) || null,
    unit: (v.unit as string) || '个',
    safetyStock: typeof v.safetyStock === 'number' ? v.safetyStock : 0,
    unitPrice: typeof v.unitPrice === 'number' ? v.unitPrice : null,
    currency: (v.currency as string) || 'CNY',
    msl: typeof v.msl === 'number' ? v.msl : null,
    rohs: v.rohs === true,
    locationCode: locationCode || null,
    supplierId: supplier?.id ?? null,
    tags: (v.tags as string) || null,
    note: (v.note as string) || null,
    // 相对路径、网盘链接之类的写错不该让整行导入失败，只丢这一列
    imageUrl: /^https?:\/\/\S+$/i.test(rawPhoto) ? rawPhoto : null
  }

  if (!row.existingId) {
    componentsService.create({ ...payload, quantity })
    result.created += 1
    return
  }

  if (strategy === 'overwrite') {
    // 字段按文件覆盖，数量单独走盘点，保证流水可追溯
    componentsService.update(row.existingId, payload)
    const existing = componentsRepo.get(row.existingId)
    if (existing && existing.quantity !== quantity) {
      movementsService.create({
        componentId: row.existingId,
        type: 'adjust',
        quantity,
        operator,
        note: '导入覆盖盘点'
      })
    }
    result.updated += 1
    return
  }

  // merge：只把数量加进去，其余字段保持原样
  if (quantity > 0) {
    movementsService.create({
      componentId: row.existingId,
      type: 'in',
      quantity,
      supplierId: supplier?.id ?? null,
      operator,
      note: '导入合并入库'
    })
  }
  result.updated += 1
}

function importSupplierRow(
  row: ImportPreviewRow,
  strategy: DuplicateStrategy,
  result: ImportResult
): void {
  const v = row.values
  const payload = {
    name: String(v.name ?? '').trim(),
    code: (v.code as string) || null,
    shortName: (v.shortName as string) || null,
    contactName: (v.contactName as string) || null,
    phone: (v.phone as string) || null,
    email: (v.email as string) || null,
    address: (v.address as string) || null,
    website: (v.website as string) || null,
    paymentTerms: (v.paymentTerms as string) || null,
    level: typeof v.level === 'number' ? v.level : null,
    tags: (v.tags as string) || null,
    note: (v.note as string) || null
  }

  if (!row.existingId) {
    suppliersService.create(payload)
    result.created += 1
    return
  }

  if (strategy === 'overwrite') {
    suppliersService.update(row.existingId, payload)
    result.updated += 1
    return
  }

  result.skipped += 1
}

/** 生成一份空白模板，让用户知道该填哪些列 */
export function templateRows(entity: Extract<TransferEntity, 'components' | 'suppliers'>) {
  if (entity === 'suppliers') {
    return [
      {
        name: '深圳市华强电子有限公司',
        code: 'SUP-001',
        shortName: '华强',
        contactName: '张工',
        phone: '0755-88886666',
        email: 'sales@example.com',
        address: '深圳市福田区华强北路',
        website: 'https://example.com',
        paymentTerms: '月结30天',
        level: 2,
        tags: '主力,现货',
        note: '示例行，可删除'
      }
    ]
  }

  return [
    {
      kind: '电子元器件',
      partNumber: 'STM32F103C8T6',
      manufacturer: 'ST',
      category: 'MCU',
      package: 'LQFP-48',
      quantity: 120,
      unit: '个',
      safetyStock: 50,
      locationCode: 'A-01-03',
      unitPrice: 9.5,
      currency: 'CNY',
      packaging: '托盘',
      dateCode: '2438',
      msl: 3,
      rohs: true,
      supplierName: '',
      tags: '常用',
      description: 'ARM Cortex-M3 72MHz 64KB Flash',
      note: '示例行，可删除'
    }
  ]
}

/** 库位编码从导入数据里补建，避免用户被迫先维护位置表 */
export function ensureLocationsFromRows(rows: ImportPreviewRow[]): void {
  for (const row of rows) {
    const code = String(row.values.locationCode ?? '').trim()
    if (code) locationsService.ensureByCode(code)
  }
}
