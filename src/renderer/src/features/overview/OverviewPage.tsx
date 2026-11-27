import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatNumber } from '@renderer/lib/format'
import { Dot } from '@renderer/components/ui'
import type { ViewKey } from '@renderer/components/Sidebar'

export function PageHeader({
  title,
  meta,
  action
}: {
  title: string
  meta?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start px-7 pt-6">
      <div>
        <h1 className="text-[20px] font-medium leading-[1.3] tracking-[-0.2px] text-t1">{title}</h1>
        {meta ? <p className="mt-1.5 text-[12px] text-t2">{meta}</p> : null}
      </div>
      {action ? <div className="ml-auto pt-1">{action}</div> : null}
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card px-4 py-3.5" style={{ background: 'var(--bg-sunken)' }}>
      <p className="text-[12px] text-t2">{label}</p>
      <p className="num mt-1.5 text-[24px] font-medium leading-none text-t1">{value}</p>
      {hint ? <p className="mt-2 text-[11px] text-t3">{hint}</p> : null}
    </div>
  )
}

export function OverviewPage({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { data } = useQuery({ queryKey: ['overview'], queryFn: () => api.stats() })

  return (
    <div className="h-full overflow-auto">
      <PageHeader
        title="概览"
        meta={data ? `共 ${formatNumber(data.skuCount)} 种物料 · ${formatNumber(data.supplierCount)} 家供应商` : '加载中'}
      />

      <div className="px-7 pt-5">
        <div className="grid grid-cols-4 gap-3">
          <Metric label="物料种类" value={formatNumber(data?.skuCount ?? 0)} />
          <Metric label="库存总量" value={formatNumber(data?.totalQuantity ?? 0)} hint="所有物料数量合计" />
          <Metric
            label="低于安全库存"
            value={formatNumber(data?.lowStockCount ?? 0)}
            hint={data && data.lowStockCount > 0 ? '建议尽快补货' : '库存健康'}
          />
          <Metric label="今日出入库" value={formatNumber(data?.movementsToday ?? 0)} hint="含 AI 操作" />
        </div>
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-3 px-7 pb-8 pt-6">
        <section className="rounded-card border border-hair">
          <header className="flex items-center px-4 py-3">
            <h2 className="text-[13px] font-medium text-t1">需要补货</h2>
            <button
              type="button"
              className="ml-auto flex items-center gap-0.5 text-[12px] text-t2 hover:text-accent"
              onClick={() => onNavigate('components')}
            >
              全部物料
              <ChevronRight size={13} strokeWidth={1.6} />
            </button>
          </header>
          <div className="px-4 pb-2">
            {(data?.lowStock ?? []).length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-t3">暂无需要补货的物料</p>
            ) : (
              (data?.lowStock ?? []).map((item) => (
                <div
                  key={item.id}
                  className="row-hover flex h-11 items-center gap-3 rounded-ctl px-2"
                  style={{ borderTop: '1px solid var(--hair)' }}
                >
                  <span className="mono shrink-0 text-t1">{item.partNumber}</span>
                  <span className="truncate text-[12px] text-t3">{item.manufacturer || '—'}</span>
                  <span className="num ml-auto flex items-center gap-1.5 text-[13px] text-warn">
                    <Dot />
                    {formatNumber(item.quantity)}
                  </span>
                  <span className="num w-14 text-right text-[11.5px] text-t3">
                    / {formatNumber(item.safetyStock)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-card border border-hair">
          <header className="flex items-center px-4 py-3">
            <h2 className="text-[13px] font-medium text-t1">供应商</h2>
            <button
              type="button"
              className="ml-auto flex items-center gap-0.5 text-[12px] text-t2 hover:text-accent"
              onClick={() => onNavigate('suppliers')}
            >
              管理
              <ArrowUpRight size={13} strokeWidth={1.6} />
            </button>
          </header>
          <div className="px-4 pb-3">
            {(data?.suppliers ?? []).map((supplier) => (
              <div
                key={supplier.id}
                className="flex h-11 items-center gap-2 rounded-ctl px-2"
                style={{ borderTop: '1px solid var(--hair)' }}
              >
                <span className="truncate text-[13px] text-t1">{supplier.name}</span>
                <span className="num ml-auto text-[11.5px] text-t3">
                  {formatNumber(supplier.componentCount ?? 0)} 种
                </span>
              </div>
            ))}
            {(data?.suppliers ?? []).length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-t3">还没有供应商</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="px-7 pb-8">
        <p className="text-[11.5px] text-t3">
          提示：按 <kbd className="rounded border border-hair px-1">/</kbd> 或{' '}
          <kbd className="rounded border border-hair px-1">Ctrl K</kbd> 可以直接搜索物料。
        </p>
      </div>
    </div>
  )
}
