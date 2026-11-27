import { ZodError } from 'zod'
import { componentsService } from '../modules/components/service'
import { movementsService } from '../modules/movements/service'
import { suppliersService } from '../modules/suppliers/service'
import { locationsService } from '../modules/locations/service'
import { componentsRepo } from '../modules/components/repository'
import { suppliersRepo } from '../modules/suppliers/repository'
import { AppError } from '../errors'
import type { Component, Movement, Supplier } from '@shared/types'
import { ALL_CATEGORIES, PACKAGINGS, UNITS, MOVEMENT_LABELS, KIND_META, KIND_OPTIONS, normalizeKind } from '@shared/constants'
import {
  errorResult,
  textResult,
  type ToolDefinition,
  type ToolResult
} from './protocol'

/** 一次工具调用可用的上下文 */
export interface ToolContext {
  /** 客户端标识，例如 workbuddy / codex / doubao，内置助手用 assistant */
  client: string
  /** 流水里的来源通道：外部 AI 客户端走 mcp，内置助手走 ai */
  channel?: 'mcp' | 'ai'
}

/** 记录到流水 operator 字段的来源标签 */
export function operatorTag(ctx: ToolContext): string {
  const name = (ctx.client || 'mcp').replace(/[^\w.-]/g, '').slice(0, 24)
  return `${ctx.channel ?? 'mcp'}:${name || 'unknown'}`
}

function humanizeError(err: unknown): ToolResult {
  if (err instanceof ZodError) {
    const detail = err.issues
      .map((i) => `${i.path.join('.') || '参数'}: ${i.message}`)
      .join('；')
    return errorResult(`参数校验失败 —— ${detail}`, 'VALIDATION_FAILED')
  }
  if (err instanceof AppError) {
    return errorResult(err.message, err.code)
  }
  if (err instanceof Error) {
    return errorResult(err.message, 'INTERNAL_ERROR')
  }
  return errorResult('未知错误', 'INTERNAL_ERROR')
}

/** 把内部记录裁成对模型友好的精简对象，避免一次吐回几十个字段 */
function briefComponent(c: Component) {
  return {
    id: c.id,
    kind: KIND_META[c.kind].label,
    partNumber: c.partNumber,
    manufacturer: c.manufacturer || null,
    category: c.category,
    package: c.package,
    quantity: c.quantity,
    unit: c.unit,
    safetyStock: c.safetyStock,
    location: c.locationFullCode,
    supplier: c.supplierName,
    imageUrl: c.imageUrl,
    unitPrice: c.unitPrice,
    lowStock: c.quantity <= c.safetyStock,
    status: c.status
  }
}

function briefMovement(m: Movement) {
  return {
    id: m.id,
    type: MOVEMENT_LABELS[m.type] ?? m.type,
    partNumber: m.partNumber,
    change: m.quantity,
    before: m.beforeQty,
    after: m.afterQty,
    operator: m.operator,
    note: m.note,
    at: m.occurredAt
  }
}

/**
 * 按 id 或型号定位元器件。
 * AI 客户端通常只知道型号，所以这里必须支持按型号模糊命中。
 */
function resolveComponent(args: {
  componentId?: string
  partNumber?: string
  manufacturer?: string
}): Component | null {
  if (args.componentId) {
    const byId = componentsRepo.get(args.componentId)
    if (byId) return byId
  }
  const part = (args.partNumber ?? '').trim()
  if (!part) return null

  const exact = findAnyByPart(part, args.manufacturer)
  if (exact) return exact

  // 型号可能带大小写差异或前后缀，退化为检索：优先在在用物料里找
  const lower = part.toLowerCase()
  const candidates = componentsRepo.list({ q: part, pageSize: 30, status: 'all' })
  const active = candidates.items.filter((c) => c.status === 'active')
  const pool = active.length ? active : candidates.items
  return pool.find((c) => c.partNumber.toLowerCase().startsWith(lower)) ?? pool[0] ?? null
}

function requireComponent(args: {
  componentId?: string
  partNumber?: string
  manufacturer?: string
}): Component {
  const found = resolveComponent(args)
  if (!found) {
    throw new AppError(
      'COMPONENT_NOT_FOUND',
      `找不到元器件${args.partNumber ? `「${args.partNumber}」` : ''}，请先用 add_stock 建档或确认型号`
    )
  }
  if (found.status !== 'active') {
    throw new AppError(
      'COMPONENT_NOT_FOUND',
      `元器件「${found.partNumber}」已归档，请先用 archive_component（restore=true）恢复`
    )
  }
  return found
}

