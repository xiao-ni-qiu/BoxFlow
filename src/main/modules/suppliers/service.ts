import { suppliersRepo } from './repository'
import { AppError } from '../../errors'
import { newId, nowIso } from '../../ids'
import {
  supplierCreateSchema,
  supplierUpdateSchema,
  type SupplierCreateInput,
  type SupplierUpdateInput
} from '@shared/schemas'
import type { Page, Supplier, SupplierListQuery } from '@shared/types'

const UPDATABLE_COLUMNS: Record<string, string> = {
  name: 'name',
  code: 'code',
  shortName: 'short_name',
  contactName: 'contact_name',
  phone: 'phone',
  email: 'email',
  address: 'address',
  website: 'website',
  paymentTerms: 'payment_terms',
  level: 'level',
  tags: 'tags',
  note: 'note'
}

export const suppliersService = {
  list(query: SupplierListQuery): Page<Supplier> {
    return suppliersRepo.list(query)
  },

  get(id: string): Supplier {
    const found = suppliersRepo.get(id)
    if (!found) throw new AppError('SUPPLIER_NOT_FOUND', '供应商不存在')
    return found
  },

  allActive(): Supplier[] {
    return suppliersRepo.allActive()
  },

  create(raw: unknown): Supplier {
    const input: SupplierCreateInput = supplierCreateSchema.parse(raw)
    if (suppliersRepo.findByName(input.name)) {
      throw new AppError('DUPLICATE_SUPPLIER', `供应商「${input.name}」已存在`)
    }
    const id = newId()
    suppliersRepo.insert({
      id,
      code: input.code ?? null,
      name: input.name,
      shortName: input.shortName ?? null,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      website: input.website ?? null,
      paymentTerms: input.paymentTerms ?? null,
      level: input.level ?? 3,
      tags: input.tags ?? null,
      note: input.note ?? null,
      ts: nowIso()
    })
    return suppliersRepo.get(id)!
  },

  update(id: string, raw: unknown): Supplier {
    const input: SupplierUpdateInput = supplierUpdateSchema.parse(raw)
    const existing = suppliersService.get(id)

    if (input.name && input.name !== existing.name && suppliersRepo.findByName(input.name)) {
      throw new AppError('DUPLICATE_SUPPLIER', `供应商「${input.name}」已存在`)
    }

    const patch: Record<string, unknown> = {}
    for (const key of Object.keys(UPDATABLE_COLUMNS)) {
      if (key in input) {
        const value = (input as Record<string, unknown>)[key]
        patch[key] = typeof value === 'string' && value.trim() === '' ? null : value
      }
    }
    suppliersRepo.update(id, patch, UPDATABLE_COLUMNS)
    return suppliersRepo.get(id)!
  },

  archive(id: string): void {
    suppliersService.get(id)
    suppliersRepo.setStatus(id, 'archived')
  }
}
