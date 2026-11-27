import clsx from 'clsx'
import {
  ArrowLeftRight,
  Boxes,
  CircuitBoard,
  Cpu,
  Info,
  LayoutGrid,
  MapPin,
  Package,
  Settings,
  Users,
  Wrench
} from 'lucide-react'

export type ViewKey =
  | 'overview'
  | 'components'
  | 'boards'
  | 'modules'
  | 'hardware'
  | 'consumables'
  | 'suppliers'
  | 'movements'
  | 'locations'
  | 'settings'
  | 'about'

interface NavItem {
  key: ViewKey
  label: string
  icon: typeof Boxes
}

/** 物料是主角，排在一起；供应商与流水属于配套数据，放在分隔线下方 */
const MAIN_NAV: NavItem[] = [
  { key: 'overview', label: '概览', icon: LayoutGrid },
  { key: 'components', label: '电子元器件', icon: Boxes },
  { key: 'boards', label: '开发板', icon: CircuitBoard },
  { key: 'modules', label: '电子模块', icon: Cpu },
  { key: 'hardware', label: '五金', icon: Wrench },
  { key: 'consumables', label: '耗材', icon: Package },
  { key: 'locations', label: '存放位置', icon: MapPin }
]

const SUB_NAV: NavItem[] = [
  { key: 'suppliers', label: '供应商', icon: Users },
  { key: 'movements', label: '出入库流水', icon: ArrowLeftRight }
]

const FOOTER_NAV: NavItem[] = [
  { key: 'settings', label: '设置', icon: Settings },
  { key: 'about', label: '关于', icon: Info }
]

function NavButton({
  item,
  active,
  onClick
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        // w-full 让每一项都占满侧栏宽度，点击热区不再随文字长短变化
        'mb-0.5 flex h-9 w-full items-center gap-2.5 rounded-ctl px-3 text-left text-[13px] transition-colors duration-fast',
        active ? 'font-medium' : 'text-t2 hover:bg-sunken hover:text-t1'
      )}
      style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
    >
      <Icon size={15} strokeWidth={1.6} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </button>
  )
}

export function Sidebar({
  view,
  onChange
}: {
  view: ViewKey
  onChange: (next: ViewKey) => void
}) {
  return (
    <nav
      className="flex w-[208px] shrink-0 flex-col px-2.5 py-3"
      style={{ background: 'var(--bg-panel)' }}
    >
      {MAIN_NAV.map((item, index) => (
        <div key={item.key} className="w-full">
          {index === 1 ? <div className="my-2 h-px" style={{ background: 'var(--hair)' }} /> : null}
          <NavButton item={item} active={view === item.key} onClick={() => onChange(item.key)} />
        </div>
      ))}

      <div className="my-2 h-px" style={{ background: 'var(--hair)' }} />

      {SUB_NAV.map((item) => (
        <div key={item.key} className="w-full">
          <NavButton item={item} active={view === item.key} onClick={() => onChange(item.key)} />
        </div>
      ))}

      <div className="mt-auto">
        <div className="my-2 h-px" style={{ background: 'var(--hair)' }} />
        {FOOTER_NAV.map((item) => (
          <div key={item.key} className="w-full">
            <NavButton item={item} active={view === item.key} onClick={() => onChange(item.key)} />
          </div>
        ))}
        <p className="px-3 pb-1 pt-1.5 text-[11px] text-t3">BoxFlow v{__APP_VERSION__} · 本地数据</p>
      </div>
    </nav>
  )
}