/**
 * 精确查找型号，包含已归档记录。
 * 入库时必须能看到归档物料，否则会撞上"型号已存在"的重复校验。
 */
function findAnyByPart(partNumber: string, manufacturer?: string): Component | null {
  const maker = (manufacturer ?? '').trim()
  if (maker) {
    const exact = componentsRepo.findByPart(partNumber, maker)
    if (exact) return exact
  }
  const lower = partNumber.toLowerCase()
  const page = componentsRepo.list({ q: partNumber, status: 'all', pageSize: 30 })
  return page.items.find((c) => c.partNumber.toLowerCase() === lower) ?? null
}

function resolveSupplier(name?: string, id?: string): Supplier | null {  if (id) {
    const byId = suppliersRepo.get(id)
    if (byId) return byId
  }
  const key = (name ?? '').trim()
  if (!key) return null
  const direct = suppliersRepo.findByName(key)
  if (direct) return direct
  const list = suppliersRepo.list({ q: key, pageSize: 10 })
  return list.items[0] ?? null
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({
  type: 'string',
  description,
  ...extra
})
const num = (description: string, extra: Record<string, unknown> = {}) => ({
  type: 'number',
  description,
  ...extra
})

/* ------------------------------------------------------------------ */
/* 工具定义                                                            */
/* ------------------------------------------------------------------ */

export const TOOLS: ToolDefinition[] = [
  {
    name: 'add_stock',
    title: '入库（自动建档）',
    description:
      '把物料加入库存（电子元器件 / 开发板 / 电子模块 / 五金 / 耗材，用 kind 指定大类）。' +
      '若该型号尚不存在会自动建档，因此这是"快速添加库存"的首选工具。返回操作后的库存数量。',
    inputSchema: {
      type: 'object',
      properties: {
        partNumber: str('元器件型号，例如 STM32F103C8T6'),
        quantity: num('入库数量，必须大于 0'),
        kind: str('物料大类（选填，默认电子元器件）', {
          enum: KIND_OPTIONS.map((item) => item.label)
        }),
        manufacturer: str('厂商，例如 ST（选填，但同名型号需要靠它区分）'),
        locationCode: str('存放位置编码，例如 A-01-03。位置不存在时会自动创建（选填）'),
        unit: str('单位，默认"个"', { enum: UNITS }),
        unitPrice: num('单价（选填）'),
        category: str('分类（选填）', { enum: ALL_CATEGORIES }),
        package: str('封装，例如 LQFP-48（选填）'),
        description: str('物料描述（选填）'),
        supplierName: str('供应商名称（选填）'),
        note: str('备注（选填）'),
        imageUrl: str('商品照片外链，需以 http(s) 开头（选填）')
      },
      required: ['partNumber', 'quantity']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: 'remove_stock',
    title: '出库',
    description: '从库存中扣减数量。库存不足时会报错并告知当前可用数量，不会产生负库存。',
    inputSchema: {
      type: 'object',
      properties: {
        partNumber: str('元器件型号'),
        componentId: str('元器件 id（与 partNumber 二选一，优先使用）'),
        quantity: num('出库数量，必须大于 0'),
        projectRef: str('领用项目 / 工单号（选填）'),
        note: str('备注（选填）')
      },
      required: ['quantity']
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  },
  {
    name: 'set_stock',
    title: '盘点',
    description: '直接把库存数量改为指定值（用于盘点纠偏）。与当前库存相同时会报错提示无需调整。',
    inputSchema: {
      type: 'object',
      properties: {
        partNumber: str('元器件型号'),
        componentId: str('元器件 id（与 partNumber 二选一，优先使用）'),
        quantity: num('盘点后的实际数量'),
        note: str('盘点说明（选填）')
      },
      required: ['quantity']
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  },
  {
    name: 'bulk_add_stock',
    title: '批量入库',
    description:
      '一次提交多条入库记录，适合把一份到货清单整批录入。每条记录独立成败，返回逐条结果。',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '入库条目列表',
          items: {
            type: 'object',
            properties: {
              partNumber: str('型号'),
              quantity: num('数量'),
              manufacturer: str('厂商（选填）'),
              locationCode: str('位置编码（选填）'),
              unit: str('单位（选填）'),
              unitPrice: num('单价（选填）'),
              note: str('备注（选填）')
            },
            required: ['partNumber', 'quantity']
          }
        },
        supplierName: str('统一供应商名称（选填，会被每条记录继承）'),
        kind: str('统一大类（选填，会被每条记录继承）', {
          enum: KIND_OPTIONS.map((item) => item.label)
        }),
        note: str('整批备注（选填）')
      },
      required: ['items']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  {
    name: 'search_components',
    title: '搜索物料',
    description:
      '按关键词/大类/分类/厂商/位置等条件检索库存。关键词会同时匹配型号、厂商、描述和标签。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: str('搜索关键词（选填）'),
        kind: str('按大类过滤（选填）', {
          enum: KIND_OPTIONS.map((item) => item.label)
        }),
        manufacturer: str('按厂商过滤（选填）'),
        category: str('按分类过滤（选填）', { enum: ALL_CATEGORIES }),
        locationCode: str('按位置编码过滤（选填）'),
        lowStockOnly: { type: 'boolean', description: '只看低于安全库存的（选填）' },
        includeArchived: { type: 'boolean', description: '是否包含已归档物料（选填，默认否）' },
        limit: num('返回条数，默认 20，最大 100')
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'get_component',
    title: '元器件详情',
    description: '获取单个元器件的完整信息，并附带最近的出入库流水。',
    inputSchema: {
      type: 'object',
      properties: {
        partNumber: str('型号'),
        componentId: str('元器件 id（优先）'),
        manufacturer: str('厂商，用于同名型号消歧（选填）'),
        movementLimit: num('附带流水条数，默认 10')
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'list_low_stock',
    title: '低库存清单',
    description: '列出库存低于（或等于）安全库存的元器件，按缺口从大到小排序。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: num('返回条数，默认 20')
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'list_movements',
    title: '出入库流水',
    description: '查询最近的出入库/盘点记录，可按型号或操作来源（界面操作 / AI 操作）过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        partNumber: str('只看某个型号（选填）'),
        type: { type: 'string', enum: ['in', 'out', 'adjust', 'init'], description: '按类型过滤（选填）' },
        source: {
          type: 'string',
          enum: ['all', 'local', 'ai'],
          description: 'local=界面操作，ai=AI 操作，默认 all'
        },
        limit: num('返回条数，默认 20，最大 100')
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'list_suppliers',
    title: '供应商列表',
    description: '列出供应商，可按名称/联系人关键词检索。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: str('关键词（选填）'),
        limit: num('返回条数，默认 30')
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'add_supplier',
    title: '新建供应商',
    description: '新增一家供应商档案。名称重复时会报错。',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('供应商名称'),
        shortName: str('简称（选填）'),
        contactName: str('联系人（选填）'),
        phone: str('电话（选填）'),
        email: str('邮箱（选填）'),
        address: str('地址（选填）'),
        paymentTerms: str('账期，例如 月结 30 天（选填）'),
        note: str('备注（选填）')
      },
      required: ['name']
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  {
    name: 'list_locations',
    title: '库位列表',
    description: '列出全部库位编码、名称、类型与备注，可用于确认物料该放哪里。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'get_stats',
    title: '库存概览',
    description: '返回 SKU 数、总数量、低库存数量、今日流水笔数等汇总指标。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false }
  },
  {
    name: 'archive_component',
    title: '归档 / 恢复元器件',
    description:
      '归档不再使用的元器件（不删除数据，可随时恢复）。归档后默认不出现在检索结果中。把 restore 设为 true 可恢复。',
    inputSchema: {
      type: 'object',
      properties: {
        partNumber: str('元器件型号'),
        componentId: str('元器件 id（优先）'),
        manufacturer: str('厂商，用于同名型号消歧（选填）'),
        restore: { type: 'boolean', description: '传 true 表示恢复归档（默认 false，即归档）' }
      }
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  },
  {
    name: 'update_component',
    title: '修改元器件信息',
    description:
      '修改元器件档案字段（型号、厂商、分类、封装、位置、安全库存、单价等）。不用于调整数量，改数量请用 set_stock / add_stock / remove_stock。',
    inputSchema: {
      type: 'object',
      properties: {
        partNumber: str('要修改的元器件型号'),
        componentId: str('元器件 id（优先）'),
        setPartNumber: str('新的型号（选填）'),
        kind: str('调整到另一个大类（选填）', {
          enum: KIND_OPTIONS.map((item) => item.label)
        }),
        manufacturer: str('新厂商（选填）'),
        category: str('新分类（选填）', { enum: ALL_CATEGORIES }),
        package: str('新封装（选填）'),
        description: str('新描述（选填）'),
        locationCode: str('新位置编码（选填）'),
        safetyStock: num('新安全库存（选填）'),
        unitPrice: num('新单价（选填）'),
        packaging: str('包装形式（选填）', { enum: PACKAGINGS }),
        tags: str('标签，逗号分隔（选填）'),
        note: str('备注（选填）'),
        imageUrl: str('商品照片外链，需以 http(s) 开头（选填）')
      }
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }
]

/* ------------------------------------------------------------------ */
/* 工具实现                                                            */
/* ------------------------------------------------------------------ */

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => ToolResult

const handlerMap: Record<string, Handler> = {
  add_stock(args, ctx) {
    const partNumber = String(args.partNumber ?? '').trim()
    const quantity = Number(args.quantity ?? 0)
    if (!partNumber) return errorResult('缺少 partNumber', 'VALIDATION_FAILED')
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return errorResult('quantity 必须是大于 0 的数字', 'VALIDATION_FAILED')
    }

    const manufacturer = String(args.manufacturer ?? '').trim()
    const existing = findAnyByPart(partNumber, manufacturer)

    const supplier = resolveSupplier(
      args.supplierName ? String(args.supplierName) : undefined
    )

    let component: Component
    let created = false
    let reactivated = false

    if (existing) {
      if (existing.status !== 'active') {
        // 收到了已归档的料，说明重新启用了它
        componentsService.restore(existing.id)
        reactivated = true
      }
      component = componentsRepo.get(existing.id)!
    } else {
      component = componentsService.create({
        kind: args.kind ? normalizeKind(args.kind) : undefined,
        partNumber,
        manufacturer,
        category: args.category ? String(args.category) : null,
        package: args.package ? String(args.package) : null,
        description: args.description ? String(args.description) : null,
        quantity: 0,
        unit: args.unit ? String(args.unit) : '个',
        safetyStock: 0,
        unitPrice: args.unitPrice === undefined ? null : Number(args.unitPrice),
        locationCode: args.locationCode ? String(args.locationCode) : null,
        supplierId: supplier?.id ?? null,
        note: args.note ? String(args.note) : null,
        imageUrl: args.imageUrl ? String(args.imageUrl) : null
      })
      created = true
    }

    const result = movementsService.create({
      componentId: component.id,
      type: 'in',
      quantity,
      unitPrice: args.unitPrice === undefined ? null : Number(args.unitPrice),
      supplierId: supplier?.id ?? null,
      operator: operatorTag(ctx),
      note: args.note ? String(args.note) : null
    })

    const after = componentsRepo.get(component.id)!

    return textResult({
      ok: true,
      created,
      reactivated,
      component: briefComponent(after),
      change: `+${quantity}`,
      before: result.quantity - quantity,
      after: result.quantity,
      message: created
        ? `已新建物料 ${after.partNumber} 并入库 ${quantity} ${after.unit}`
        : reactivated
          ? `${after.partNumber} 原为归档状态，已恢复并入库 ${quantity} ${after.unit}，现有 ${result.quantity} ${after.unit}`
          : `${after.partNumber} 入库 ${quantity} ${after.unit}，现有 ${result.quantity} ${after.unit}`
    })
  },

  remove_stock(args, ctx) {
    const quantity = Number(args.quantity ?? 0)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return errorResult('quantity 必须是大于 0 的数字', 'VALIDATION_FAILED')
    }
    const component = requireComponent({
      componentId: args.componentId ? String(args.componentId) : undefined,
      partNumber: args.partNumber ? String(args.partNumber) : undefined
    })

    const result = movementsService.create({
      componentId: component.id,
      type: 'out',
      quantity,
      projectRef: args.projectRef ? String(args.projectRef) : null,
      operator: operatorTag(ctx),
      note: args.note ? String(args.note) : null
    })

    return textResult({
      ok: true,
      partNumber: component.partNumber,
      change: `-${quantity}`,
      before: result.quantity + quantity,
      after: result.quantity,
      message: `${component.partNumber} 出库 ${quantity} ${component.unit}，剩余 ${result.quantity} ${component.unit}`
    })
  },

  set_stock(args, ctx) {
    const quantity = Number(args.quantity ?? NaN)
    if (!Number.isFinite(quantity) || quantity < 0) {
      return errorResult('quantity 必须是不小于 0 的数字', 'VALIDATION_FAILED')
    }
    const component = requireComponent({
      componentId: args.componentId ? String(args.componentId) : undefined,
      partNumber: args.partNumber ? String(args.partNumber) : undefined
    })

    const result = movementsService.create({
      componentId: component.id,
      type: 'adjust',
      quantity,
      operator: operatorTag(ctx),
      note: args.note ? String(args.note) : 'AI 盘点调整'
    })

    return textResult({
      ok: true,
      partNumber: component.partNumber,
      before: component.quantity,
      after: result.quantity,
      message: `${component.partNumber} 盘点：${component.quantity} → ${result.quantity} ${component.unit}`
    })
  },

  bulk_add_stock(args, ctx) {
    const items = Array.isArray(args.items) ? args.items : []
    if (!items.length) return errorResult('items 不能为空', 'VALIDATION_FAILED')
    if (items.length > 200) return errorResult('单次最多 200 条', 'VALIDATION_FAILED')

    const supplierName = args.supplierName ? String(args.supplierName) : undefined
    const batchKind = args.kind ? String(args.kind) : undefined
    const batchNote = args.note ? String(args.note) : undefined

    const results: Array<Record<string, unknown>> = []
    let okCount = 0

    for (const raw of items) {
      const item = (raw ?? {}) as Record<string, unknown>
      try {
        const r = handlerMap.add_stock(
          {
            ...item,
            supplierName: item.supplierName ?? supplierName,
            kind: item.kind ?? batchKind,
            note: item.note ?? batchNote
          },
          ctx
        )
        results.push({
          partNumber: item.partNumber,
          ok: !r.isError,
          detail: r.structuredContent?.message ?? r.content[0]?.text ?? ''
        })
        if (!r.isError) okCount += 1
      } catch (err) {
        const failed = humanizeError(err)
        results.push({
          partNumber: item.partNumber,
          ok: false,
          detail: failed.content[0]?.text ?? '失败'
        })
      }
    }

    return textResult({
      ok: true,
      total: items.length,
      succeeded: okCount,
      failed: items.length - okCount,
      results
    })
  },

  search_components(args) {
    const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 100)
    const page = componentsRepo.list({
      q: args.keyword ? String(args.keyword) : undefined,
      kind: args.kind ? normalizeKind(args.kind) : undefined,
      manufacturer: args.manufacturer ? String(args.manufacturer) : undefined,
      category: args.category ? String(args.category) : undefined,
      locationCode: args.locationCode ? String(args.locationCode) : undefined,
      lowStock: args.lowStockOnly ? true : undefined,
      status: args.includeArchived ? 'all' : 'active',
      pageSize: limit,
      page: 1
    })

    return textResult({
      total: page.total,
      returned: page.items.length,
      items: page.items.map(briefComponent)
    })
  },

  get_component(args) {
    const component = requireComponent({
      componentId: args.componentId ? String(args.componentId) : undefined,
      partNumber: args.partNumber ? String(args.partNumber) : undefined,
      manufacturer: args.manufacturer ? String(args.manufacturer) : undefined
    })
    const limit = Math.min(Math.max(Number(args.movementLimit ?? 10) || 10, 0), 50)
    const movements =
      limit > 0 ? movementsService.forComponent(component.id, limit).map(briefMovement) : []

    return textResult({
      ...component,
      lowStock: component.quantity <= component.safetyStock,
      recentMovements: movements
    })
  },

  list_low_stock(args) {
    const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 100)
    const items = componentsService.lowStock(limit)
    return textResult({
      count: items.length,
      items: items.map((c) => ({
        ...briefComponent(c),
        shortage: Math.max(c.safetyStock - c.quantity, 0)
      }))
    })
  },

  list_movements(args) {
    const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 100)
    let componentId: string | undefined

    if (args.partNumber) {
      const found = resolveComponent({ partNumber: String(args.partNumber) })
      if (!found) {
        return textResult({ total: 0, items: [], note: '未找到该型号' })
      }
      componentId = found.id
    }

    const page = movementsService.list({
      componentId,
      type: args.type ? String(args.type) : undefined,
      source: (args.source as 'all' | 'local' | 'ai' | undefined) ?? 'all',
      pageSize: limit,
      page: 1
    })

    return textResult({
      total: page.total,
      returned: page.items.length,
      items: page.items.map(briefMovement)
    })
  },

  list_suppliers(args) {
    const limit = Math.min(Math.max(Number(args.limit ?? 30) || 30, 1), 100)
    const page = suppliersService.list({
      q: args.keyword ? String(args.keyword) : undefined,
      pageSize: limit,
      page: 1
    })
    return textResult({
      total: page.total,
      items: page.items.map((s) => ({
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        contact: s.contactName,
        phone: s.phone,
        email: s.email,
        paymentTerms: s.paymentTerms,
        level: s.level,
        componentCount: s.componentCount,
        totalQuantity: s.totalQuantity
      }))
    })
  },

  add_supplier(args) {
    const supplier = suppliersService.create({
      name: String(args.name ?? '').trim(),
      shortName: args.shortName ?? null,
      contactName: args.contactName ?? null,
      phone: args.phone ?? null,
      email: args.email ?? null,
      address: args.address ?? null,
      paymentTerms: args.paymentTerms ?? null,
      note: args.note ?? null
    })
    return textResult({ ok: true, supplier, message: `已新增供应商「${supplier.name}」` })
  },

  list_locations() {
    const flat = locationsService.flat()
    return textResult({
      count: flat.length,
      items: flat
        .map((l) => ({
          code: l.fullCode,
          name: l.name,
          kind: l.kind,
          note: l.note ?? undefined
        }))
        .sort((a, b) => a.code.localeCompare(b.code))
    })
  },

  get_stats() {
    const base = componentsService.stats()
    return textResult({
      skuCount: base.skuCount,
      totalQuantity: base.totalQuantity,
      lowStockCount: base.lowStockCount,
      movementsToday: base.movementsToday,
      supplierCount: base.supplierCount,
      locationCount: base.locationCount
    })
  },

  archive_component(args) {
    // 这里用 resolveComponent 而不是 requireComponent：归档中的物料也要能再次归档/恢复，
    // 否则这个操作就不满足幂等。
    const component = resolveComponent({
      componentId: args.componentId ? String(args.componentId) : undefined,
      partNumber: args.partNumber ? String(args.partNumber) : undefined,
      manufacturer: args.manufacturer ? String(args.manufacturer) : undefined
    })

    if (!component) {
      throw new AppError(
        'COMPONENT_NOT_FOUND',
        `找不到元器件${args.partNumber ? `「${args.partNumber}」` : ''}`
      )
    }

    const restore = args.restore === true
    const target = restore ? 'active' : 'archived'
    const unchanged = component.status === target

    if (!unchanged) {
      if (restore) componentsService.restore(component.id)
      else componentsService.archive(component.id)
    }

    return textResult({
      ok: true,
      partNumber: component.partNumber,
      status: target,
      unchanged,
      message: unchanged
        ? `${component.partNumber} 已经是${restore ? '在用' : '归档'}状态，无需变更`
        : restore
          ? `已恢复 ${component.partNumber}`
          : `已归档 ${component.partNumber}（数据保留，可恢复）`
    })
  },

  update_component(args) {
    const component = requireComponent({
      componentId: args.componentId ? String(args.componentId) : undefined,
      partNumber: args.partNumber ? String(args.partNumber) : undefined
    })

    const patch: Record<string, unknown> = {}
    const passthrough = [
      'manufacturer',
      'category',
      'package',
      'description',
      'locationCode',
      'safetyStock',
      'unitPrice',
      'packaging',
      'tags',
      'note',
      'imageUrl'
    ]
    for (const key of passthrough) {
      if (args[key] !== undefined && args[key] !== null) patch[key] = args[key]
    }
    if (args.setPartNumber !== undefined) patch.partNumber = args.setPartNumber
    if (args.kind !== undefined) patch.kind = normalizeKind(args.kind)

    if (!Object.keys(patch).length) {
      return errorResult('没有需要修改的字段', 'VALIDATION_FAILED')
    }

    const updated = componentsService.update(component.id, patch)
    return textResult({
      ok: true,
      component: briefComponent(updated),
      message: `已更新 ${updated.partNumber}`
    })
  }
}

/** 执行一次工具调用 */
export function callTool(
  name: string,
  args: Record<string, unknown> | undefined,
  ctx: ToolContext
): ToolResult {
  const handler = handlerMap[name]
  if (!handler) {
    return errorResult(`未知工具：${name}`, 'METHOD_NOT_FOUND')
  }
  try {
    return handler(args ?? {}, ctx)
  } catch (err) {
    return humanizeError(err)
  }
}

export function listTools(): ToolDefinition[] {
  return TOOLS
}
