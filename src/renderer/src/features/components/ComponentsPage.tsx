import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Minus, Plus, Search, Trash2 } from 'lucide-react'
import type { Component, SortKey } from '@shared/types'
import { KIND_META, type ItemKind } from '@shared/constants'
import { api, ApiError } from '@renderer/lib/api'
import { useDebounced, useSearchFocus } from '@renderer/lib/hooks'
import { dash, formatDateTime, formatNumber, isLowStock } from '@renderer/lib/format'
import { Button, EmptyState, IconButton, Modal, Select, useToast } from '@renderer/components/ui'
import { PageHeader } from '@renderer/features/overview/OverviewPage'
import { ExportMenu } from '@renderer/features/transfer/ExportMenu'
import { ImportWizard } from '@renderer/features/transfer/ImportWizard'
import { ComponentForm } from './ComponentForm'
import { ComponentDrawer } from './ComponentDrawer'
import { StockDialog } from './StockDialog'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: '最近更新' },
  { key: 'partNumber', label: '型号 A-Z' },
  { key: 'quantity', label: '库存少→多' },
  { key: 'location', label: '按位置' }
]

const TH = 'sticky top-0 z-[2] whitespace-nowrap bg-surface py-2 text-left text-[12px] font-normal text-t3'
const TD = 'whitespace-nowrap pr-3'

