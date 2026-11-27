import { useQuery } from '@tanstack/react-query'
import { Pencil, Trash2, X } from 'lucide-react'
import type { Component } from '@shared/types'
import { KIND_META, MOVEMENT_LABELS } from '@shared/constants'
import { api } from '@renderer/lib/api'
import { dash, formatDateTime, formatNumber, formatPrice, isLowStock } from '@renderer/lib/format'
import { Button, Drawer, IconButton } from '@renderer/components/ui'

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start py-2" style={{ borderTop: '1px solid var(--hair)' }}>
      <span className="w-24 shrink-0 text-[12px] text-t3">{label}</span>
      <span className={`min-w-0 break-words text-[12.5px] text-t1 ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

export function ComponentDrawer({
  component,
  onClose,
  onStock,
  onEdit,
  onDelete
}: {
  component: Component | null
  onClose: () => void
  onStock: (type: 'in' | 'out' | 'adjust') => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { data: movements } = useQuery({
    queryKey: ['component-movements', component?.id],
    queryFn: () => api.components.movements(component!.id, 20),
    enabled: Boolean(component)
  })

  if (!component) return null

  const low = isLowStock(component.quantity, component.safetyStock)
  const meta = KIND_META[component.kind]
  const showSpecFields = component.kind !== 'hardware' && component.kind !== 'consumable'

  return (
    <Drawer open={Boolean(component)} onClose={onClose}>
      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <p className="mono truncate text-[15px] font-medium leading-tight text-t1">
            {component.partNumber}
          </p>
          <p className="mt-1 text-[12px] text-t2">
            {dash(component.manufacturer)} · {dash(component.category)}
          </p>
        </div>
        <IconButton label="关闭" className="ml-auto" onClick={onClose}>
          <X size={15} strokeWidth={1.6} />
        </IconButton>
      </div>

      <div className="px-5">
        <div className="flex items-end gap-3">
          <span
            className="num text-[30px] font-medium leading-none"
            style={{ color: low ? 'var(--warn)' : 'var(--text-1)' }}
          >
            {formatNumber(component.quantity)}
          </span>
          <span className="pb-1 text-[12px] text-t3">
            {component.unit}
            {component.safetyStock > 0 ? ` · 安全库存 ${formatNumber(component.safetyStock)}` : ''}
          </span>
        </div>
        {low ? <p className="mt-2 text-[12px] text-warn">低于安全库存，建议补货</p> : null}

        <div className="mt-4 flex items-center gap-2">
          <Button variant="primary" onClick={() => onStock('in')}>
            入库
          </Button>
          <Button onClick={() => onStock('out')}>出库</Button>
          <Button onClick={() => onStock('adjust')}>盘点</Button>
          <Button className="ml-auto" onClick={onEdit}>
            <Pencil size={13} strokeWidth={1.6} />
            编辑
          </Button>
          <IconButton
            label="删除这条物料"
            className="hover:bg-danger-soft"
            style={{ color: 'var(--danger)' }}
            onClick={onDelete}
          >
            <Trash2 size={14} strokeWidth={1.7} />
          </IconButton>
        </div>
      </div>

      <div className="mt-5 flex-1 overflow-auto px-5 pb-6">
        <p className="mb-1 text-[12px] font-medium text-t2">{meta.label}信息</p>
        <div>
          <Row label="存放位置" value={dash(component.locationFullCode)} mono />
          <Row label={meta.packageLabel} value={dash(component.package)} mono />
          <Row label="包装形式" value={dash(component.packaging)} />
          <Row label="批次号" value={dash(component.dateCode)} mono />
          <Row label="主供应商" value={dash(component.supplierName)} />
          <Row label="参考单价" value={component.unitPrice === null ? '—' : `¥ ${formatPrice(component.unitPrice)}`} />
          <Row label="最小起订量" value={component.moq === null ? '—' : formatNumber(component.moq)} />
          {showSpecFields ? (
            <>
              <Row label="湿敏等级" value={component.msl === null ? '—' : `MSL ${component.msl}`} />
              <Row label="RoHS" value={component.rohs ? '符合' : '不适用'} />
            </>
          ) : null}
          <Row label="标签" value={dash(component.tags)} />
          <Row label="描述" value={dash(component.description)} />
          <Row label="备注" value={dash(component.note)} />
        </div>

        <p className="mb-1 mt-6 text-[12px] font-medium text-t2">最近流水</p>
        <div>
          {(movements ?? []).length === 0 ? (
            <p className="py-6 text-center text-[12px] text-t3">暂无流水</p>
          ) : (
            (movements ?? []).map((movement) => (
              <div
                key={movement.id}
                className="flex items-center gap-3 py-2.5"
                style={{ borderTop: '1px solid var(--hair)' }}
              >
                <span className="w-9 shrink-0 text-[12px] text-t2">
                  {MOVEMENT_LABELS[movement.type] ?? movement.type}
                </span>
                <span
                  className="num w-16 shrink-0 text-[12.5px]"
                  style={{ color: movement.quantity > 0 ? 'var(--text-1)' : 'var(--text-2)' }}
                >
                  {movement.quantity > 0 ? '+' : ''}
                  {formatNumber(movement.quantity)}
                </span>
                <span className="num text-[12px] text-t3">
                  {formatNumber(movement.beforeQty)} → {formatNumber(movement.afterQty)}
                </span>
                <span className="ml-auto shrink-0 text-[11.5px] text-t3">
                  {formatDateTime(movement.occurredAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Drawer>
  )
}
