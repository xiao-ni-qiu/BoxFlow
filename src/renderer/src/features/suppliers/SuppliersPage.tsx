import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Search } from 'lucide-react'
import type { Supplier } from '@shared/types'
import { api, ApiError } from '@renderer/lib/api'
import { useDebounced, useSearchFocus } from '@renderer/lib/hooks'
import { dash, formatNumber } from '@renderer/lib/format'
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast
} from '@renderer/components/ui'
import { PageHeader } from '@renderer/features/overview/OverviewPage'
import { ExportMenu } from '@renderer/features/transfer/ExportMenu'
import { ImportWizard } from '@renderer/features/transfer/ImportWizard'

const TH = 'sticky top-0 z-[2] whitespace-nowrap bg-surface py-2 text-left text-[12px] font-normal text-t3'
const TD = 'whitespace-nowrap pr-3'

interface FormState {
  name: string
  code: string
  shortName: string
  contactName: string
  phone: string
  email: string
  paymentTerms: string
  level: string
  tags: string
  note: string
}

const EMPTY: FormState = {
  name: '',
  code: '',
  shortName: '',
  contactName: '',
  phone: '',
  email: '',
  paymentTerms: '',
  level: '3',
  tags: '',
  note: ''
}

export function SuppliersPage() {
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 200)
  const searchRef = useSearchFocus()
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', { q: debounced, page }],
    queryFn: () => api.suppliers.list({ q: debounced || undefined, page, pageSize: 50 }),
    placeholderData: keepPreviousData
  })

  useEffect(() => {
    if (!formOpen) return
    setError(null)
    setForm(
      editing
        ? {
            name: editing.name,
            code: editing.code ?? '',
            shortName: editing.shortName ?? '',
            contactName: editing.contactName ?? '',
            phone: editing.phone ?? '',
            email: editing.email ?? '',
            paymentTerms: editing.paymentTerms ?? '',
            level: String(editing.level),
            tags: editing.tags ?? '',
            note: editing.note ?? ''
          }
        : EMPTY
    )
  }, [formOpen, editing])

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? api.suppliers.update(editing.id, payload) : api.suppliers.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.push(editing ? '已保存修改' : '已新增供应商')
      setFormOpen(false)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败')
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / (data?.pageSize ?? 50)))

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = (): void => {
    if (!form.name.trim()) {
      setError('供应商名称不能为空')
      return
    }
    mutation.mutate({
      name: form.name.trim(),
      code: form.code.trim() || null,
      shortName: form.shortName.trim() || null,
      contactName: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      paymentTerms: form.paymentTerms.trim() || null,
      level: Number(form.level || 3),
      tags: form.tags.trim() || null,
      note: form.note.trim() || null
    })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="供应商"
        meta={data ? `共 ${formatNumber(total)} 家 · 点任意一行可编辑` : '加载中'}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => setImportOpen(true)}>导入</Button>
            <ExportMenu entity="suppliers" />
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              新增供应商
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
            placeholder="搜索供应商名称、联系人或电话"
            className="field pl-8"
          />
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col px-7">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 132 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hair-strong)' }}>
                <th className={TH}>名称</th>
                <th className={TH}>联系人</th>
                <th className={TH}>电话</th>
                <th className={clsx(TH, 'pr-3 text-right')}>供货物料</th>
                <th className={clsx(TH, 'pr-3 text-right')}>库存合计</th>
                <th className={clsx(TH, 'pr-0 text-right')}>评级</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} style={{ height: 56, borderBottom: '1px solid var(--hair)' }}>
                    {Array.from({ length: 6 }).map((__, cell) => (
                      <td key={cell} className="pr-3">
                        {cell === 0 ? <span className="block h-2.5 w-40 rounded bg-sunken" /> : null}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setEditing(item)
                      setFormOpen(true)
                    }}
                    className="cursor-pointer hover:bg-app"
                    style={{ height: 56, borderBottom: '1px solid var(--hair)' }}
                  >
                    <td className={clsx(TD, 'text-t1')}>
                      <p className="truncate text-[13px]">{item.name}</p>
                      <p className="truncate text-[11.5px] text-t3">
                        {[item.shortName, item.paymentTerms, item.tags].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </td>
                    <td className={clsx(TD, 'truncate text-[12.5px] text-t2')}>
                      {dash(item.contactName)}
                    </td>
                    <td className={clsx(TD, 'num truncate text-[12.5px] text-t2')}>
                      {dash(item.phone)}
                    </td>
                    <td className={clsx(TD, 'num text-right text-[13px] text-t1')}>
                      {formatNumber(item.componentCount ?? 0)}
                    </td>
                    <td className={clsx(TD, 'num text-right text-[13px] text-t2')}>
                      {formatNumber(item.totalQuantity ?? 0)}
                    </td>
                    <td className="num text-right text-[12.5px] text-t2">L{item.level}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!isLoading && items.length === 0 ? (
            <EmptyState
              title="还没有供应商"
              description="录入供应商后，可以在物料里指定主供应商，方便按来源统计库存。"
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  新增供应商
                </Button>
              }
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

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? '编辑供应商' : '新增供应商'}
        subtitle={editing ? editing.name : '名称唯一，重复会被拦下'}
        width={620}
        footer={
          <>
            {error ? <span className="mr-auto text-[12px] text-danger">{error}</span> : null}
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="名称" hint="必填" className="col-span-2">
            <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="简称">
            <Input value={form.shortName} onChange={(e) => set('shortName', e.target.value)} />
          </Field>
          <Field label="编号">
            <Input
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="SUP-001"
            />
          </Field>
          <Field label="联系人">
            <Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
          </Field>
          <Field label="电话">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="邮箱">
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="账期">
            <Input
              value={form.paymentTerms}
              onChange={(e) => set('paymentTerms', e.target.value)}
              placeholder="月结30天"
            />
          </Field>
          <Field label="评级">
            <Select value={form.level} onChange={(e) => set('level', e.target.value)}>
              {[5, 4, 3, 2, 1].map((lv) => (
                <option key={lv} value={lv}>
                  L{lv}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="标签">
            <Input
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="现货,原厂"
            />
          </Field>
          <Field label="备注" className="col-span-2">
            <Textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </div>
      </Modal>

      <ImportWizard
        open={importOpen}
        entity="suppliers"
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}
