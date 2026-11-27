import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

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

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx('field cursor-pointer', props.className)} />
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

export function Dot({ tone = 'warn' }: { tone?: 'warn' | 'accent' | 'muted' }) {
  const color = tone === 'warn' ? 'bg-warn' : tone === 'accent' ? 'bg-accent' : 'bg-t3'
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
