export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('zh-CN')
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (value === 0) return '0.00'
  if (value < 0.01) return value.toFixed(4)
  if (value < 1) return value.toFixed(3)
  return value.toFixed(2)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

export function isLowStock(quantity: number, safetyStock: number): boolean {
  return safetyStock > 0 && quantity <= safetyStock
}

export function dash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed || '—'
}
