import { getDb } from '../../db'
import { newId, nowIso } from '../../ids'
import type { Component, ComponentListQuery, Page } from '@shared/types'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizeKind, type ItemKind } from '@shared/constants'

interface ComponentRow {
  id: string
  kind: string
  part_number: string
  manufacturer: string
  category: string | null
  package: string | null
  description: string | null
  date_code: string | null
  packaging: string | null
  quantity: number
  unit: string
  safety_stock: number
  unit_price: number | null
  currency: string
  moq: number | null
  msl: number | null
  rohs: number | null
  location_id: string | null
  location_full_code: string | null
  supplier_id: string | null
  supplier_name: string | null
  image_path: string | null
  image_url: string | null
  tags: string | null
  note: string | null
  status: string
  created_at: string
  updated_at: string
}

const SELECT_FIELDS = `
  c.id, c.kind, c.part_number, c.manufacturer, c.category, c.package, c.description,
  c.date_code, c.packaging, c.quantity, c.unit, c.safety_stock, c.unit_price,
  c.currency, c.moq, c.msl, c.rohs, c.location_id, c.location_full_code,
  c.supplier_id, s.name AS supplier_name, c.image_path, c.image_url, c.tags, c.note,
  c.status, c.created_at, c.updated_at
`

const FROM_JOIN = 'FROM components c LEFT JOIN suppliers s ON s.id = c.supplier_id'

