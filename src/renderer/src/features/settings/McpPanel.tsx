import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Cable, Check, Copy, RefreshCw } from 'lucide-react'
import { api, ApiError, type McpStatus } from '@renderer/lib/api'
import { Button, Input, Modal, useToast } from '@renderer/components/ui'

type TabKey = 'workbuddy' | 'codex' | 'generic'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'workbuddy', label: 'WorkBuddy / HTTP' },
  { key: 'codex', label: 'Codex / TOML' },
  { key: 'generic', label: '通用 JSON' }
]

/** 工具清单：与主进程注册的工具保持一致，写在这里是为了给用户可读的中文说明 */
const TOOL_GROUPS: { title: string; items: { name: string; text: string }[] }[] = [
  {
    title: '写入',
    items: [
      { name: 'add_stock', text: '入库，型号不存在会自动建档' },
      { name: 'remove_stock', text: '出库，库存不足会拒绝' },
      { name: 'set_stock', text: '盘点，把数量改成实际值' },
      { name: 'bulk_add_stock', text: '批量入库，一次提交多条' },
      { name: 'add_supplier', text: '新建供应商' },
      { name: 'update_component', text: '修改物料档案字段' },
      { name: 'archive_component', text: '归档 / 恢复物料' }
    ]
  },
  {
    title: '查询',
    items: [
      { name: 'search_components', text: '按关键词、分类、位置检索' },
      { name: 'get_component', text: '单个物料详情与最近流水' },
      { name: 'list_low_stock', text: '低库存清单' },
      { name: 'list_movements', text: '出入库流水' },
      { name: 'list_suppliers', text: '供应商列表' },
      { name: 'list_locations', text: '库位编码表' },
      { name: 'get_stats', text: '库存概览指标' }
    ]
  }
]

/** Windows 反斜杠在 JSON 里要转义，统一改用正斜杠更省事 */
function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

function buildConfig(tab: TabKey, status: McpStatus, token: string): string {
  const bridge = toPosixPath(status.bridgePath)

  if (tab === 'workbuddy') {
    return JSON.stringify(
      {
        mcpServers: {
          inventory: {
            url: status.endpoint,
            headers: { Authorization: `Bearer ${token}` }
          }
        }
      },
      null,
      2
    )
  }

  if (tab === 'codex') {
    return [
      '# 写入 ~/.codex/config.toml',
      '[mcp_servers.inventory]',
      'command = "node"',
      `args = ["${bridge}"]`
    ].join('\n')
  }

  return JSON.stringify(
    {
      mcpServers: {
        inventory: {
          command: 'node',
          args: [bridge]
        }
      }
    },
    null,
    2
  )
}

function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  }

  return (
    <Button onClick={() => void copy()}>
      {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.6} />}
      {copied ? '已复制' : label}
    </Button>
  )
}

function StatusDot({ status }: { status: McpStatus }) {
  const color = status.error
    ? 'var(--danger)'
    : status.running
      ? 'var(--ok, #3f9d6a)'
      : 'var(--t3)'
  return (
    <span
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ background: color, boxShadow: status.running ? `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` : 'none' }}
    />
  )
}

