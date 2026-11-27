import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { api, ApiError } from '@renderer/lib/api'
import { Button, Modal, useToast } from '@renderer/components/ui'
import {
  ENTITY_COLUMNS,
  ENTITY_LABELS,
  type DuplicateStrategy,
  type ImportPreview,
  type ImportResult
} from '@shared/transfer'
import { KIND_META, type ItemKind } from '@shared/constants'

type Entity = 'components' | 'suppliers'

const STRATEGIES: { key: DuplicateStrategy; label: string; hint: string }[] = [
  { key: 'skip', label: '跳过重复', hint: '库里已有的不动' },
  { key: 'merge', label: '累加数量', hint: '把导入数量加到现有库存' },
  { key: 'overwrite', label: '覆盖更新', hint: '以文件内容为准' }
]

const ACTION_META: Record<string, { label: string; color: string }> = {
  create: { label: '新增', color: 'var(--ok)' },
  update: { label: '更新', color: 'var(--accent)' },
  skip: { label: '跳过', color: 'var(--text-3)' },
  error: { label: '错误', color: 'var(--danger)' }
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function ImportWizard({
  open,
  onClose,
  entity,
  kind
}: {
  open: boolean
  onClose: () => void
  entity: Entity
  kind?: ItemKind
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip')
  const [dirty, setDirty] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [showMapping, setShowMapping] = useState(false)

  const toast = useToast()
  const queryClient = useQueryClient()

  const columns = ENTITY_COLUMNS[entity]
  const label = kind ? KIND_META[kind].label : ENTITY_LABELS[entity]

  const reset = (): void => {
    setStep(1)
    setFilePath(null)
    setToken(null)
    setPreview(null)
    setMapping({})
    setStrategy('skip')
    setDirty(false)
    setResult(null)
    setShowMapping(false)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const loadPreview = useMutation({
    mutationFn: async (nextStrategy: DuplicateStrategy) => {
      if (!token) throw new ApiError('NO_TOKEN', '请先选择文件')
      return api.transfer.remap(token, entity, mapping, nextStrategy, kind)
    },
    onSuccess: (next) => {
      setPreview(next)
      setDirty(false)
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '校验失败', 'error')
  })

  const pickFile = useMutation({
    mutationFn: async () => {
      const picked = await api.transfer.pickFile()
      if (!picked) return null
      const data = await api.transfer.preview(entity, picked, kind)
      return { picked, data }
    },
    onSuccess: (payload) => {
      if (!payload) return
      setFilePath(payload.picked)
      setToken(payload.data.token)
      setPreview(payload.data.preview)
      setMapping(payload.data.preview.mapping)
      setStep(2)
      setDirty(false)
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '读取文件失败', 'error')
  })

  const run = useMutation({
    mutationFn: async () => {
      if (!preview) throw new ApiError('NO_PREVIEW', '请先选择文件')
      return api.transfer.run(entity, preview, strategy)
    },
    onSuccess: (payload) => {
      setResult(payload)
      setStep(3)
      for (const key of ['components', 'suppliers', 'overview', 'facets', 'locations', 'movements']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '导入失败', 'error')
  })

  const usedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const key of Object.values(mapping)) if (key) set.add(key)
    return set
  }, [mapping])

  const changeStrategy = (next: DuplicateStrategy): void => {
    setStrategy(next)
    if (token) {
      // 策略会改变每行的处理动作，需要重新判定
      loadPreview.mutate(next)
    }
  }

  const changeMapping = (header: string, key: string): void => {
    setMapping((prev) => {
      const next = { ...prev }
      if (!key) delete next[header]
      else next[header] = key
      return next
    })
    setDirty(true)
  }

  /* ------------------------------ 结果页 ------------------------------ */

  if (step === 3 && result) {
    const total = result.created + result.updated + result.skipped + result.failed.length
    return (
      <Modal
        open={open}
        onClose={close}
        title="导入完成"
        subtitle={`${label} · 共处理 ${total} 行`}
        width={560}
        footer={<Button variant="primary" onClick={close}>完成</Button>}
      >
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '新增', value: result.created, color: 'var(--ok)' },
            { label: '更新', value: result.updated, color: 'var(--accent)' },
            { label: '跳过', value: result.skipped, color: 'var(--text-3)' },
            { label: '失败', value: result.failed.length, color: 'var(--danger)' }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-ctl px-3 py-2.5"
              style={{ background: 'var(--bg-sunken)' }}
            >
              <p className="num text-[19px]" style={{ color: item.color }}>
                {item.value}
              </p>
              <p className="mt-0.5 text-[11.5px] text-t3">{item.label}</p>
            </div>
          ))}
        </div>

        {result.failed.length ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[12px] text-t2">失败明细</p>
            <div
              className="max-h-[220px] overflow-auto rounded-ctl"
              style={{ border: '1px solid var(--hair)' }}
            >
              {result.failed.map((item) => (
                <div
                  key={item.row}
                  className="flex gap-3 px-3 py-1.5 text-[11.5px]"
                  style={{ borderTop: '1px solid var(--hair)' }}
                >
                  <span className="mono shrink-0 text-t3">第 {item.row} 行</span>
                  <span className="text-t2">{item.message}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11.5px] text-t3">全部数据处理成功。</p>
        )}
      </Modal>
    )
  }

  /* ------------------------------ 预览页 ------------------------------ */

  if (step === 2 && preview) {
    const previewColumns =
      entity === 'components'
        ? [
            { key: 'partNumber', label: '型号', width: '26%' },
            { key: 'manufacturer', label: '厂商', width: '16%' },
            { key: 'quantity', label: '数量', width: '12%' },
            { key: 'locationCode', label: '位置', width: '16%' }
          ]
        : [
            { key: 'name', label: '供应商名称', width: '30%' },
            { key: 'contactName', label: '联系人', width: '18%' },
            { key: 'phone', label: '电话', width: '22%' },
            { key: 'paymentTerms', label: '账期', width: '14%' }
          ]

    const shown = preview.rows.slice(0, 50)

    return (
      <Modal
        open={open}
        onClose={close}
        title={`导入${label}`}
        subtitle={fileNameOf(filePath ?? '')}
        width={880}
        footer={
          <>
            <Button onClick={() => setStep(1)}>
              <RotateCcw size={13} strokeWidth={1.6} />
              重选文件
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11.5px] text-t3">
                新增 {preview.summary.create} · 更新 {preview.summary.update} · 跳过{' '}
                {preview.summary.skip} · 错误 {preview.summary.error}
              </span>
              <Button
                variant="primary"
                onClick={() => run.mutate()}
                disabled={run.isPending || preview.summary.error === preview.summary.total}
              >
                {run.isPending ? '导入中…' : '开始导入'}
              </Button>
            </div>
          </>
        }
      >
        {/* 重复策略 */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[12px] text-t2">遇到已存在的</span>
          <div className="flex items-center gap-1">
            {STRATEGIES.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.hint}
                onClick={() => changeStrategy(item.key)}
                disabled={loadPreview.isPending}
                className={clsx(
                  'rounded-ctl px-2.5 py-1 text-[11.5px] transition-colors duration-fast',
                  strategy === item.key ? 'text-t1' : 'text-t3 hover:text-t2'
                )}
                style={{
                  background: strategy === item.key ? 'var(--accent-soft)' : 'transparent',
                  fontWeight: strategy === item.key ? 500 : 400
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="ml-2 text-[11.5px] text-t3">
            {STRATEGIES.find((s) => s.key === strategy)?.hint}
          </span>
        </div>

        {/* 字段映射 */}
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--hair)' }}>
          <button
            type="button"
            onClick={() => setShowMapping((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <p className="text-[12px] text-t1">字段映射</p>
            <span className="text-[11.5px] text-t3">
              已识别 {Object.keys(mapping).length} / {preview.headers.filter(Boolean).length} 列
            </span>
            {preview.unmapped.filter(Boolean).length ? (
              <span className="text-[11.5px]" style={{ color: 'var(--warn)' }}>
                {preview.unmapped.filter(Boolean).length} 列未识别
              </span>
            ) : null}
            <span className="ml-auto text-[11.5px] text-t3">{showMapping ? '收起' : '展开'}</span>
          </button>

          {showMapping ? (
            <div className="mt-2 max-h-[190px] overflow-auto rounded-ctl" style={{ border: '1px solid var(--hair)' }}>
              {preview.headers.filter(Boolean).map((header) => {
                const current = mapping[header] ?? ''
                return (
                  <div
                    key={header}
                    className="flex items-center gap-3 px-2.5 py-1.5"
                    style={{ borderTop: '1px solid var(--hair)' }}
                  >
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-t2">{header}</span>
                    <span className="text-[11px] text-t3">→</span>
                    <select
                      value={current}
                      onChange={(e) => changeMapping(header, e.target.value)}
                      className="field h-[26px] w-[150px] shrink-0 px-2 text-[11.5px]"
                    >
                      <option value="">忽略此列</option>
                      {columns.map((col) => (
                        <option
                          key={col.key}
                          value={col.key}
                          disabled={col.key !== current && usedKeys.has(col.key)}
                        >
                          {col.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          ) : null}

          {dirty ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11.5px]" style={{ color: 'var(--warn)' }}>
                映射已修改，需重新校验
              </span>
              <Button onClick={() => loadPreview.mutate(strategy)} disabled={loadPreview.isPending}>
                {loadPreview.isPending ? '校验中…' : '重新校验'}
              </Button>
            </div>
          ) : null}
        </div>

        {/* 预览表 */}
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--hair)' }}>
          <div className="max-h-[260px] overflow-auto rounded-ctl" style={{ border: '1px solid var(--hair)' }}>
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: 46 }} />
                {previewColumns.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr
                  className="sticky top-0 z-10 text-[11px] text-t3"
                  style={{ background: 'var(--bg-sunken)' }}
                >
                  <th className="px-2 py-1.5 text-left font-normal">行</th>
                  {previewColumns.map((c) => (
                    <th key={c.key} className="px-2 py-1.5 text-left font-normal">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-left font-normal">状态</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const meta = ACTION_META[row.action]
                  return (
                    <tr key={row.row} style={{ borderTop: '1px solid var(--hair)' }}>
                      <td className="mono px-2 py-1.5 text-[11px] text-t3">{row.row}</td>
                      {previewColumns.map((c) => (
                        <td key={c.key} className="truncate px-2 py-1.5 text-[11.5px] text-t1">
                          {row.values[c.key] === null || row.values[c.key] === undefined
                            ? '—'
                            : String(row.values[c.key])}
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: meta.color }}>
                          <span
                            className="inline-block h-[5px] w-[5px] rounded-full"
                            style={{ background: meta.color }}
                          />
                          {row.action === 'error' ? (
                            <span className="truncate" title={row.errors.join('；')}>
                              {row.errors[0] ?? '错误'}
                            </span>
                          ) : (
                            meta.label
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {preview.rows.length > shown.length ? (
            <p className="mt-1.5 text-[11.5px] text-t3">
              仅预览前 {shown.length} 行，导入时会处理全部 {preview.rows.length} 行
            </p>
          ) : null}
        </div>
      </Modal>
    )
  }

  /* ------------------------------ 选文件 ------------------------------ */

  return (
    <Modal
      open={open}
      onClose={close}
      title={`导入${label}`}
      subtitle="支持 Excel（.xlsx）与 CSV，第一行需是表头"
      width={560}
      footer={
        <>
          <Button
            onClick={async () => {
              const saved = await api.transfer.template(entity, 'xlsx')
              if (saved) toast.push('模板已保存')
            }}
          >
            下载模板
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={close}>取消</Button>
            <Button variant="primary" onClick={() => pickFile.mutate()} disabled={pickFile.isPending}>
              <Upload size={13} strokeWidth={1.7} />
              {pickFile.isPending ? '读取中…' : '选择文件'}
            </Button>
          </div>
        </>
      }
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!pickFile.isPending) pickFile.mutate()
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !pickFile.isPending) pickFile.mutate()
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-card px-6 py-12 text-center transition-colors duration-fast"
        style={{ background: 'var(--bg-sunken)' }}
      >
        <FileSpreadsheet size={28} strokeWidth={1.4} className="text-t3" />
        <p className="mt-3 text-[13px] text-t1">
          {pickFile.isPending ? '正在读取文件…' : '点击这里选择文件'}
        </p>
        <p className="mt-1 max-w-[330px] text-[11.5px] leading-relaxed text-t3">
          支持 Excel（.xlsx）与 CSV。表头会自动识别，中英文写法都能认，识别不了可以在下一步手动指定。
        </p>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-t3">
        没有现成表格？先下载模板，按表头填写后再导入。库位编码不必预先维护，导入时会自动建档。
      </p>
    </Modal>
  )
}