export function mapComponent(row: ComponentRow): Component {
  return {
    id: row.id,
    kind: normalizeKind(row.kind),
    partNumber: row.part_number,
    manufacturer: row.manufacturer ?? '',
    category: row.category,
    package: row.package,
    description: row.description,
    dateCode: row.date_code,
    packaging: row.packaging,
    quantity: row.quantity,
    unit: row.unit,
    safetyStock: row.safety_stock,
    unitPrice: row.unit_price,
    currency: row.currency,
    moq: row.moq,
    msl: row.msl,
    rohs: row.rohs,
    locationId: row.location_id,
    locationFullCode: row.location_full_code,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    imagePath: row.image_path,
    imageUrl: row.image_url,
    tags: row.tags,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`)
}

interface WhereClause {
  sql: string
  params: Record<string, unknown>
}

function buildWhere(query: ComponentListQuery): WhereClause {
  const parts: string[] = []
  const params: Record<string, unknown> = {}

  const status = query.status ?? 'active'
  if (status !== 'all') {
    parts.push('c.status = @status')
    params.status = status
  }

  if (query.q && query.q.trim()) {
    parts.push(`(
      c.part_number LIKE @kw ESCAPE '\\'
      OR c.manufacturer LIKE @kw ESCAPE '\\'
      OR ifnull(c.description, '') LIKE @kw ESCAPE '\\'
      OR ifnull(c.tags, '') LIKE @kw ESCAPE '\\'
      OR ifnull(c.location_full_code, '') LIKE @kw ESCAPE '\\'
      OR ifnull(c.note, '') LIKE @kw ESCAPE '\\'
      OR ifnull(s.name, '') LIKE @kw ESCAPE '\\'
    )`)
    params.kw = `%${escapeLike(query.q.trim())}%`
  }

  if (query.kind) {
    parts.push('c.kind = @kind')
    params.kind = query.kind
  }
  if (query.manufacturer) {
    parts.push('c.manufacturer = @manufacturer')
    params.manufacturer = query.manufacturer
  }
  if (query.category) {
    parts.push('c.category = @category')
    params.category = query.category
  }
  if (query.locationCode) {
    parts.push(`ifnull(c.location_full_code, '') LIKE @loc ESCAPE '\\'`)
    params.loc = `${escapeLike(query.locationCode)}%`
  }
  if (query.supplierId) {
    parts.push('c.supplier_id = @supplierId')
    params.supplierId = query.supplierId
  }
  if (query.lowStock) {
    parts.push('c.safety_stock > 0 AND c.quantity <= c.safety_stock')
  }

  return {
    sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
    params
  }
}

function orderClause(sort: ComponentListQuery['sort']): string {
  switch (sort) {
    case 'partNumber':
      return 'ORDER BY c.part_number COLLATE NOCASE ASC'
    case 'quantity':
      return 'ORDER BY c.quantity ASC, c.part_number COLLATE NOCASE ASC'
    case 'location':
      return 'ORDER BY ifnull(c.location_full_code, \'zzz\') ASC, c.part_number COLLATE NOCASE ASC'
    default:
      return 'ORDER BY c.updated_at DESC'
  }
}

export const componentsRepo = {
  list(query: ComponentListQuery): Page<Component> {
    const db = getDb()
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE))
    const where = buildWhere(query)

    const countStmt = db.prepare(`SELECT COUNT(*) AS n ${FROM_JOIN} ${where.sql}`)
    const totalRow = (
      Object.keys(where.params).length > 0 ? countStmt.get(where.params) : countStmt.get()
    ) as { n: number }

    const rows = db
      .prepare(
        `SELECT ${SELECT_FIELDS} ${FROM_JOIN} ${where.sql} ${orderClause(query.sort)} LIMIT @limit OFFSET @offset`
      )
      .all({ ...where.params, limit: pageSize, offset: (page - 1) * pageSize }) as ComponentRow[]

    return { items: rows.map(mapComponent), total: totalRow.n, page, pageSize }
  },

  get(id: string): Component | null {
    const row = getDb()
      .prepare(`SELECT ${SELECT_FIELDS} ${FROM_JOIN} WHERE c.id = ?`)
      .get(id) as ComponentRow | undefined
    return row ? mapComponent(row) : null
  },

  findByPart(partNumber: string, manufacturer: string, pkg?: string | null): Component | null {
    let sql = `SELECT ${SELECT_FIELDS} ${FROM_JOIN} WHERE c.part_number = ? AND c.manufacturer = ?`
    const params: unknown[] = [partNumber, manufacturer]
    if (pkg !== undefined) {
      sql += ` AND ifnull(c.package, '') = ifnull(?, '')`
      params.push(pkg)
    }
    sql += ' LIMIT 1'
    const row = getDb().prepare(sql).get(...params) as ComponentRow | undefined
    return row ? mapComponent(row) : null
  },

  insert(data: {
    kind: ItemKind
    partNumber: string
    manufacturer: string
    category: string | null
    package: string | null
    description: string | null
    dateCode: string | null
    packaging: string | null
    quantity: number
    unit: string
    safetyStock: number
    unitPrice: number | null
    currency: string
    moq: number | null
    msl: number | null
    rohs: number | null
    locationId: string | null
    locationFullCode: string | null
    supplierId: string | null
    tags: string | null
    note: string | null
    imageUrl?: string | null
  }): string {
    const id = newId()
    const ts = nowIso()
    getDb()
      .prepare(
        `INSERT INTO components (
          id, kind, part_number, manufacturer, category, package, description, date_code, packaging,
          quantity, unit, safety_stock, unit_price, currency, moq, msl, rohs,
          location_id, location_full_code, supplier_id, tags, note, image_url,
          status, created_at, updated_at
        ) VALUES (
          @id, @kind, @partNumber, @manufacturer, @category, @package, @description, @dateCode, @packaging,
          @quantity, @unit, @safetyStock, @unitPrice, @currency, @moq, @msl, @rohs,
          @locationId, @locationFullCode, @supplierId, @tags, @note, @imageUrl,
          'active', @ts, @ts
        )`
      )
      .run({ id, ...data, imageUrl: data.imageUrl ?? null, ts })
    return id
  },

  update(
    id: string,
    patch: Record<string, unknown>,
    allowed: Record<string, string>
  ): void {
    const sets: string[] = []
    const params: Record<string, unknown> = { id, ts: nowIso() }
    for (const [key, column] of Object.entries(allowed)) {
      if (key in patch) {
        sets.push(`${column} = @${key}`)
        params[key] = patch[key]
      }
    }
    if (!sets.length) return
    sets.push('updated_at = @ts')
    getDb()
      .prepare(`UPDATE components SET ${sets.join(', ')} WHERE id = @id`)
      .run(params)
  },

  setQuantity(id: string, quantity: number): void {
    getDb()
      .prepare('UPDATE components SET quantity = ?, updated_at = ? WHERE id = ?')
      .run(quantity, nowIso(), id)
  },

  setStatus(id: string, status: string): void {
    getDb()
      .prepare('UPDATE components SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), id)
  },

  /** 彻底删除：先清掉从属记录，再删物料本身，返回被连带清理的条数 */
  removeCascade(id: string): { movements: number; attachments: number } {
    const db = getDb()
    const movements = db.prepare('DELETE FROM stock_movements WHERE component_id = ?').run(id).changes
    const attachments = db.prepare('DELETE FROM attachments WHERE component_id = ?').run(id).changes
    db.prepare('DELETE FROM components WHERE id = ?').run(id)
    return { movements, attachments }
  },

  /** 删除前告知用户会连带删掉多少条记录 */
  cascadeCounts(id: string): { movements: number; attachments: number } {
    const db = getDb()
    const movements = (db.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE component_id = ?').get(id) as { n: number }).n
    const attachments = (db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE component_id = ?').get(id) as { n: number }).n
    return { movements, attachments }
  },

  facets(kind?: ItemKind): { manufacturers: string[]; categories: string[]; locations: string[] } {
    const db = getDb()
    const scope = kind ? ' AND kind = @kind' : ''
    const params = kind ? { kind } : null

    const manufacturersSql = `SELECT DISTINCT manufacturer FROM components WHERE status = 'active' AND manufacturer <> ''${scope} ORDER BY manufacturer COLLATE NOCASE`
    const categoriesSql = `SELECT DISTINCT category FROM components WHERE status = 'active' AND category IS NOT NULL${scope} ORDER BY category`
    const locationsSql = `SELECT DISTINCT location_full_code FROM components WHERE status = 'active' AND location_full_code IS NOT NULL AND location_full_code <> '' ORDER BY location_full_code`

    const manufacturers = (
      (params
        ? db.prepare(manufacturersSql).all(params)
        : db.prepare(manufacturersSql).all()) as { manufacturer: string }[]
    ).map((r) => r.manufacturer)
    const categories = (
      (params
        ? db.prepare(categoriesSql).all(params)
        : db.prepare(categoriesSql).all()) as { category: string }[]
    ).map((r) => r.category)
    const locations = (
      db.prepare(locationsSql).all() as { location_full_code: string }[]
    ).map((r) => r.location_full_code)
    return { manufacturers, categories, locations }
  },

  stats() {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT
           COUNT(*) AS sku,
           ifnull(SUM(quantity), 0) AS total,
           ifnull(SUM(CASE WHEN safety_stock > 0 AND quantity <= safety_stock THEN 1 ELSE 0 END), 0) AS low
         FROM components WHERE status = 'active'`
      )
      .get() as { sku: number; total: number; low: number }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const mov = db
      .prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE occurred_at >= ?')
      .get(today.toISOString()) as { n: number }
    return { skuCount: row.sku, totalQuantity: row.total, lowStockCount: row.low, movementsToday: mov.n }
  },

  lowStockList(limit = 8): Component[] {
    const rows = getDb()
      .prepare(
        `SELECT ${SELECT_FIELDS} ${FROM_JOIN}
         WHERE c.status = 'active' AND c.safety_stock > 0 AND c.quantity <= c.safety_stock
         ORDER BY (c.safety_stock - c.quantity) DESC LIMIT ?`
      )
      .all(limit) as ComponentRow[]
    return rows.map(mapComponent)
  }
}
