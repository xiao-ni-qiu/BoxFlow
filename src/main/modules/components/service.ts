import { getDb } from '../../db'
import { componentsRepo } from './repository'
import { movementsRepo } from '../movements/repository'
import { locationsService } from '../locations/service'
import { AppError } from '../../errors'
import { newId, nowIso } from '../../ids'
import {
  componentCreateSchema,
  componentUpdateSchema,
  type ComponentCreateInput,
  type ComponentUpdateInput
} from '@shared/schemas'
import type { Component, ComponentListQuery, InventoryStats, Page } from '@shared/types'
import { normalizeKind, type ItemKind } from '@shared/constants'

const UPDATABLE_COLUMNS: Record<string, string> = {
  kind: 'kind',
  partNumber: 'part_number',
  manufacturer: 'manufacturer',
  category: 'category',
  package: 'package',
  description: 'description',
  dateCode: 'date_code',
  packaging: 'packaging',
  unit: 'unit',
  safetyStock: 'safety_stock',
  unitPrice: 'unit_price',
  currency: 'currency',
  moq: 'moq',
  msl: 'msl',
  tags: 'tags',
  note: 'note'
}

function normalizeManufacturer(value: string | undefined | null): string {
  return (value ?? '').trim()
}

export const componentsService = {
  list(query: ComponentListQuery): Page<Component> {
    return componentsRepo.list(query)
  },

  get(id: string): Component {
    const found = componentsRepo.get(id)
    if (!found) throw new AppError('COMPONENT_NOT_FOUND', '元器件不存在')
    return found
  },

  facets(kind?: ItemKind) {
    return componentsRepo.facets(kind)
  },

  stats(): InventoryStats {
    const base = componentsRepo.stats()
    const supplierCount = (
      getDb().prepare("SELECT COUNT(*) AS n FROM suppliers WHERE status = 'active'").get() as { n: number }
    ).n
    return {
      ...base,
      supplierCount,
      locationCount: locationsService.count()
    }
  },

  lowStock(limit = 8): Component[] {
    return componentsRepo.lowStockList(limit)
  },

  create(raw: unknown): Component {
    const input: ComponentCreateInput = componentCreateSchema.parse(raw)
    const manufacturer = normalizeManufacturer(input.manufacturer)
    const db = getDb()

    const run = db.transaction(() => {
      const duplicate = componentsRepo.findByPart(input.partNumber, manufacturer)
      if (duplicate) {
        throw new AppError(
          'DUPLICATE_COMPONENT',
          `型号 ${input.partNumber}（${manufacturer || '未填厂商'}）已存在`,
          { id: duplicate.id }
        )
      }

      let locationId: string | null = null
      let locationFullCode: string | null = null
      if (input.locationCode) {
        const loc = locationsService.ensureByCode(input.locationCode)
        locationId = loc.id
        locationFullCode = loc.fullCode
      }

      const initialQty = input.quantity ?? 0
      const id = componentsRepo.insert({
        kind: normalizeKind(input.kind),
        partNumber: input.partNumber,
        manufacturer,
        category: input.category ?? null,
        package: input.package ?? null,
        description: input.description ?? null,
        dateCode: input.dateCode ?? null,
        packaging: input.packaging ?? null,
        quantity: initialQty,
        unit: input.unit || '个',
        safetyStock: input.safetyStock ?? 0,
        unitPrice: input.unitPrice ?? null,
        currency: input.currency || 'CNY',
        moq: input.moq ?? null,
        msl: input.msl ?? null,
        rohs: input.rohs ? 1 : 0,
        locationId,
        locationFullCode,
        supplierId: input.supplierId ?? null,
        tags: input.tags ?? null,
        note: input.note ?? null
      })

      if (initialQty > 0) {
        const ts = nowIso()
        movementsRepo.insert({
          id: newId(),
          componentId: id,
          type: 'init',
          quantity: initialQty,
          beforeQty: 0,
          afterQty: initialQty,
          unitPrice: input.unitPrice ?? null,
          supplierId: input.supplierId ?? null,
          dateCode: input.dateCode ?? null,
          projectRef: null,
          operator: 'local',
          note: '建档初始库存',
          occurredAt: ts,
          createdAt: ts
        })
      }

      return id
    })

    const id = run()
    return componentsRepo.get(id)!
  },

  update(id: string, raw: unknown): Component {
    const input: ComponentUpdateInput = componentUpdateSchema.parse(raw)
    const existing = componentsService.get(id)
    const db = getDb()

    const run = db.transaction(() => {
      const patch: Record<string, unknown> = {}

      for (const key of Object.keys(UPDATABLE_COLUMNS)) {
        if (key in input) {
          const value = (input as Record<string, unknown>)[key]
          patch[key] = typeof value === 'string' && value.trim() === '' ? null : value
        }
      }

      if ('manufacturer' in input) {
        patch.manufacturer = normalizeManufacturer(input.manufacturer)
      }
      if ('rohs' in input) {
        patch.rohs = input.rohs ? 1 : 0
      }

      const nextPart = (patch.partNumber as string | undefined) ?? existing.partNumber
      const nextMaker = (patch.manufacturer as string | undefined) ?? existing.manufacturer
      if (nextPart !== existing.partNumber || nextMaker !== existing.manufacturer) {
        const duplicate = componentsRepo.findByPart(nextPart, nextMaker)
        if (duplicate && duplicate.id !== id) {
          throw new AppError('DUPLICATE_COMPONENT', `型号 ${nextPart}（${nextMaker || '未填厂商'}）已存在`)
        }
      }

      if ('locationCode' in input) {
        const code = (input.locationCode ?? '').trim()
        if (code) {
          const loc = locationsService.ensureByCode(code)
          patch.locationId = loc.id
          patch.locationFullCode = loc.fullCode
        } else {
          patch.locationId = null
          patch.locationFullCode = null
        }
      }

      if ('supplierId' in input) {
        patch.supplierId = input.supplierId ?? null
      }

      componentsRepo.update(id, patch, UPDATABLE_COLUMNS)
    })

    run()
    return componentsRepo.get(id)!
  },

  archive(id: string): void {
    componentsService.get(id)
    componentsRepo.setStatus(id, 'archived')
  },

  restore(id: string): void {
    componentsService.get(id)
    componentsRepo.setStatus(id, 'active')
  },

  /** 删除前的影响面：会连带删除多少条流水与附件 */
  removalImpact(id: string): { partNumber: string; quantity: number; movements: number; attachments: number } {
    const found = componentsService.get(id)
    const counts = componentsRepo.cascadeCounts(id)
    return { partNumber: found.partNumber, quantity: found.quantity, ...counts }
  },

  /**
   * 彻底删除一条物料。
   * stock_movements 与 attachments 的外键都是 ON DELETE CASCADE，这里仍显式清理，
   * 一是为了返回"连带删了多少"，二是避免外键被意外关闭时留下孤儿行。
   */
  remove(id: string): { id: string; partNumber: string; movements: number; attachments: number } {
    const found = componentsService.get(id)
    const db = getDb()
    let counts = { movements: 0, attachments: 0 }
    db.transaction(() => {
      counts = componentsRepo.removeCascade(id)
    })()
    return { id, partNumber: found.partNumber, ...counts }
  },

  movements(id: string, limit = 20) {
    componentsService.get(id)
    return movementsRepo.forComponent(id, limit)
  }
}
