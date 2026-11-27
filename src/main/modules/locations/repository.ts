import { getDb } from '../../db'
import { newId, nowIso } from '../../ids'
import type { StorageLocation } from '@shared/types'

interface LocationRow {
  id: string
  parent_id: string | null
  code: string
  full_code: string
  name: string | null
  kind: string
  capacity: number | null
  note: string | null
  created_at: string
}

function map(row: LocationRow): StorageLocation {
  return {
    id: row.id,
    parentId: row.parent_id,
    code: row.code,
    fullCode: row.full_code,
    name: row.name,
    kind: row.kind,
    capacity: row.capacity,
    note: row.note,
    createdAt: row.created_at
  }
}

export const locationsRepo = {
  all(): StorageLocation[] {
    const rows = getDb()
      .prepare('SELECT * FROM storage_locations ORDER BY full_code ASC')
      .all() as LocationRow[]
    return rows.map(map)
  },

  findByFullCode(fullCode: string): StorageLocation | null {
    const row = getDb()
      .prepare('SELECT * FROM storage_locations WHERE full_code = ? LIMIT 1')
      .get(fullCode) as LocationRow | undefined
    return row ? map(row) : null
  },

  insert(data: {
    code: string
    fullCode: string
    name: string | null
    parentId: string | null
    kind: string
    capacity: number | null
    note: string | null
  }): string {
    const id = newId()
    getDb()
      .prepare(
        `INSERT INTO storage_locations (id, parent_id, code, full_code, name, kind, capacity, note, created_at)
         VALUES (@id, @parentId, @code, @fullCode, @name, @kind, @capacity, @note, @ts)`
      )
      .run({ id, ...data, ts: nowIso() })
    return id
  },

  count(): number {
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM storage_locations').get() as { n: number }
    return row.n
  }
}
