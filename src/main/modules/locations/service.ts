import { locationsRepo } from './repository'
import { AppError } from '../../errors'
import { locationCreateSchema, type LocationCreateInput } from '@shared/schemas'
import type { StorageLocation } from '@shared/types'

export interface LocationNode extends StorageLocation {
  children: LocationNode[]
}

export const locationsService = {
  tree(): LocationNode[] {
    const all = locationsRepo.all()
    const byId = new Map<string, LocationNode>()
    for (const loc of all) byId.set(loc.id, { ...loc, children: [] })

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

  count(): number {
    return locationsRepo.count()
  }
}
