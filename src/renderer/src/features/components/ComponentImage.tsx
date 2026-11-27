import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { X } from 'lucide-react'

/**
 * 商品照片。
 *
 * 只在填了外链时才渲染：没填、或链接失效（图床挂了、防盗链）都返回 null，
 * 界面上不会留下一个灰块或裂图图标。图片本身由渲染进程按需从外链加载，
 * 不下载、不落盘，保持「数据全在本机」的边界。
 */
export function ComponentImage({
  url,
  alt,
  className,
  onOpen
}: {
  url: string | null
  alt: string
  className?: string
  /** 传入后会包一层按钮，点击可放大 */
  onOpen?: () => void
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (!url || failedUrl === url) return null

  const img = (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
      className={clsx('rounded-ctl object-cover', className)}
      style={{ background: 'var(--bg-sunken)' }}
    />
  )

  if (!onOpen) return img

  return (
    <button
      type="button"
      onClick={onOpen}
      title="查看大图"
      className="group relative shrink-0 cursor-zoom-in overflow-hidden rounded-ctl"
      style={{ lineHeight: 0 }}
    >
      {img}
      <span className="pointer-events-none absolute inset-0 rounded-ctl ring-1 ring-inset ring-black/5 transition-colors group-hover:ring-black/15" />
    </button>
  )
}

/** 抽屉里的放大预览，盖在抽屉与弹窗之上 */
export function ImageLightbox({
  url,
  alt,
  onClose
}: {
  url: string | null
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!url) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, onClose])

  if (!url) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-10"
      style={{ background: 'rgba(18, 18, 17, 0.72)' }}
      onClick={onClose}
    >
      <img
        src={url}
        alt={alt}
        referrerPolicy="no-referrer"
        className="max-h-full max-w-full rounded-ctl object-contain"
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        aria-label="关闭预览"
        onClick={onClose}
        className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X size={17} strokeWidth={1.7} />
      </button>
    </div>,
    document.body
  )
}
