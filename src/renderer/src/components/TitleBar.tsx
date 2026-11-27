import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import logo from '@renderer/assets/logo.png'

function line(rotate: number, width: number, thickness = 1): React.CSSProperties {
  return {
    width,
    height: thickness,
    background: 'currentColor',
    transform: rotate ? `rotate(${rotate}deg)` : undefined
  }
}

export function TitleBar({ title }: { title: string }) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    return api.window.onStateChange((state) => setIsMaximized(state.maximized))
  }, [])

  return (
    <header
      className="drag flex h-11 shrink-0 items-center pl-3 pr-2"
      style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--hair)' }}
    >
      <div className="flex items-center gap-2">
        <img
          src={logo}
          alt="BoxFlow"
          className="h-[18px] w-[18px] rounded-[4px] object-contain"
          draggable={false}
        />
        <span className="text-[13px] font-medium tracking-[0.2px] text-t1">BoxFlow</span>
        <span className="text-[12px] text-t3">/ {title}</span>
      </div>

      <div className="no-drag ml-auto flex items-center gap-0.5 text-t2">
        <button
          type="button"
          aria-label="最小化"
          className="flex h-7 w-8 items-center justify-center rounded-[6px] transition-colors duration-fast hover:bg-sunken hover:text-t1"
          onClick={() => void api.window.minimize()}
        >
          <span style={line(0, 10)} />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? '还原' : '最大化'}
          className="flex h-7 w-8 items-center justify-center rounded-[6px] transition-colors duration-fast hover:bg-sunken hover:text-t1"
          onClick={() => void api.window.maximize()}
        >
          {isMaximized ? (
            <span className="relative h-[11px] w-[11px]">
              <span
                className="absolute left-0 top-0 h-[8px] w-[8px] rounded-[1px]"
                style={{ border: '1px solid currentColor' }}
              />
              <span
                className="absolute bottom-0 right-0 h-[8px] w-[8px] rounded-[1px]"
                style={{ border: '1px solid currentColor', background: 'var(--bg-panel)' }}
              />
            </span>
          ) : (
            <span
              style={{
                width: 9,
                height: 9,
                border: '1px solid currentColor',
                borderRadius: 1.5
              }}
            />
          )}
        </button>
        <button
          type="button"
          aria-label="关闭"
          className="flex h-7 w-8 items-center justify-center rounded-[6px] transition-colors duration-fast hover:bg-[var(--danger-soft)] hover:text-danger"
          onClick={() => void api.window.close()}
        >
          <span className="relative flex h-[10px] w-[10px] items-center justify-center">
            <span className="absolute" style={line(45, 11)} />
            <span className="absolute" style={line(-45, 11)} />
          </span>
        </button>
      </div>
    </header>
  )
}