export function McpPanel() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() })
  const { data: status, refetch } = useQuery({
    queryKey: ['mcp-status'],
    queryFn: () => api.mcp.status(),
    refetchInterval: 5000
  })

  const [tab, setTab] = useState<TabKey>('workbuddy')
  const [portDraft, setPortDraft] = useState('')
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (settings && !portDraft) setPortDraft(String(settings.mcpPort))
  }, [settings, portDraft])

  const savePort = useMutation({
    mutationFn: (port: number) => api.settings.update({ mcpPort: port }),
    onSuccess: async () => {
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['settings'] })])
      toast.push('端口已更新')
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '端口保存失败', 'error')
  })

  const toggleEnabled = useMutation({
    mutationFn: (enabled: boolean) => api.settings.update({ mcpEnabled: enabled }),
    onSuccess: async () => {
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['settings'] })])
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '切换失败', 'error')
  })

  const rotate = useMutation({
    mutationFn: () => api.mcp.rotateToken(),
    onSuccess: async () => {
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['settings'] })])
      setConfirmRotate(false)
      toast.push('令牌已重置，请更新客户端配置')
    },
    onError: () => toast.push('重置失败', 'error')
  })

  const restart = useMutation({
    mutationFn: () => api.mcp.restart(),
    onSuccess: async () => {
      await refetch()
      toast.push('MCP 服务已重启')
    },
    onError: () => toast.push('重启失败', 'error')
  })

  const config = useMemo(
    () => (status && settings ? buildConfig(tab, status, settings.mcpToken) : ''),
    [tab, status, settings]
  )

  if (!status || !settings) {
    return <p className="text-[12.5px] text-t3">加载中…</p>
  }

  const enabled = status.enabled

  return (
    <>
      {/* 状态条 */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-ctl px-3 py-2.5"
        style={{ background: 'var(--bg-sunken)' }}
      >
        <StatusDot status={status} />
        <span className="text-[12.5px] text-t1">
          {status.error ? '启动失败' : status.running ? '运行中' : enabled ? '已停止' : '已关闭'}
        </span>
        <code className="mono text-[11.5px] text-t2">{status.endpoint}</code>
        <span className="text-[11.5px] text-t3">{status.toolCount} 个工具</span>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => restart.mutate()} disabled={restart.isPending || !enabled}>
            <RefreshCw size={12.5} strokeWidth={1.7} className={restart.isPending ? 'animate-spin' : ''} />
            重启
          </Button>
        </div>
      </div>

      {status.error ? (
        <p
          className="mt-2 rounded-ctl px-3 py-2 text-[11.5px]"
          style={{ background: 'var(--danger-soft, rgba(220,80,80,.1))', color: 'var(--danger)' }}
        >
          {status.error}
        </p>
      ) : null}

      {/* 开关与端口 */}
      <div className="mt-1" style={{ marginTop: 0 }}>
        <div className="flex items-center gap-4 py-3" style={{ borderTop: '1px solid var(--hair)' }}>
          <div className="min-w-0">
            <p className="text-[12.5px] text-t1">启用 MCP 服务</p>
            <p className="mt-0.5 text-[11.5px] text-t3">关闭后 AI 客户端无法连接，界面不受影响</p>
          </div>
          <div className="ml-auto shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => toggleEnabled.mutate(!enabled)}
              disabled={toggleEnabled.isPending}
              className={clsx(
                'relative h-[19px] w-[33px] shrink-0 rounded-full transition-colors duration-fast',
                toggleEnabled.isPending && 'opacity-40'
              )}
              style={{ background: enabled ? 'var(--accent)' : 'var(--hair-strong)' }}
            >
              <span
                className="absolute top-[2px] h-[15px] w-[15px] rounded-full bg-white transition-[left] duration-fast"
                style={{ left: enabled ? 16 : 2 }}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 py-3" style={{ borderTop: '1px solid var(--hair)' }}>
          <div className="min-w-0">
            <p className="text-[12.5px] text-t1">监听端口</p>
            <p className="mt-0.5 text-[11.5px] text-t3">只绑定 127.0.0.1，局域网无法访问</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Input
              value={portDraft}
              onChange={(e) => setPortDraft(e.target.value.replace(/[^\d]/g, ''))}
              className="w-[86px] text-center"
              inputMode="numeric"
            />
            <Button
              onClick={() => {
                const port = Number(portDraft)
                if (port === settings.mcpPort) return
                savePort.mutate(port)
              }}
              disabled={savePort.isPending || Number(portDraft) === settings.mcpPort}
            >
              应用
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 py-3" style={{ borderTop: '1px solid var(--hair)' }}>
          <div className="min-w-0">
            <p className="text-[12.5px] text-t1">访问令牌</p>
            <p className="mt-0.5 text-[11.5px] text-t3">客户端每次请求都要带上</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <code
              className="mono max-w-[200px] truncate rounded-ctl px-2 py-1 text-[11.5px] text-t2"
              style={{ background: 'var(--bg-sunken)' }}
            >
              {settings.mcpToken}
            </code>
            <CopyButton text={settings.mcpToken} />
            <Button onClick={() => setConfirmRotate(true)}>重置</Button>
          </div>
        </div>
      </div>

      {/* 客户端配置 */}
      <div className="pt-3" style={{ borderTop: '1px solid var(--hair)' }}>
        <div className="flex items-center gap-2">
          <Cable size={13} strokeWidth={1.7} className="text-t3" />
          <p className="text-[12.5px] text-t1">客户端接入</p>
          <div className="ml-auto flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={clsx(
                  'rounded-ctl px-2.5 py-1 text-[11.5px] transition-colors duration-fast',
                  tab === t.key ? 'text-t1' : 'text-t3 hover:text-t2'
                )}
                style={{
                  background: tab === t.key ? 'var(--accent-soft)' : 'transparent',
                  fontWeight: tab === t.key ? 500 : 400
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-2">
          <pre
            className="mono overflow-x-auto rounded-ctl px-3 py-2.5 text-[11.5px] leading-[1.65] text-t2"
            style={{ background: 'var(--bg-sunken)', margin: 0 }}
          >
            {config}
          </pre>
          <div className="absolute right-2 top-2">
            <CopyButton text={config} />
          </div>
        </div>

        <p className="mt-2 text-[11.5px] leading-relaxed text-t3">
          {tab === 'workbuddy'
            ? '把这段写入 WorkBuddy 的 MCP 配置后信任该服务即可。程序需保持运行（可最小化到托盘）。'
            : tab === 'codex'
              ? 'Codex CLI 走 stdio 传输，通过随程序附带的桥接脚本连到本机服务，无需关心端口与令牌。'
              : '适用于 Claude Desktop 等只支持 stdio 的客户端。路径中的中文目录无需额外转义。'}
        </p>
      </div>

      {/* 工具清单 */}
      <div className="pt-3" style={{ borderTop: '1px solid var(--hair)' }}>
        <button
          type="button"
          onClick={() => setShowTools((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <p className="text-[12.5px] text-t1">可用能力</p>
          <span className="text-[11.5px] text-t3">{status.toolCount} 个工具</span>
          <span className="ml-auto text-[11.5px] text-t3">{showTools ? '收起' : '展开'}</span>
        </button>

        {showTools ? (
          <div className="mt-2.5 grid gap-3">
            {TOOL_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-t3">{group.title}</p>
                <div className="grid gap-px overflow-hidden rounded-ctl" style={{ background: 'var(--hair)' }}>
                  {group.items.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-baseline gap-3 px-2.5 py-1.5"
                      style={{ background: 'var(--bg-panel)' }}
                    >
                      <code className="mono w-[136px] shrink-0 text-[11.5px] text-t1">
                        {item.name}
                      </code>
                      <span className="text-[11.5px] text-t3">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Modal
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title="重置访问令牌？"
        subtitle="已连接的客户端会立刻断开，需要把新令牌填回配置"
        width={420}
        footer={
          <>
            <Button onClick={() => setConfirmRotate(false)}>取消</Button>
            <Button variant="primary" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
              {rotate.isPending ? '重置中…' : '确认重置'}
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-t2">
          程序会生成一个全新的随机令牌并重启 MCP 服务。旧令牌立即失效。
        </p>
      </Modal>
    </>
  )
}
