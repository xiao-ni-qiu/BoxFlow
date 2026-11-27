import clsx from 'clsx'
import {
  ArrowLeftRight,
  Boxes,
  CircuitBoard,
  Cpu,
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
      className={clsx(
        'mb-0.5 flex h-9 items-center gap-2.5 rounded-ctl px-2.5 text-[13px] transition-colors duration-fast',
        active ? 'font-medium' : 'text-t2 hover:bg-sunken hover:text-t1'
      )}
      style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined}
    >
      <Icon size={15} strokeWidth={1.6} />
      {item.label}
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
        <div key={item.key}>
          {index === 1 ? <div className="my-2 h-px" style={{ background: 'var(--hair)' }} /> : null}
          <NavButton item={item} active={view === item.key} onClick={() => onChange(item.key)} />
        </div>
      ))}

      <div className="my-2 h-px" style={{ background: 'var(--hair)' }} />

      {SUB_NAV.map((item) => (
        <NavButton
          key={item.key}
          item={item}
          active={view === item.key}
          onClick={() => onChange(item.key)}
        />
      ))}

      <NavButton
        item={{ key: 'settings', label: '设置', icon: Settings }}
        active={view === 'settings'}
        onClick={() => onChange('settings')}
      />

      <div className="mt-auto px-2.5 pb-1 text-[11px] text-t3">BoxFlow v0.1.0 · 本地数据</div>
    </nav>
  )
}