export function ComponentsPage({ kind }: { kind: ItemKind }) {
  const meta = KIND_META[kind]
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 200)
  const searchRef = useSearchFocus()

  const [manufacturer, setManufacturer] = useState('')
  const [category, setCategory] = useState('')
  const [lowStock, setLowStock] = useState(false)
  const [sort, setSort] = useState<SortKey>('updated')
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<Component | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Component | null>(null)
  const [stockTarget, setStockTarget] = useState<Component | null>(null)
  const [stockType, setStockType] = useState<'in' | 'out' | 'adjust'>('in')
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Component | null>(null)

  const toast = useToast()
  const queryClient = useQueryClient()

  // 打开确认框时再问后端要影响面，避免列表里为了一个数字多查一遍
  const impact = useQuery({
    queryKey: ['removal-impact', deleteTarget?.id],
    queryFn: () => api.components.removalImpact(deleteTarget!.id),
    enabled: Boolean(deleteTarget)
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.components.remove(id),
    onSuccess: (result) => {
      const cleaned = result.movements > 0 ? `，连带清除 ${result.movements} 条流水` : ''
      toast.push(`已删除 ${result.partNumber}${cleaned}`)
      setDeleteTarget(null)
      setSelected(null)
      void queryClient.invalidateQueries({ queryKey: ['components'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      void queryClient.invalidateQueries({ queryKey: ['facets'] })
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '删除失败', 'error')
  })

  const { data: facets } = useQuery({
    queryKey: ['facets', kind],
    queryFn: () => api.components.facets(kind)
  })

  const query = useMemo(
    () => ({
      kind,
      q: debounced || undefined,
      manufacturer: manufacturer || undefined,
      category: category || undefined,
      lowStock: lowStock || undefined,
      sort,
      page,
      pageSize: 50
    }),
    [kind, debounced, manufacturer, category, lowStock, sort, page]
  )

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ['components', query],
    queryFn: () => api.components.list(query),
    placeholderData: keepPreviousData
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / (data?.pageSize ?? 50)))
  const hasFilter = Boolean(debounced || manufacturer || category || lowStock)

  const openStock = (component: Component, type: 'in' | 'out' | 'adjust'): void => {
    setStockTarget(component)
    setStockType(type)
  }

  const resetFilters = (): void => {
    setSearch('')
    setManufacturer('')
    setCategory('')
    setLowStock(false)
    setPage(1)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={meta.label}
        meta={
          data
            ? `共 ${formatNumber(total)} 种${meta.label}${hasFilter ? ' · 已筛选' : ''}${
                facets ? ` · ${facets.manufacturers.length} 个${meta.makerLabel}` : ''
              }`
            : '加载中'
        }
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => setImportOpen(true)}>导入</Button>
            <ExportMenu entity="components" kind={kind} />
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              新建{meta.noun}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 px-7 pt-5">
        <div className="relative w-[320px]">
          <Search
            size={14}
            strokeWidth={1.7}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3"
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={`搜索${meta.specLabel}、${meta.makerLabel}或存放位置`}
            className="field pl-8 pr-[54px]"
          />
          <kbd className="kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            Ctrl F
          </kbd>
        </div>

        <Select
          value={manufacturer}
          onChange={(e) => {
            setManufacturer(e.target.value)
            setPage(1)
          }}
          className="!w-[124px]"
        >
          <option value="">全部{meta.makerLabel}</option>
          {(facets?.manufacturers ?? []).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>

        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
          className="!w-[120px]"
        >
          <option value="">全部分类</option>
          {(facets?.categories ?? []).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>

        <button
          type="button"
          onClick={() => {
            setLowStock((prev) => !prev)
            setPage(1)
          }}
          className={clsx(
            'h-8 rounded-ctl border px-3 text-[12.5px] transition-colors duration-fast',
            lowStock ? 'font-medium' : 'border-transparent text-t2 hover:bg-sunken hover:text-t1'
          )}
          style={
            lowStock
              ? {
                  color: 'var(--warn)',
                  borderColor: 'var(--warn)',
                  background: 'var(--warn-soft)'
                }
              : undefined
          }
        >
          仅看预警
        </button>

        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto !w-[124px]"
        >
          {SORTS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col px-7">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col />
              <col style={{ width: 92 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hair-strong)' }}>
                <th className={TH}>{meta.specLabel}</th>
                <th className={TH}>{meta.makerLabel}</th>
                <th className={TH}>分类</th>
                <th className={TH}>{meta.packageLabel}</th>
                <th className={clsx(TH, 'pr-3 text-right')}>库存</th>
                <th className={TH}>位置</th>
                <th className={clsx(TH, 'text-right')}>更新</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index} style={{ height: 44, borderBottom: '1px solid var(--hair)' }}>
                      {Array.from({ length: 7 }).map((__, cell) => (
                        <td key={cell} className="pr-3">
                          {cell === 0 || cell === 1 || cell === 3 || cell === 5 ? (
                            <span className="block h-2.5 w-3/4 rounded bg-sunken" />
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))
                : items.map((item) => {
                    const low = isLowStock(item.quantity, item.safetyStock)
                    const active = selected?.id === item.id
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelected(item)}
                        className="group cursor-pointer transition-colors duration-fast hover:bg-app"
                        style={{
                          height: 44,
                          borderBottom: '1px solid var(--hair)',
                          background: active ? 'var(--accent-soft)' : undefined
                        }}
                      >
                        <td className={clsx(TD, 'mono text-t1')}>{item.partNumber}</td>
                        <td className={clsx(TD, 'text-[12.5px] text-t2')}>
                          <span className="block truncate">{dash(item.manufacturer)}</span>
                        </td>
                        <td className={clsx(TD, 'text-[12.5px] text-t2')}>
                          <span className="block truncate">{dash(item.category)}</span>
                        </td>
                        <td className={clsx(TD, 'mono text-t2')}>{dash(item.package)}</td>
                        <td
                          className={clsx(TD, 'num text-right text-[13px]')}
                          style={{ color: low ? 'var(--warn)' : 'var(--text-1)' }}
                        >
                          {low ? (
                            <span
                              className="mr-1 inline-block h-1 w-1 rounded-full align-middle"
                              style={{ background: 'var(--warn)' }}
                            />
                          ) : null}
                          {formatNumber(item.quantity)}
                        </td>
                        <td className={clsx(TD, 'mono text-t2')}>{dash(item.locationFullCode)}</td>
                        <td className="relative py-0 pl-0 pr-0 text-right">
                          <span className="text-[11.5px] text-t3 transition-opacity duration-fast group-hover:opacity-0">
                            {formatDateTime(item.updatedAt).slice(5, 10)}
                          </span>
                          <span
                            className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-ctl p-0.5 opacity-0 transition-opacity duration-fast group-hover:opacity-100"
                            style={{ background: 'var(--bg-surface)' }}
                          >
                            <IconButton
                              label="入库"
                              className="!h-6 !w-6"
                              onClick={(event) => {
                                event.stopPropagation()
                                openStock(item, 'in')
                              }}
                            >
                              <Plus size={13} strokeWidth={2} />
                            </IconButton>
                            <IconButton
                              label="出库"
                              className="!h-6 !w-6"
                              onClick={(event) => {
                                event.stopPropagation()
                                openStock(item, 'out')
                              }}
                            >
                              <Minus size={13} strokeWidth={2} />
                            </IconButton>
                            <span
                              className="mx-0.5 block h-3.5"
                              style={{ width: 1, background: 'var(--hair-strong)' }}
                            />
                            <IconButton
                              label={`删除 ${item.partNumber}`}
                              className="!h-6 !w-6 hover:bg-danger-soft hover:text-danger"
                              onClick={(event) => {
                                event.stopPropagation()
                                setDeleteTarget(item)
                              }}
                            >
                              <Trash2 size={13} strokeWidth={1.8} />
                            </IconButton>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>

          {!isLoading && items.length === 0 ? (
            <EmptyState
              title={hasFilter ? `没有匹配的${meta.noun}` : `还没有${meta.noun}`}
              description={
                hasFilter
                  ? '换个关键词，或清空筛选条件再试。'
                  : `先建一条${meta.noun}，之后可以导入表格批量录入。`
              }
              action={
                hasFilter ? (
                  <Button onClick={resetFilters}>清空筛选</Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditing(null)
                      setFormOpen(true)
                    }}
                  >
                    新建{meta.noun}
                  </Button>
                )
              }
            />
          ) : null}
        </div>

        <div className="flex h-12 shrink-0 items-center text-[12px] text-t3">
          <span>
            {isFetching && !isLoading ? '更新中 · ' : ''}
            共 {formatNumber(total)} 条 · 第 {page} / {pageCount} 页
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              className="h-7 px-2.5 text-[12px]"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </Button>
            <Button
              className="h-7 px-2.5 text-[12px]"
              disabled={page >= pageCount}
              onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>

      <ComponentDrawer
        component={selected}
        onClose={() => setSelected(null)}
        onStock={(type) => {
          if (!selected) return
          openStock(selected, type)
        }}
        onEdit={() => {
          if (!selected) return
          setEditing(selected)
          setFormOpen(true)
        }}
        onDelete={() => {
          if (!selected) return
          setDeleteTarget(selected)
        }}
      />

      <ComponentForm
        open={formOpen}
        editing={editing}
        defaultKind={kind}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
      />

      <ImportWizard
        open={importOpen}
        entity="components"
        kind={kind}
        onClose={() => setImportOpen(false)}
      />

      <StockDialog
        open={Boolean(stockTarget)}
        component={stockTarget}
        defaultType={stockType}
        onClose={() => {
          setStockTarget(null)
          setSelected(null)
        }}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!removeMutation.isPending) setDeleteTarget(null)
        }}
        title="确认永久删除？"
        subtitle={
          deleteTarget
            ? `${deleteTarget.partNumber} · 现有 ${formatNumber(deleteTarget.quantity)} ${deleteTarget.unit}`
            : undefined
        }
        width={440}
        footer={
          <>
            <Button disabled={removeMutation.isPending} onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              style={{ background: 'var(--danger)' }}
              disabled={removeMutation.isPending}
              onClick={() => {
                if (deleteTarget) removeMutation.mutate(deleteTarget.id)
              }}
            >
              {removeMutation.isPending ? '删除中…' : '永久删除'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[12.5px] leading-relaxed text-t2">
          <p>这条物料的档案会从库里消失，且无法撤销。同时会被清除：</p>
          <ul className="space-y-1 rounded-ctl px-3 py-2.5 text-[12px]" style={{ background: 'var(--bg-sunken)' }}>
            <li>
              出入库流水 <span className="num text-t1">{impact.data ? impact.data.movements : '…'}</span> 条
            </li>
            <li>
              附件 <span className="num text-t1">{impact.data ? impact.data.attachments : '…'}</span> 个
            </li>
          </ul>
          <p className="text-t3">
            只是暂时用不上的话，可以先把它导出留档；删除后如需再建，库存与流水都要重新录入。
          </p>
        </div>
      </Modal>
    </div>
  )
}
