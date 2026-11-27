import { useQuery } from '@tanstack/react-query'
import { Copy, ExternalLink, FolderOpen, Github } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { Button, useToast } from '@renderer/components/ui'
import { PageHeader } from '@renderer/features/overview/OverviewPage'
import logo from '@renderer/assets/logo.png'

const REPO = 'https://github.com/xiao-ni-qiu/BoxFlow'
const AUTHOR = 'https://github.com/xiao-ni-qiu'

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-card border border-hair px-4 pb-4 pt-3.5">
      <h2 className="text-[13px] font-medium text-t1">{title}</h2>
      {description ? <p className="mt-0.5 text-[12px] text-t2">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ArchBox({ title, role, items }: { title: string; role: string; items: string[] }) {
  return (
    <div
      className="min-w-0 flex-1 rounded-ctl px-3 py-2.5"
      style={{ background: 'var(--bg-sunken)', border: '1px solid var(--hair)' }}
    >
      <p className="text-[12px] font-medium text-t1">{title}</p>
      <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-t3">{role}</p>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-[11.5px] leading-[1.5] text-t2">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // file:// 环境下 Clipboard API 可能不可用，退回 execCommand
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

export function AboutPage() {
  const toast = useToast()
  const { data: info } = useQuery({ queryKey: ['app-info'], queryFn: () => api.app.info() })

  const version = info?.version ?? __APP_VERSION__

  const diagnostics = info
    ? [
        `BoxFlow ${info.version}`,
        `Electron ${info.electron} / Chromium ${info.chrome} / Node ${info.node}`,
        `平台 ${info.platform}`,
        `安装形态 ${info.packaged ? '安装版' : '开发模式'}`,
        `数据目录 ${info.dataDir}`,
        `物料 ${info.counts.components} · 供应商 ${info.counts.suppliers} · 流水 ${info.counts.movements} · 位置 ${info.counts.locations}`,
        `数据库 ${formatBytes(info.dbBytes)}`
      ].join('\n')
    : ''

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="关于" meta={`BoxFlow ${version} · Apache-2.0 开源`} centered />

      <div className="mx-auto grid w-full max-w-[880px] gap-3 px-7 pb-10 pt-5">
        <section className="flex items-center gap-4 rounded-card border border-hair px-5 py-4">
          <img src={logo} alt="BoxFlow" className="h-14 w-14 shrink-0 rounded-[14px]" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[18px] font-medium tracking-tight text-t1">BoxFlow</h1>
              <span className="text-[11.5px] text-t3">v{version}</span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-t2">
              本地优先的电子物料库存管理桌面应用。电子元器件、开发板、电子模块、五金、耗材一处管住，
              并用 MCP 协议把库存开放给 AI。
            </p>
          </div>
          <div className="ml-auto flex shrink-0 flex-col gap-1.5">
            <Button onClick={() => void api.app.openExternal(REPO)}>
              <Github size={13} strokeWidth={1.6} />
              GitHub 仓库
            </Button>
            <Button onClick={() => void api.settings.openDataDir()}>
              <FolderOpen size={13} strokeWidth={1.6} />
              数据目录
            </Button>
          </div>
        </section>

        <Section title="这个程序解决什么问题" description="给抽屉里那堆元件盒一个能查、能记、能被 AI 读写的账本">
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-t2">
            <li>
              <span className="text-t1">查得快</span>——型号、厂商、位置任意片段即时过滤，不用逐格翻 Excel。
            </li>
            <li>
              <span className="text-t1">记得住</span>——每次入库出库都留流水，谁在什么时候动了多少一目了然。
            </li>
            <li>
              <span className="text-t1">不丢数据</span>——SQLite 单文件存储，可整目录拷走，也能定时同步到坚果云。
            </li>
            <li>
              <span className="text-t1">能被 AI 用</span>——内置 MCP 服务，直接说「把 100 个 10kΩ 电阻入到 A-01-02」即可。
            </li>
          </ul>
        </Section>

        <Section
          title="软件架构"
          description="三层结构：界面只管展示，主进程管规则与数据，外部只能通过受控通道进入"
        >
          <div className="flex items-stretch gap-2">
            <ArchBox
              title="渲染进程"
              role="React 界面"
              items={['列表 / 表单 / 抽屉', '无 Node 权限', 'contextIsolation 开启']}
            />
            <div className="flex shrink-0 flex-col items-center justify-center px-1">
              <span className="text-[10px] text-t3">IPC</span>
              <span className="text-[14px] text-t3">⇄</span>
              <span className="text-[10px] text-t3">白名单</span>
            </div>
            <ArchBox
              title="主进程"
              role="Node 业务层"
              items={['service / repository', 'SQLite 读写', 'MCP 服务 :8788']}
            />
            <div className="flex shrink-0 items-center px-1 text-[14px] text-t3">→</div>
            <ArchBox
              title="数据层"
              role="SQLite WAL"
              items={['inventory.db 单文件', '迁移可回滚', '本地备份 / WebDAV']}
            />
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed text-t3">
            外部 AI 客户端走独立通道：支持 HTTP 的直连 127.0.0.1:8788/mcp（Bearer 鉴权），只支持
            stdio 的通过随包附带的桥接脚本转发，两者都不会跳过 service 层直接改库。
          </p>
        </Section>

        <Section title="运行环境" description="排查问题时这些信息最有用">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]">
            {[
              ['版本', `BoxFlow ${version}`],
              ['Electron', info?.electron ?? '—'],
              ['Chromium', info?.chrome ?? '—'],
              ['Node.js', info?.node ?? '—'],
              ['平台', info?.platform ?? '—'],
              ['安装形态', info ? (info.packaged ? '安装版' : '开发模式') : '—'],
              ['数据库大小', formatBytes(info?.dbBytes ?? 0)],
              [
                '数据规模',
                info
                  ? `${info.counts.components} 物料 / ${info.counts.movements} 流水`
                  : '—'
              ]
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-0 items-baseline gap-3">
                <span className="w-[68px] shrink-0 text-t3">{label}</span>
                <span className="mono truncate text-t1" title={String(value)}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code
              className="mono min-w-0 flex-1 truncate rounded-ctl px-2.5 py-1.5 text-[11.5px] text-t2"
              style={{ background: 'var(--bg-sunken)' }}
              title={info?.dataDir}
            >
              {info?.dataDir ?? '—'}
            </code>
            <Button
              onClick={async () => {
                const ok = await copyText(diagnostics)
                toast.push(ok ? '已复制诊断信息' : '复制失败，请手动复制', ok ? 'default' : 'error')
              }}
            >
              <Copy size={13} strokeWidth={1.6} />
              复制诊断信息
            </Button>
          </div>
        </Section>

        <Section title="作者与许可" description="项目以 Apache-2.0 协议开源，欢迎提交 Issue 与 PR">
          <div className="flex items-center gap-3">
            <a
              href={AUTHOR}
              onClick={(e) => {
                e.preventDefault()
                void api.app.openExternal(AUTHOR)
              }}
              className="flex min-w-0 items-center gap-2 text-[12.5px] text-t1 hover:underline"
            >
              <Github size={14} strokeWidth={1.6} />
              xiao-ni-qiu
            </a>
            <span className="h-3 w-px" style={{ background: 'var(--hair-strong)' }} />
            <span className="text-[12px] text-t2">Apache License 2.0</span>
            <span className="h-3 w-px" style={{ background: 'var(--hair-strong)' }} />
            <a
              href={REPO}
              onClick={(e) => {
                e.preventDefault()
                void api.app.openExternal(REPO)
              }}
              className="flex items-center gap-1 text-[12px] text-t2 hover:text-t1"
            >
              源码与更新日志
              <ExternalLink size={11} strokeWidth={1.6} />
            </a>
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-t3">
            本项目不收集任何使用数据，不含遥测与联网上报。唯一的外部请求是你主动配置的 WebDAV 备份，
            以及 AI 客户端对 127.0.0.1 的本地调用。
          </p>
        </Section>
      </div>
    </div>
  )
}
