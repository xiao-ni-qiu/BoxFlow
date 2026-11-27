import { getDb } from '../../db'
import type { Page, Supplier, SupplierListQuery } from '@shared/types'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/constants'

interface SupplierRow {
  id: string
  code: string | null
  name: string
  short_name: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  website: string | null
  payment_terms: string | null
  level: number
  tags: string | null
  note: string | null
  status: string
  created_at: string
  updated_at: string
  component_count: number
  total_quantity: number
}

function map(row: SupplierRow): Supplier {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortName: row.short_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    website: row.website,
    paymentTerms: row.payment_terms,
    level: row.level,
    tags: row.tags,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    componentCount: row.component_count,
    totalQuantity: row.total_quantity
  }
}

const SELECT = `
  SELECT s.*,
    (SELECT COUNT(*) FROM components c WHERE c.supplier_id = s.id AND c.status = 'active') AS component_count,
    (SELECT ifnull(SUM(c.quantity), 0) FROM components c WHERE c.supplier_id = s.id AND c.status = 'active') AS total_quantity
  FROM suppliers s
`

export const suppliersRepo = {
  list(query: SupplierListQuery): Page<Supplier> {
    const db = getDb()
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE))

    const parts: string[] = []
    const params: Record<string, unknown> = {}
    const status = query.status ?? 'active'
    if (status !== 'all') {
      parts.push('s.status = @status')
      params.status = status
    }
    if (query.q && query.q.trim()) {
      parts.push(
        `(s.name LIKE @kw ESCAPE '\\' OR ifnull(s.short_name, '') LIKE @kw ESCAPE '\\' OR ifnull(s.contact_name, '') LIKE @kw ESCAPE '\\' OR ifnull(s.phone, '') LIKE @kw ESCAPE '\\')`
      )
      params.kw = `%${query.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    }
    const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''

    const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM suppliers s ${where}`)
    const totalRow = (
      Object.keys(params).length > 0 ? countStmt.get(params) : countStmt.get()
    ) as { n: number }
    const rows = db
      .prepare(`${SELECT} ${where} ORDER BY s.level DESC, s.name COLLATE NOCASE ASC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as SupplierRow[]

    return { items: rows.map(map), total: totalRow.n, page, pageSize }
  },

  get(id: string): Supplier | null {
    const row = getDb().prepare(`${SELECT} WHERE s.id = ?`).get(id) as SupplierRow | undefined
    return row ? map(row) : null
  },

  findByName(name: string): Supplier | null {
    const row = getDb().prepare(`${SELECT} WHERE s.name = ? LIMIT 1`).get(name) as SupplierRow | undefined
    return row ? map(row) : null
  },

  insert(data: Record<string, unknown>): string {
    const id = String(data.id)
    getDb()
      .prepare(
        `INSERT INTO suppliers (id, code, name, short_name, contact_name, phone, email, address, website,
          payment_terms, level, tags, note, status, created_at, updated_at)
         VALUES (@id, @code, @name, @shortName, @contactName, @phone, @email, @address, @website,
          @paymentTerms, @level, @tags, @note, 'active', @ts, @ts)`
      )
      .run({ ...data, id })
    return id
  },

  update(id: string, patch: Record<string, unknown>, allowed: Record<string, string>): void {
    const sets: string[] = []
    const params: Record<string, unknown> = { id, ts: new Date().toISOString() }
    for (const [key, column] of Object.entries(allowed)) {
      if (key in patch) {
        sets.push(`${column} = @${key}`)
        params[key] = patch[key]
      }
    }
    if (!sets.length) return
    sets.push('updated_at = @ts')
    getDb().prepare(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = @id`).run(params)
  },

  setStatus(id: string, status: string): void {
    getDb()
      .prepare('UPDATE suppliers SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id)
  },

  allActive(): Supplier[] {
    const rows = getDb()
      .prepare(`${SELECT} WHERE s.status = 'active' ORDER BY s.name COLLATE NOCASE ASC`)
      .all() as SupplierRow[]
    return rows.map(map)
  }
}
