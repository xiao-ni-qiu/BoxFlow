import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { MOVEMENT_LABELS } from '@shared/constants'
import { api } from '@renderer/lib/api'
import { formatDateTime, formatNumber } from '@renderer/lib/format'
import { Button, EmptyState, Select } from '@renderer/components/ui'
import { PageHeader } from '@renderer/features/overview/OverviewPage'
import { ExportMenu } from '@renderer/features/transfer/ExportMenu'

const TH = 'sticky top-0 z-[2] whitespace-nowrap bg-surface py-2 text-left text-[12px] font-normal text-t3'
const TD = 'whitespace-nowrap pr-3'

function sourceLabel(operator: string): string {
  if (operator === 'local') return '界面'
  if (operator.startsWith('mcp:')) return `AI · ${operator.slice(4)}`
  return operator
}

export function MovementsPage() {
  const [type, setType] = useState('')
  const [source, setSource] = useState<'all' | 'local' | 'ai'>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['movements', { type, source, page }],
    queryFn: () => api.movements.list({ type: type || undefined, source, page, pageSize: 60 }),
    placeholderData: keepPreviousData
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / (data?.pageSize ?? 60)))

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="出入库流水"
        meta={data ? `共 ${formatNumber(total)} 条记录` : '加载中'}
        action={<ExportMenu entity="movements" />}
      />

      <div className="flex items-center gap-2 px-7 pt-5">
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            setPage(1)
          }}
          className="!w-[120px]"
        >
          <option value="">全部类型</option>
          <option value="in">入库</option>
          <option value="out">出库</option>
          <option value="adjust">盘点</option>
          <option value="init">建档</option>
        </Select>

        <Select
          value={source}
          onChange={(e) => {
            setSource(e.target.value as 'all' | 'local' | 'ai')
            setPage(1)
          }}
          className="!w-[132px]"
        >
          <option value="all">全部来源</option>
          <option value="local">界面操作</option>
          <option value="ai">AI 操作</option>
        </Select>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col px-7">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: 148 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 96 }} />
              <col />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hair-strong)' }}>
                <th className={TH}>时间</th>
                <th className={TH}>类型</th>
                <th className={TH}>型号</th>
                <th className={clsx(TH, 'pr-3 text-right')}>变动</th>
                <th className={clsx(TH, 'pr-3 text-right')}>结存</th>
                <th className={TH}>来源</th>
                <th className={clsx(TH, 'pr-0')}>备注</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[12.5px] text-t3">
                    加载中…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[12.5px] text-danger">
                    加载失败：{error instanceof Error ? error.message : '未知错误'}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    style={{ height: 48, borderBottom: '1px solid var(--hair)' }}
                    className="hover:bg-app"
                  >
                    <td className={clsx(TD, 'num text-[12px] text-t3')}>
                      {formatDateTime(item.occurredAt)}
                    </td>
                    <td className={clsx(TD, 'text-[12.5px] text-t2')}>
                      {MOVEMENT_LABELS[item.type] ?? item.type}
                    </td>
                    <td className={clsx(TD, 'mono truncate text-t1')}>{item.partNumber ?? '—'}</td>
                    <td
                      className={clsx(TD, 'num text-right text-[12.5px]')}
                      style={{ color: item.quantity > 0 ? 'var(--text-1)' : 'var(--text-2)' }}
                    >
                      {item.quantity > 0 ? '+' : ''}
                      {formatNumber(item.quantity)}
                    </td>
                    <td className={clsx(TD, 'num text-right text-[12px] text-t3')}>
                      {formatNumber(item.beforeQty)} → {formatNumber(item.afterQty)}
                    </td>
                    <td className={clsx(TD, 'truncate text-[12px] text-t2')}>
                      {sourceLabel(item.operator)}
                    </td>
                    <td className="truncate text-[12px] text-t3">
                      {item.note || item.projectRef || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!isLoading && !error && items.length === 0 ? (
            <EmptyState
              title="还没有流水"
              description="在元器件列表里做一次入库或出库，这里就会有记录。"
            />
          ) : null}
        </div>

        <div className="flex h-12 shrink-0 items-center text-[12px] text-t3">
          <span>
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
    </div>
  )
}
