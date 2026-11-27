import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KIND_META, KIND_OPTIONS, type ItemKind } from '@shared/constants'
import type { Component } from '@shared/types'
import { api, ApiError, type LocationNode } from '@renderer/lib/api'
import {
  Button,
  Combobox,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
  type ComboboxOption
} from '@renderer/components/ui'

import { ComponentImage } from './ComponentImage'

interface FormState {
  kind: ItemKind
  partNumber: string
  manufacturer: string
  category: string
  package: string
  description: string
  dateCode: string
  packaging: string
  quantity: string
  unit: string
  safetyStock: string
  unitPrice: string
  moq: string
  msl: string
  rohs: boolean
  locationCode: string
  supplierId: string
  tags: string
  note: string
  imageUrl: string
}

function emptyState(kind: ItemKind): FormState {
  return {
    kind,
    partNumber: '',
    manufacturer: '',
    category: '',
    package: '',
    description: '',
    dateCode: '',
    packaging: '',
    quantity: '0',
    unit: KIND_META[kind].defaultUnit,
    safetyStock: '0',
    unitPrice: '',
    moq: '',
    msl: '',
    rohs: true,
    locationCode: '',
    supplierId: '',
    tags: '',
    note: '',
    imageUrl: ''
  }
}

function toState(component: Component): FormState {
  return {
    kind: component.kind,
    partNumber: component.partNumber,
    manufacturer: component.manufacturer ?? '',
    category: component.category ?? '',
    package: component.package ?? '',
    description: component.description ?? '',
    dateCode: component.dateCode ?? '',
    packaging: component.packaging ?? '',
    quantity: String(component.quantity),
    unit: component.unit,
    safetyStock: String(component.safetyStock),
    unitPrice: component.unitPrice === null ? '' : String(component.unitPrice),
    moq: component.moq === null ? '' : String(component.moq),
    msl: component.msl === null ? '' : String(component.msl),
    rohs: Boolean(component.rohs),
    locationCode: component.locationFullCode ?? '',
    supplierId: component.supplierId ?? '',
    tags: component.tags ?? '',
    note: component.note ?? '',
    imageUrl: component.imageUrl ?? ''
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 mt-6 text-[12px] font-medium text-t2 first:mt-0">
      {children}
    </p>
  )
}

/** 位置树按层级拍平，下拉里保留层级缩进，仍然只提交 fullCode */
function flattenLocations(nodes: LocationNode[], depth = 0): ComboboxOption[] {
  return nodes.flatMap((node) => [
    {
      value: node.fullCode,
      label: `${'\u00a0'.repeat(depth * 3)}${node.fullCode}${node.name ? ` · ${node.name}` : ''}`
    },
    ...flattenLocations(node.children, depth + 1)
  ])
}

