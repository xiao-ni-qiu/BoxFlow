import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Check, ChevronDown, Plus, X } from 'lucide-react'

export function Button({
  children,
  variant = 'ghost',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' }) {
  return (
    <button
      type="button"
      className={clsx('btn', variant === 'primary' && 'btn-primary', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  children,
  className,
  label,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-7 w-7 items-center justify-center rounded-ctl text-t2 transition-colors duration-fast hover:bg-sunken hover:text-t1 disabled:opacity-40',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('field', props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('field resize-none', props.className)} />
}

/* ---------------------------------- 下拉 ---------------------------------- */
/* 原生 <select> 的展开面板由操作系统绘制，无法跟随主题配色，因此在渲染层自绘。 */

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
}

export interface ComboboxOption {
  value: string
  label: string
  hint?: string
}

/** 保持与原生 select 相同的取值方式：onChange(e => e.target.value) */
type DropdownChangeEvent = {
  target: { value: string }
  currentTarget: { value: string }
}

interface PopoverPos {
  left: number
  width: number
  top?: number
  bottom?: number
  maxH: number
}

const PANEL_CLASS =
  'fixed z-[70] overflow-auto rounded-[10px] border border-hair bg-surface p-1 shadow-[0_18px_44px_-18px_rgba(20,20,19,0.32),0_2px_6px_-2px_rgba(20,20,19,0.1)]'

function collectOptions(children: ReactNode): DropdownOption[] {
  const out: DropdownOption[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === Fragment) {
      out.push(...collectOptions((child.props as { children?: ReactNode }).children))
      return
    }
    if (child.type !== 'option') return
    const props = child.props as {
      value?: string | number
      children?: ReactNode
      disabled?: boolean
    }
    const text = Children.toArray(props.children)
      .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      .join('')
    const value = props.value === undefined ? text : String(props.value)
    out.push({ value, label: text || value, disabled: props.disabled })
  })
  return out
}

/**
 * 计算弹层位置：空间不足时向上展开，并约束最大高度。
 * 用 fixed 定位 + portal 渲染，避免被 Modal 的滚动容器裁切。
 */
function usePopover(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  maxHeight = 296
): PopoverPos | null {
  const [pos, setPos] = useState<PopoverPos | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const up = below < 190 && above > below
    const maxH = Math.max(132, Math.min(maxHeight, (up ? above : below) - 4))
    setPos(
      up
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6, maxH }
        : { left: rect.left, width: rect.width, top: rect.bottom + 6, maxH }
    )
  }, [open, anchorRef, maxHeight])

  // 页面滚动或窗口缩放时关闭，避免弹层与触发器脱位（弹层内部滚动不算）
  useEffect(() => {
    if (!open) return undefined
    const onShift = (event: Event): void => {
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('resize', onShift)
    window.addEventListener('scroll', onShift, true)
    return () => {
      window.removeEventListener('resize', onShift)
      window.removeEventListener('scroll', onShift, true)
    }
  }, [open, onClose, panelRef])

  return pos
}

function useOutsideClose(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (anchorRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open, onClose, anchorRef, panelRef])
}

