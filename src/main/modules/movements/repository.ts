import { getDb } from '../../db'
import type { Movement, MovementListQuery, Page } from '@shared/types'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/constants'

interface MovementRow {
  id: string
  component_id: string
  type: string
  quantity: number
  before_qty: number
  after_qty: number
  unit_price: number | null
  supplier_id: string | null
  date_code: string | null
  project_ref: string | null
  operator: string
  note: string | null
  occurred_at: string
  created_at: string
  part_number: string | null
  manufacturer: string | null
  supplier_name: string | null
}

function map(row: MovementRow): Movement {
  return {
    id: row.id,
    componentId: row.component_id,
    type: row.type,
    quantity: row.quantity,
    beforeQty: row.before_qty,
    afterQty: row.after_qty,
    unitPrice: row.unit_price,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    dateCode: row.date_code,
    projectRef: row.project_ref,
    operator: row.operator,
    note: row.note,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    partNumber: row.part_number ?? undefined,
    manufacturer: row.manufacturer ?? undefined
  }
}

const FROM = `
  FROM stock_movements m
  LEFT JOIN components c ON c.id = m.component_id
  LEFT JOIN suppliers s ON s.id = m.supplier_id
`

export const movementsRepo = {
  insert(data: {
    id: string
    componentId: string
    type: string
    quantity: number
    beforeQty: number
    afterQty: number
    unitPrice: number | null
    supplierId: string | null
    dateCode: string | null
    projectRef: string | null
    operator: string
    note: string | null
    occurredAt: string
    createdAt: string
  }): void {
    getDb()
      .prepare(
        `INSERT INTO stock_movements (
          id, component_id, type, quantity, before_qty, after_qty, unit_price,
          supplier_id, date_code, project_ref, operator, note, occurred_at, created_at
        ) VALUES (
          @id, @componentId, @type, @quantity, @beforeQty, @afterQty, @unitPrice,
          @supplierId, @dateCode, @projectRef, @operator, @note, @occurredAt, @createdAt
        )`
      )
      .run(data)
  },

  list(query: MovementListQuery): Page<Movement> {
    const db = getDb()
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE))

    const parts: string[] = []
    const params: Record<string, unknown> = {}

    if (query.componentId) {
      parts.push('m.component_id = @componentId')
      params.componentId = query.componentId
    }
    if (query.type) {
      parts.push('m.type = @type')
      params.type = query.type
    }
    if (query.source === 'local') {
      parts.push("m.operator = 'local'")
    } else if (query.source === 'ai') {
      parts.push("m.operator LIKE 'mcp:%'")
    }

    const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''

    const countStmt = db.prepare(`SELECT COUNT(*) AS n ${FROM} ${where}`)
    const total = (
      Object.keys(params).length > 0 ? countStmt.get(params) : countStmt.get()
    ) as { n: number }

    const rows = db
      .prepare(
        `SELECT m.*, c.part_number, c.manufacturer, s.name AS supplier_name
         ${FROM} ${where}
         ORDER BY m.occurred_at DESC, m.created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as MovementRow[]

    return { items: rows.map(map), total: total.n, page, pageSize }
  },

  forComponent(componentId: string, limit = 20): Movement[] {
    const rows = getDb()
      .prepare(
        `SELECT m.*, c.part_number, c.manufacturer, s.name AS supplier_name
         ${FROM} WHERE m.component_id = ? ORDER BY m.occurred_at DESC LIMIT ?`
      )
      .all(componentId, limit) as MovementRow[]
    return rows.map(map)
  }
}
