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

  findById(id: string): StorageLocation | null {
    const row = getDb().prepare('SELECT * FROM storage_locations WHERE id = ? LIMIT 1').get(id) as
      | LocationRow
      | undefined
    return row ? map(row) : null
  },

  childrenOf(id: string): StorageLocation[] {
    const rows = getDb()
      .prepare('SELECT * FROM storage_locations WHERE parent_id = ? ORDER BY full_code ASC')
      .all(id) as LocationRow[]
    return rows.map(map)
  },

  /** 引用该位置的物料数（含 location_id 缺失但冗余编码仍指向它的情况） */
  componentCount(location: StorageLocation): number {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM components
         WHERE location_id = ? OR (location_id IS NULL AND location_full_code = ?)`
      )
      .get(location.id, location.fullCode) as { n: number }
    return row.n
  },

  /** 按位置分组的物料数，供列表一次性统计 */
  componentCounts(): Map<string, number> {
    const rows = getDb()
      .prepare('SELECT location_id AS id, COUNT(*) AS n FROM components WHERE location_id IS NOT NULL GROUP BY location_id')
      .all() as { id: string; n: number }[]
    return new Map(rows.map((row) => [row.id, row.n]))
  },

  update(
    id: string,
    data: {
      code: string
      fullCode: string
      name: string | null
      kind: string
      capacity: number | null
      note: string | null
    }
  ): void {
    getDb()
      .prepare(
        `UPDATE storage_locations
         SET code = @code, full_code = @fullCode, name = @name, kind = @kind,
             capacity = @capacity, note = @note
         WHERE id = @id`
      )
      .run({ id, ...data })
  },

  /** 改编码时同步改写子孙位置的 full_code */
  updateFullCode(id: string, fullCode: string): void {
    getDb().prepare('UPDATE storage_locations SET full_code = ? WHERE id = ?').run(fullCode, id)
  },

  remove(id: string): void {
    getDb().prepare('DELETE FROM storage_locations WHERE id = ?').run(id)
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