export function ComponentForm({
  open,
  onClose,
  editing,
  defaultKind = 'component'
}: {
  open: boolean
  onClose: () => void
  editing?: Component | null
  defaultKind?: ItemKind
}) {
  const [form, setForm] = useState<FormState>(() => emptyState(defaultKind))
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: supplierPage } = useQuery({
    queryKey: ['suppliers', 'for-select'],
    queryFn: () => api.suppliers.list({ pageSize: 200 }),
    enabled: open
  })

  const { data: locationTree } = useQuery({
    queryKey: ['locations', 'tree'],
    queryFn: () => api.locations.tree(),
    enabled: open
  })

  const locationOptions = useMemo(
    () => flattenLocations(locationTree ?? []),
    [locationTree]
  )

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(editing ? toState(editing) : emptyState(defaultKind))
  }, [open, editing, defaultKind])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** 切换大类时，分类与单位跟着换一套，已经填过但不适用的就清掉 */
  const changeKind = (kind: ItemKind): void => {
    setForm((prev) => ({
      ...prev,
      kind,
      category: KIND_META[kind].categories.includes(prev.category) ? prev.category : '',
      unit: KIND_META[kind].units.includes(prev.unit) ? prev.unit : KIND_META[kind].defaultUnit
    }))
  }

  const meta = KIND_META[form.kind]
  const showSpecFields = form.kind === 'component' || form.kind === 'board' || form.kind === 'module'
  const unitOptions = meta.units.includes(form.unit)
    ? meta.units
    : [form.unit, ...meta.units].filter(Boolean)

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editing) return api.components.update(editing.id, payload)
      return api.components.create(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['components'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
      toast.push(editing ? '已保存修改' : '已新增物料')
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : '保存失败')
    }
  })

  const suppliers = supplierPage?.items ?? []

  const submit = (): void => {
    setError(null)
    if (!form.partNumber.trim()) {
      setError(`${meta.specLabel}不能为空`)
      return
    }
    const payload: Record<string, unknown> = {
      kind: form.kind,
      partNumber: form.partNumber.trim(),
      manufacturer: form.manufacturer.trim(),
      category: form.category || null,
      package: form.package.trim() || null,
      description: form.description.trim() || null,
      dateCode: form.dateCode.trim() || null,
      packaging: form.packaging || null,
      unit: form.unit || '个',
      safetyStock: Number(form.safetyStock || 0),
      unitPrice: form.unitPrice === '' ? null : Number(form.unitPrice),
      moq: form.moq === '' ? null : Number(form.moq),
      msl: form.msl === '' ? null : Number(form.msl),
      rohs: form.rohs,
      locationCode: form.locationCode.trim() || null,
      supplierId: form.supplierId || null,
      tags: form.tags.trim() || null,
      note: form.note.trim() || null,
      imageUrl: form.imageUrl.trim() || null
    }
    if (!editing) {
      payload.quantity = Number(form.quantity || 0)
    }
    mutation.mutate(payload)
  }

  const rohsLabel = useMemo(() => (form.rohs ? '符合 RoHS' : '不适用'), [form.rohs])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `编辑${meta.noun}` : `新增${meta.noun}`}
      subtitle={
        editing
          ? `${editing.partNumber} · 数量请通过出入库调整`
          : `${meta.specLabel} + ${meta.makerLabel} 唯一，重复会被拦下`
      }
      width={720}
      footer={
        <>
          {error ? <span className="mr-auto text-[12px] text-danger">{error}</span> : null}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <SectionTitle>基本信息</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="大类" hint="决定出现在哪个页面">
          <Select
            value={form.kind}
            onChange={(e) => changeKind(e.target.value as ItemKind)}
          >
            {KIND_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={meta.specLabel} hint="必填">
          <Input
            autoFocus
            value={form.partNumber}
            onChange={(e) => set('partNumber', e.target.value)}
            placeholder={meta.specPlaceholder}
          />
        </Field>
        <Field label={meta.makerLabel}>
          <Input
            value={form.manufacturer}
            onChange={(e) => set('manufacturer', e.target.value)}
            placeholder={meta.makerPlaceholder}
          />
        </Field>
        <Field label="分类">
          <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">未分类</option>
            {meta.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={meta.packageLabel}>
          <Input
            value={form.package}
            onChange={(e) => set('package', e.target.value)}
            placeholder={meta.packagePlaceholder}
          />
        </Field>
        <Field label="描述">
          <Input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={meta.descriptionPlaceholder}
          />
        </Field>
        <Field
          label="照片链接"
          hint="填 http(s) 图片地址，点开详情时显示缩略图；留空就不显示"
          className="col-span-2"
        >
          <div className="flex items-center gap-2.5">
            <Input
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              placeholder="https://example.com/stm32f103.jpg"
              spellCheck={false}
              className="mono min-w-0 flex-1"
            />
            <ComponentImage
              url={form.imageUrl.trim() || null}
              alt="照片预览"
              className="h-8 w-8 shrink-0"
            />
          </div>
        </Field>
      </div>

      <SectionTitle>库存与位置</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {!editing ? (
          <Field label="初始库存">
            <Input
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
            />
          </Field>
        ) : (
          <Field label="当前库存" hint="只能通过出入库变更">
            <Input value={String(editing.quantity)} readOnly className="opacity-60" />
          </Field>
        )}
        <Field label="单位">
          <Select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="安全库存" hint="低于该值触发预警">
          <Input
            value={form.safetyStock}
            onChange={(e) => set('safetyStock', e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
          />
        </Field>
        <Field
          label="存放位置"
          hint={locationOptions.length > 0 ? '可选已有位置，也可直接输入新编码' : '输入编码，保存时自动建档'}
        >
          <Combobox
            value={form.locationCode}
            onChange={(next) => set('locationCode', next)}
            options={locationOptions}
            allowCreate
            createHint="保存时自动建档"
            emptyText="没有匹配的位置，直接输入即可新建"
            placeholder="选择或输入，如 A-02-03"
          />
        </Field>
      </div>

      <SectionTitle>采购与规格</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="主供应商">
          <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">未指定</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="参考单价" hint="元">
          <Input
            value={form.unitPrice}
            onChange={(e) => set('unitPrice', e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>
        <Field label="最小起订量 MOQ">
          <Input
            value={form.moq}
            onChange={(e) => set('moq', e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
          />
        </Field>
        <Field label="包装形式">
          <Select value={form.packaging} onChange={(e) => set('packaging', e.target.value)}>
            <option value="">未指定</option>
            {meta.packagings.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="批次号 / Date Code">
          <Input
            value={form.dateCode}
            onChange={(e) => set('dateCode', e.target.value)}
            placeholder="2432"
          />
        </Field>
        {showSpecFields ? (
          <Field label="湿敏等级 MSL" hint="1-6，选填">
            <Input
              value={form.msl}
              onChange={(e) => set('msl', e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="3"
            />
          </Field>
        ) : null}
      </div>

      <SectionTitle>其他</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="标签" hint="逗号分隔">
          <Input
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="常用,原厂"
          />
        </Field>
        {showSpecFields ? (
          <div className="flex items-end pb-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-t2">
              <input
                type="checkbox"
                checked={form.rohs}
                onChange={(e) => set('rohs', e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              {rohsLabel}
            </label>
          </div>
        ) : null}
        <Field label="备注" className="col-span-2">
          <Textarea
            rows={2}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder={
              meta.key === 'hardware'
                ? '适配的螺纹、替代规格…'
                : meta.key === 'consumable'
                  ? '开封日期、存放要求…'
                  : '替代型号、注意事项…'
            }
          />
        </Field>
      </div>
    </Modal>
  )
}
