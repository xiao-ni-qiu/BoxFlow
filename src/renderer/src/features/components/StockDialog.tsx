import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import type { Component, Page } from '@shared/types'
import { api, ApiError } from '@renderer/lib/api'
import { formatNumber } from '@renderer/lib/format'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from '@renderer/components/ui'

type StockType = 'in' | 'out' | 'adjust'

const TYPES: { key: StockType; label: string }[] = [
  { key: 'in', label: '入库' },
  { key: 'out', label: '出库' },
  { key: 'adjust', label: '盘点' }
]

export function StockDialog({
  open,
  onClose,
  component,
  defaultType = 'in'
}: {
  open: boolean
  onClose: () => void
  component: Component | null
  defaultType?: StockType
}) {
  const [type, setType] = useState<StockType>(defaultType)
  const [quantity, setQuantity] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [dateCode, setDateCode] = useState('')
  const [projectRef, setProjectRef] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: supplierPage } = useQuery({
    queryKey: ['suppliers', 'for-select'],
    queryFn: () => api.suppliers.list({ pageSize: 200 }),
    enabled: open
  })

  useEffect(() => {
    if (!open) return
    setType(defaultType)
    setQuantity('')
    setError(null)
    setNote('')
    setProjectRef('')
    setDateCode(component?.dateCode ?? '')
    setSupplierId(component?.supplierId ?? '')
  }, [open, defaultType, component])

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.movements.create(payload),
    onSuccess: (result) => {
      // 乐观更新：用最新库存立即刷新列表缓存对应项，避免等待重新拉取
      queryClient.setQueriesData<Page<Component>>({ queryKey: ['components'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === component.id ? { ...item, quantity: result.quantity } : item
          )
        }
      })
      // 同步更新详情缓存
      queryClient.setQueryData(['component-detail', component.id], (old: Component | undefined) =>
        old ? { ...old, quantity: result.quantity } : old
      )
      // 再 invalidate 触发完整拉取，保证流水/概览等最终一致
      void queryClient.invalidateQueries({ queryKey: ['components'] })
      void queryClient.invalidateQueries({ queryKey: ['component-detail'] })
      void queryClient.invalidateQueries({ queryKey: ['movements'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.push(`已更新，当前库存 ${formatNumber(result.quantity)}`)
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : '操作失败')
    }
  })

  if (!component) return null

  const parsed = Number(quantity || 0)
  const preview =
    type === 'in'
      ? component.quantity + parsed
      : type === 'out'
        ? component.quantity - parsed
        : parsed

  const submit = (): void => {
    setError(null)
    if (quantity === '' || Number.isNaN(parsed)) {
      setError('请填写数量')
      return
    }
    if (type !== 'adjust' && parsed <= 0) {
      setError('数量必须大于 0')
      return
    }
    mutation.mutate({
      componentId: component.id,
      type,
      quantity: parsed,
      supplierId: supplierId || null,
      dateCode: dateCode || null,
      projectRef: projectRef || null,
      note: note || null,
      operator: 'local'
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${type === 'in' ? '入库' : type === 'out' ? '出库' : '盘点'} · ${component.partNumber}`}
      subtitle={`当前库存 ${formatNumber(component.quantity)} ${component.unit}`}
      width={520}
      footer={
        <>
          {error ? <span className="mr-auto text-[12px] text-danger">{error}</span> : null}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? '提交中…' : '确认'}
          </Button>
        </>
      }
    >
      <div className="mb-4 inline-flex rounded-ctl p-0.5" style={{ background: 'var(--bg-sunken)' }}>
        {TYPES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setType(item.key)
              setQuantity('')
              setError(null)
            }}
            className={clsx(
              'h-7 rounded-[6px] px-3.5 text-[12.5px] transition-colors duration-fast',
              type === item.key ? 'bg-surface font-medium text-t1' : 'text-t2 hover:text-t1'
            )}
            style={type === item.key ? { boxShadow: '0 1px 2px rgba(20,20,19,0.08)' } : undefined}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label={type === 'adjust' ? '盘点后数量' : '数量'}>
          <Input
            autoFocus
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="0"
            className="num"
          />
        </Field>
        <Field label="操作后库存">
          <div className="field num flex items-center text-t2">
            {preview >= 0 ? formatNumber(preview) : '不足'} {component.unit}
          </div>
        </Field>

        {type === 'in' ? (
          <>
            <Field label="供应商">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">未指定</option>
                {(supplierPage?.items ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="批次号">
              <Input value={dateCode} onChange={(e) => setDateCode(e.target.value)} placeholder="2432" />
            </Field>
          </>
        ) : (
          <Field label={type === 'out' ? '用途 / 领用人' : '盘点原因'} className="col-span-2">
            <Input
              value={projectRef}
              onChange={(e) => setProjectRef(e.target.value)}
              placeholder={type === 'out' ? '智能车项目 · 王工' : '月末盘点'}
            />
          </Field>
        )}

        <Field label="备注" className="col-span-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