export function Select({
  value,
  onChange,
  children,
  className,
  disabled,
  placeholder = '请选择',
  ...rest
}: {
  value?: string | number
  onChange?: (event: DropdownChangeEvent) => void
  children?: ReactNode
  className?: string
  disabled?: boolean
  placeholder?: string
  name?: string
  id?: string
  title?: string
  style?: React.CSSProperties
}) {
  const options = useMemo(() => collectOptions(children), [children])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const currentValue = value === undefined || value === null ? '' : String(value)
  const current = options.find((option) => option.value === currentValue)

  const close = useCallback(() => setOpen(false), [])
  const pos = usePopover(open, anchorRef, panelRef, close)
  useOutsideClose(open, anchorRef, panelRef, close)

  const choose = (option: DropdownOption): void => {
    if (option.disabled) return
    onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } })
    setOpen(false)
    anchorRef.current?.focus()
  }

  const reveal = (): void => {
    const index = options.findIndex((option) => option.value === currentValue)
    setActive(index >= 0 ? index : options.findIndex((option) => !option.disabled))
    setOpen(true)
  }

  const move = (step: number): void => {
    if (options.length === 0) return
    let next = active
    for (let i = 0; i < options.length; i += 1) {
      next = (next + step + options.length) % options.length
      if (!options[next].disabled) break
    }
    setActive(next)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        reveal()
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (options[active]) choose(options[active])
      return
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          'field flex cursor-pointer items-center gap-2 text-left',
          open && 'is-open',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
        onClick={() => (open ? setOpen(false) : reveal())}
        onKeyDown={onKeyDown}
        {...rest}
      >
        <span className={clsx('min-w-0 flex-1 truncate', current ? 'text-t1' : 'text-t3')}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={1.9}
          className={clsx(
            'shrink-0 transition-transform duration-fast',
            open ? 'rotate-180 text-accent' : 'text-t3'
          )}
        />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              className={PANEL_CLASS}
              style={{
                left: pos.left,
                width: pos.width,
                top: pos.top,
                bottom: pos.bottom,
                maxHeight: pos.maxH
              }}
            >
              {options.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-t3">暂无可选项</p>
              ) : (
                options.map((option, index) => {
                  const selected = option.value === currentValue
                  return (
                    <button
                      key={`${option.value}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(option)}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-[6px] px-2.5 py-[6px] text-left text-[12.5px] transition-colors duration-fast',
                        selected
                          ? 'bg-accent-soft text-accent'
                          : index === active
                            ? 'bg-sunken text-t1'
                            : 'text-t2',
                        option.disabled && 'opacity-40'
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {selected ? <Check size={12} strokeWidth={2.2} className="shrink-0" /> : null}
                    </button>
                  )
                })
              )}
            </div>,
            document.body
          )
        : null}
    </>
  )
}

/**
 * 可输入的下拉框：既能从已有选项里挑，也能直接敲一个新值。
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  allowCreate = false,
  createHint = '保存时自动新建',
  emptyText = '没有匹配的项'
}: {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  allowCreate?: boolean
  createHint?: string
  emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const keyword = (draft ?? '').trim()
  const lower = keyword.toLowerCase()

  const matched = useMemo(() => {
    if (!lower) return options
    return options.filter(
      (option) =>
        option.value.toLowerCase().includes(lower) ||
        option.label.toLowerCase().includes(lower) ||
        (option.hint ?? '').toLowerCase().includes(lower)
    )
  }, [options, lower])

  const visible = matched.slice(0, 80)
  const canCreate =
    allowCreate && keyword !== '' && !options.some((option) => option.value.toLowerCase() === lower)

  const rows: (ComboboxOption & { create?: boolean })[] = canCreate
    ? [...visible, { value: keyword, label: keyword, hint: createHint, create: true }]
    : visible

  const close = useCallback(() => {
    setOpen(false)
    setDraft(null)
  }, [])
  const pos = usePopover(open, anchorRef, panelRef, close)
  useOutsideClose(open, anchorRef, panelRef, close)

  const choose = (next: string): void => {
    onChange(next)
    setOpen(false)
    setDraft(null)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      setActive((prev) => Math.min(prev + 1, Math.max(rows.length - 1, 0)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((prev) => Math.max(prev - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      if (!open) return
      event.preventDefault()
      const row = rows[active]
      if (row) choose(row.value)
      return
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={anchorRef} className={clsx('relative', className)}>
      <input
        ref={inputRef}
        className={clsx('field mono pr-8', open && 'is-open', disabled && 'opacity-50')}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value)
          setDraft(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => {
          setDraft(null)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown
        size={13}
        strokeWidth={1.9}
        className={clsx(
          'pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 transition-transform duration-fast',
          open ? 'rotate-180 text-accent' : 'text-t3'
        )}
      />
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              className={PANEL_CLASS}
              style={{
                left: pos.left,
                width: Math.max(pos.width, 200),
                top: pos.top,
                bottom: pos.bottom,
                maxHeight: pos.maxH
              }}
            >
              {rows.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-t3">{emptyText}</p>
              ) : (
                rows.map((row, index) => {
                  const selected = !row.create && row.value === value
                  return (
                    <button
                      key={`${row.value}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(row.value)}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-[6px] px-2.5 py-[6px] text-left text-[12.5px] transition-colors duration-fast',
                        selected
                          ? 'bg-accent-soft text-accent'
                          : index === active
                            ? 'bg-sunken text-t1'
                            : 'text-t2',
                        row.create && 'text-t2'
                      )}
                    >
                      {row.create ? (
                        <Plus size={12} strokeWidth={2} className="shrink-0 text-accent" />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      {row.hint ? (
                        <span className="shrink-0 text-[11px] text-t3">{row.hint}</span>
                      ) : null}
                      {selected ? <Check size={12} strokeWidth={2.2} className="shrink-0" /> : null}
                    </button>
                  )
                })
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[12px] text-t2">{label}</span>
        {hint ? <span className="text-[11px] text-t3">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

export function Switch({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-[19px] w-[33px] shrink-0 rounded-full transition-colors duration-fast',
        disabled && 'opacity-40'
      )}
      style={{ background: checked ? 'var(--accent)' : 'var(--hair-strong)' }}
    >
      <span
        className="absolute top-[2px] h-[15px] w-[15px] rounded-full bg-white transition-[left] duration-fast"
        style={{ left: checked ? 16 : 2 }}
      />
    </button>
  )
}

export function Dot({ tone = 'warn' }: { tone?: 'warn' | 'accent' | 'muted' }) {  const color = tone === 'warn' ? 'bg-warn' : tone === 'accent' ? 'bg-accent' : 'bg-t3'
  return <span className={clsx('inline-block h-1 w-1 rounded-full', color)} />
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-[14px] font-medium text-t1">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-[12.5px] text-t2">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto px-6 py-10">
      <div
        className="fixed inset-0 bg-[rgba(20,20,19,0.22)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative flex w-full animate-fade-up flex-col rounded-card border border-hair bg-surface shadow-[0_18px_60px_-24px_rgba(20,20,19,0.35)]"
        style={{ maxWidth: width, maxHeight: '86vh' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start px-6 pt-5">
          <div>
            <h2 className="text-[15px] font-medium text-t1">{title}</h2>
            {subtitle ? <p className="mt-1 text-[12px] text-t2">{subtitle}</p> : null}
          </div>
          <IconButton label="关闭" className="ml-auto" onClick={onClose}>
            <X size={15} strokeWidth={1.6} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hair px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function Drawer({
  open,
  onClose,
  children,
  width = 480
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-[rgba(20,20,19,0.16)]" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute right-0 top-0 flex h-full animate-slide-in flex-col border-l border-hair bg-surface"
        style={{ width }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  )
}

interface ToastItem {
  id: number
  message: string
  tone: 'default' | 'error'
}

interface ToastContextValue {
  push: (message: string, tone?: 'default' | 'error') => void
}

const ToastContext = createContext<ToastContextValue>({ push: () => undefined })

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, tone: 'default' | 'error' = 'default') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id))
    }, tone === 'error' ? 4200 : 2400)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={clsx(
              'animate-fade-up rounded-ctl border px-3.5 py-2 text-[12.5px] shadow-[0_8px_28px_-14px_rgba(20,20,19,0.4)]',
              item.tone === 'error'
                ? 'border-hair-strong bg-surface text-danger'
                : 'border-hair bg-surface text-t1'
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
