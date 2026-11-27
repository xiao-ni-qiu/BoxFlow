import { z } from 'zod'
import { ITEM_KINDS, type ItemKind } from './constants'

const kindSchema = z.custom<ItemKind>(
  (value) => typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value),
  { message: '未知的物料大类' }
)

const nullableTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : (v ?? null)))

const nonNegativeInt = z
  .number()
  .int('必须是整数')
  .min(0, '不能为负数')
  .optional()
  .nullable()

export const componentCreateSchema = z.object({
  kind: kindSchema.optional(),
  partNumber: z.string().trim().min(1, '型号不能为空').max(120, '型号过长'),
  manufacturer: z.string().trim().max(80).optional().default(''),
  category: nullableTrimmed(40),
  package: nullableTrimmed(40),
  description: nullableTrimmed(400),
  dateCode: nullableTrimmed(40),
  packaging: nullableTrimmed(20),
  quantity: nonNegativeInt,
  unit: z.string().trim().max(10).optional().nullable(),
  safetyStock: nonNegativeInt,
  unitPrice: z.number().min(0).optional().nullable(),
  currency: z.string().trim().max(8).optional().nullable(),
  moq: nonNegativeInt,
  msl: z.number().int().min(1).max(6).optional().nullable(),
  rohs: z.boolean().optional().nullable(),
  locationCode: nullableTrimmed(60),
  supplierId: nullableTrimmed(40),
  tags: nullableTrimmed(200),
  note: nullableTrimmed(1000)
})

export const componentUpdateSchema = componentCreateSchema.partial()

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, '供应商名称不能为空').max(120, '名称过长'),
  code: nullableTrimmed(40),
  shortName: nullableTrimmed(40),
  contactName: nullableTrimmed(40),
  phone: nullableTrimmed(40),
  email: nullableTrimmed(120),
  address: nullableTrimmed(200),
  website: nullableTrimmed(200),
  paymentTerms: nullableTrimmed(40),
  level: z.number().int().min(1).max(5).optional().nullable(),
  tags: nullableTrimmed(200),
  note: nullableTrimmed(1000)
})

export const supplierUpdateSchema = supplierCreateSchema.partial()

export const locationCreateSchema = z.object({
  code: z.string().trim().min(1, '位置编码不能为空').max(20),
  name: nullableTrimmed(80),
  parentId: nullableTrimmed(40),
  kind: z.enum(['room', 'rack', 'layer', 'box']).optional().default('box'),
  capacity: nonNegativeInt,
  note: nullableTrimmed(200)
})

export const movementCreateSchema = z.object({
  componentId: z.string().min(1),
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.number().int('必须是整数').min(0, '数量不能为负数'),
  unitPrice: z.number().min(0).optional().nullable(),
  supplierId: nullableTrimmed(40),
  dateCode: nullableTrimmed(40),
  projectRef: nullableTrimmed(80),
  operator: z.string().trim().max(40).optional(),
  note: nullableTrimmed(300)
})

export type ComponentCreateInput = z.infer<typeof componentCreateSchema>
export type ComponentUpdateInput = z.infer<typeof componentUpdateSchema>
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>
export type LocationCreateInput = z.infer<typeof locationCreateSchema>
export type MovementCreateInput = z.infer<typeof movementCreateSchema>
