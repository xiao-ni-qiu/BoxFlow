import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ItemKind } from '@shared/constants'
import { isSearchHotkey, requestSearchFocus } from '@renderer/lib/hooks'
import { Sidebar, type ViewKey } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { OverviewPage } from './features/overview/OverviewPage'
import { ComponentsPage } from './features/components/ComponentsPage'
import { SuppliersPage } from './features/suppliers/SuppliersPage'
import { MovementsPage } from './features/movements/MovementsPage'
import { LocationsPage } from './features/locations/LocationsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { AboutPage } from './features/about/AboutPage'
import { AssistantPage } from './features/assistant/AssistantPage'

const TITLES: Record<ViewKey, string> = {
  overview: '概览',
  assistant: 'AI 助手',
  components: '电子元器件',
  boards: '开发板',
  modules: '电子模块',
  hardware: '五金',
  consumables: '耗材',
  suppliers: '供应商',
  movements: '出入库流水',
  locations: '存放位置',
  settings: '设置',
  about: '关于'
}

/** 五个物料页面共用一套列表与表单，只是大类不同 */
const KIND_VIEWS: Partial<Record<ViewKey, ItemKind>> = {
  components: 'component',
  boards: 'board',
  modules: 'module',
  hardware: 'hardware',
  consumables: 'consumable'
}

const VIEWS = Object.keys(TITLES) as ViewKey[]

function initialView(): ViewKey {
  const hash = window.location.hash.replace('#', '')
  return VIEWS.includes(hash as ViewKey) ? (hash as ViewKey) : 'components'
}

export function App() {
  const [view, setView] = useState<ViewKey>(initialView)
  const queryClient = useQueryClient()

  // AI 通过 MCP 写入后，主进程会推一条消息过来，这里刷新受影响的列表
  useEffect(() => {
    const keys = ['components', 'movements', 'overview', 'suppliers', 'facets', 'locations', 'component-detail', 'component-movements', 'mcp-status']
    return window.api.onMainMessage((message) => {
      if (message !== 'mcp-activity') return
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    })
  }, [queryClient])

  const kind = KIND_VIEWS[view]

  // 有搜索框的页面自己会处理 Ctrl+F；其它页面（概览、流水、设置…）统一跳到物料页再落焦
  const hasSearchBox = Boolean(kind) || view === 'suppliers'
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (hasSearchBox || !isSearchHotkey(event)) return
      event.preventDefault()
      requestSearchFocus()
      setView('components')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasSearchBox])

  return (
    <div className="flex h-full flex-col">
      <TitleBar title={TITLES[view]} />
      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onChange={setView} />
        <main
          className="min-w-0 flex-1 overflow-hidden bg-surface"
          style={{ borderLeft: '1px solid var(--hair)' }}
        >
          {view === 'overview' ? <OverviewPage onNavigate={setView} /> : null}
          {view === 'assistant' ? (
            <AssistantPage onOpenSettings={() => setView('settings')} />
          ) : null}
          {kind ? <ComponentsPage key={view} kind={kind} /> : null}
          {view === 'suppliers' ? <SuppliersPage /> : null}
          {view === 'movements' ? <MovementsPage /> : null}
          {view === 'locations' ? <LocationsPage /> : null}
          {view === 'settings' ? <SettingsPage /> : null}
          {view === 'about' ? <AboutPage /> : null}
        </main>
      </div>
    </div>
  )
}
