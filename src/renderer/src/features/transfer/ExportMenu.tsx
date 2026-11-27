import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { api, ApiError } from '@renderer/lib/api'
import { Button, useToast } from '@renderer/components/ui'
import { ENTITY_LABELS, type TransferEntity } from '@shared/transfer'
import { KIND_META, type ItemKind } from '@shared/constants'

/**
 * 导出按钮 + 轻量格式选择浮层。
 * 三个列表页共用，避免每处都写一遍下拉逻辑。
 */
export function ExportMenu({
  entity,
  label = '导出',
  kind
}: {
  entity: TransferEntity
  label?: string
  kind?: ItemKind
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const scopeLabel = kind ? KIND_META[kind].label : ENTITY_LABELS[entity]

  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = async (format: 'xlsx' | 'csv'): Promise<void> => {
    setOpen(false)
    setBusy(true)
    try {
      const result = await api.transfer.export(entity, format, kind)
      if (result) {
        const name = result.path.split(/[\\/]/).pop() ?? result.path
        toast.push(`已导出 ${result.rows} 条到 ${name}`)
      }
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : '导出失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((v) => !v)} disabled={busy}>
        <Download size={13} strokeWidth={1.7} />
        {busy ? '导出中…' : label}
      </Button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-[186px] overflow-hidden rounded-ctl py-1"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--hair-strong)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)'
          }}
        >
          <p className="px-2.5 py-1 text-[11px] text-t3">
            导出{scopeLabel}
          </p>
          {[
            { format: 'xlsx' as const, label: 'Excel 工作簿（.xlsx）', Icon: FileSpreadsheet },
            { format: 'csv' as const, label: 'CSV 文件（.csv）', Icon: FileText }
          ].map((item) => (
            <button
              key={item.format}
              type="button"
              onClick={() => void run(item.format)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-t1 transition-colors duration-fast hover:bg-[var(--accent-soft)]"
            >
              <item.Icon size={13} strokeWidth={1.6} className="text-t3" />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
