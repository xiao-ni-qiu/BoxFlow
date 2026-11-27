import { getDb } from '../../db'
import { movementsRepo } from './repository'
import { componentsRepo } from '../components/repository'
import { AppError } from '../../errors'
import { newId, nowIso } from '../../ids'
import { movementCreateSchema, type MovementCreateInput } from '@shared/schemas'
import type { Movement, MovementListQuery, Page } from '@shared/types'
import { MOVEMENT_LABELS } from '@shared/constants'

export const movementsService = {
  create(raw: unknown): { movement: Movement; quantity: number } {
    const input: MovementCreateInput = movementCreateSchema.parse(raw)
    const db = getDb()

    const run = db.transaction(() => {
      const component = componentsRepo.get(input.componentId)
      if (!component) throw new AppError('COMPONENT_NOT_FOUND', '元器件不存在')

      const before = component.quantity
      let delta: number
      let quantity: number

      if (input.type === 'in') {
        quantity = Math.abs(input.quantity)
        if (quantity === 0) throw new AppError('INVALID_QUANTITY', '入库数量必须大于 0')
        delta = quantity
      } else if (input.type === 'out') {
        quantity = Math.abs(input.quantity)
        if (quantity === 0) throw new AppError('INVALID_QUANTITY', '出库数量必须大于 0')
        if (quantity > before) {
          throw new AppError('INSUFFICIENT_STOCK', `库存不足，当前可用 ${before} ${component.unit}`, {
            available: before
          })
        }
        delta = -quantity
      } else {
        quantity = input.quantity
        delta = quantity - before
        if (delta === 0) throw new AppError('INVALID_QUANTITY', '盘点数量与当前库存相同，无需调整')
      }

      const after = before + delta
      if (after < 0) throw new AppError('INSUFFICIENT_STOCK', '调整后库存不能为负数')

      const id = newId()
      const ts = nowIso()

      movementsRepo.insert({
        id,
        componentId: input.componentId,
        type: input.type,
        quantity: delta,
        beforeQty: before,
        afterQty: after,
        unitPrice: input.unitPrice ?? null,
        supplierId: input.supplierId ?? null,
        dateCode: input.dateCode ?? null,
        projectRef: input.projectRef ?? null,
        operator: input.operator?.trim() || 'local',
        note: input.note ?? null,
        occurredAt: ts,
        createdAt: ts
      })

      componentsRepo.setQuantity(input.componentId, after)

      return { id, after }
    })

    const result = run()
    const movement = movementsRepo.forComponent(input.componentId, 1)[0]
    return { movement: movement ?? { id: result.id } as Movement, quantity: result.after }
  },

  list(query: MovementListQuery): Page<Movement> {
    return movementsRepo.list(query)
  },

  forComponent(componentId: string, limit = 20): Movement[] {
    return movementsRepo.forComponent(componentId, limit)
  },

  label(type: string): string {
    return MOVEMENT_LABELS[type] ?? type
  }
}
