import { locationsRepo } from './repository'
import { AppError } from '../../errors'
import { getDb } from '../../db'
import {
  locationCreateSchema,
  locationUpdateSchema,
  type LocationCreateInput
} from '@shared/schemas'
import type { StorageLocation } from '@shared/types'

export interface LocationNode extends StorageLocation {
  children: LocationNode[]
  /** 直接存放在该位置的物料数 */
  componentCount: number
}

export const locationsService = {
  tree(): LocationNode[] {
    const all = locationsRepo.all()
    const counts = locationsRepo.componentCounts()
    const byId = new Map<string, LocationNode>()
    for (const loc of all) {
      byId.set(loc.id, { ...loc, componentCount: counts.get(loc.id) ?? 0, children: [] })
    }

    const roots: LocationNode[] = []
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  },

  flat(): StorageLocation[] {
    return locationsRepo.all()
  },

  create(raw: unknown): StorageLocation {
    const input: LocationCreateInput = locationCreateSchema.parse(raw)

    let parent: StorageLocation | null = null
    if (input.parentId) {
      parent = locationsRepo.all().find((l) => l.id === input.parentId) ?? null
      if (!parent) throw new AppError('VALIDATION_FAILED', '父级位置不存在')
    }

    const fullCode = parent ? `${parent.fullCode}-${input.code}` : input.code
    if (locationsRepo.findByFullCode(fullCode)) {
      throw new AppError('DUPLICATE_LOCATION', `位置编码 ${fullCode} 已存在`)
    }

    const id = locationsRepo.insert({
      code: input.code,
      fullCode,
      name: input.name ?? null,
      parentId: parent?.id ?? null,
      kind: input.kind ?? 'box',
      capacity: input.capacity ?? null,
      note: input.note ?? null
    })

    return locationsRepo.all().find((l) => l.id === id)!
  },

  /**
   * 录入物料时如果填了编码但位置档案里没有，自动建档，避免用户被迫先维护位置表。
   */
  ensureByCode(rawCode: string): { id: string; fullCode: string } {
    const code = rawCode.trim()
    const existing = locationsRepo.findByFullCode(code)
    if (existing) return { id: existing.id, fullCode: existing.fullCode }

    const segments = code.split('-').filter(Boolean)
    const leaf = segments[segments.length - 1] ?? code
    const id = locationsRepo.insert({
      code: leaf,
      fullCode: code,
      name: null,
      parentId: null,
      kind: 'box',
      capacity: null,
      note: null
    })
    return { id, fullCode: code }
  },

  /**
   * 修改位置档案。改编码时会重算 full_code，并把子孙位置的编码一并改掉，
   * 否则父子编码会断链。物料通过 location_id 关联，编码变更后自动跟随。
   */
  update(raw: unknown): StorageLocation {
    const input = locationUpdateSchema.parse(raw)
    const target = locationsRepo.findById(input.id)
    if (!target) throw new AppError('LOCATION_NOT_FOUND', '位置不存在或已被删除')

    const code = input.code.trim()
    const parent = target.parentId ? locationsRepo.findById(target.parentId) : null
    const fullCode = parent ? `${parent.fullCode}-${code}` : code

    if (fullCode !== target.fullCode) {
      const conflict = locationsRepo.findByFullCode(fullCode)
      if (conflict && conflict.id !== target.id) {
        throw new AppError('DUPLICATE_LOCATION', `位置编码 ${fullCode} 已存在`)
      }
    }

    const name = input.name === undefined ? target.name : input.name
    const kind = input.kind ?? target.kind
    const note = input.note === undefined ? target.note : input.note
    const capacity = input.capacity === undefined ? target.capacity : input.capacity

    const oldPrefix = `${target.fullCode}-`
    const descendants =
      fullCode === target.fullCode
        ? []
        : locationsRepo.all().filter((node) => node.fullCode.startsWith(oldPrefix))

    const run = getDb().transaction(() => {
      locationsRepo.update(target.id, { code, fullCode, name, kind, capacity, note })
      for (const node of descendants) {
        locationsRepo.updateFullCode(
          node.id,
          `${fullCode}${node.fullCode.slice(target.fullCode.length)}`
        )
      }
    })
    run()

    return locationsRepo.findById(target.id)!
  },

  /**
   * 删除位置。有物料或子位置时拒绝，避免物料位置被静默清空
   * （数据库外键是 ON DELETE SET NULL，会悄悄把物料的位置抹掉）。
   */
  remove(raw: unknown): { id: string } {
    const id = typeof raw === 'string' ? raw : String((raw as { id?: unknown })?.id ?? '')
    if (!id) throw new AppError('VALIDATION_FAILED', '缺少位置 ID')

    const target = locationsRepo.findById(id)
    if (!target) throw new AppError('LOCATION_NOT_FOUND', '位置不存在或已被删除')

    const children = locationsRepo.childrenOf(id)
    if (children.length > 0) {
      throw new AppError(
        'LOCATION_IN_USE',
        `「${target.fullCode}」下还有 ${children.length} 个子位置，请先删除它们`
      )
    }

    const used = locationsRepo.componentCount(target)
    if (used > 0) {
      throw new AppError(
        'LOCATION_IN_USE',
        `还有 ${used} 个物料存放在「${target.fullCode}」，请先把它们改到其他位置`
      )
    }

    locationsRepo.remove(id)
    return { id }
  },

  count(): number {
    return locationsRepo.count()
  }
}
