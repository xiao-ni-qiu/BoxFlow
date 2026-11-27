import { useEffect, useRef, useState } from 'react'

export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** 是否是需要聚焦搜索框的组合键：Windows / Linux 用 Ctrl+F，macOS 用 ⌘F */
export function isSearchHotkey(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f'
}

/**
 * 跨页面请求聚焦：概览等没有搜索框的页面按下 Ctrl+F 时，
 * 先切到物料页，再由目标页 mount 后自行消费这个标记。
 */
let pendingSearchFocus = false

export function requestSearchFocus(): void {
  pendingSearchFocus = true
}

function consumeSearchFocus(): boolean {
  if (!pendingSearchFocus) return false
  pendingSearchFocus = false
  return true
}

export function useSearchFocus(): React.RefObject<HTMLInputElement> {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focus = (): void => {
      const input = ref.current
      if (!input) return
      input.focus()
      input.select()
    }

    // 从别的页面按 Ctrl+F 跳过来的情况，挂载后直接落焦
    if (consumeSearchFocus()) focus()

    const onKey = (event: KeyboardEvent): void => {
      if (!isSearchHotkey(event)) return
      event.preventDefault()
      focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return ref
}
