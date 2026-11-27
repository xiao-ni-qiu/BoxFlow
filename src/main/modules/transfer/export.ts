import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import type { ColumnDef } from '@shared/transfer'

export type ExportRow = Record<string, string | number | boolean | null>

/* ---------------------------- 文件写入 ---------------------------- */

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cellToText(value: ExportRow[string]): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

/** CSV 带 BOM，否则 Excel 打开中文会乱码 */
async function writeCsv(columns: ColumnDef[], rows: ExportRow[], filePath: string): Promise<void> {
  const lines: string[] = []
  lines.push(columns.map((c) => escapeCsvCell(c.label)).join(','))

  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(cellToText(row[c.key]))).join(','))
  }

  writeFileSync(filePath, `\uFEFF${lines.join('\r\n')}`, 'utf8')
}

async function writeXlsx(columns: ColumnDef[], rows: ExportRow[], filePath: string, sheetName: string): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'BoxFlow'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }]
  })

  sheet.columns = columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.width
  }))

  for (const row of rows) {
    const record: Record<string, unknown> = {}
    for (const col of columns) {
      const value = row[col.key]
      record[col.key] = typeof value === 'boolean' ? (value ? '是' : '否') : (value ?? '')
    }
    sheet.addRow(record)
  }

  // 表头样式
  const header = sheet.getRow(1)
  header.height = 20
  header.font = { bold: true, size: 10.5, color: { argb: 'FF3A3A44' } }
  header.alignment = { vertical: 'middle' }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F2F5' }
  }
  header.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDE3' } } }
  })

  // 正文字号与行高，让导出的表格看起来是"整理过的"
  sheet.eachRow((row, index) => {
    if (index === 1) return
    row.height = 17
    row.font = { size: 10.5 }
    row.alignment = { vertical: 'middle' }
  })

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  writeFileSync(filePath, Buffer.from(buffer))
}

export async function writeExportFile(
  columns: ColumnDef[],
  rows: ExportRow[],
  filePath: string,
  sheetName: string
): Promise<void> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.csv') {
    await writeCsv(columns, rows, filePath)
    return
  }
  await writeXlsx(columns, rows, filePath, sheetName)
}
