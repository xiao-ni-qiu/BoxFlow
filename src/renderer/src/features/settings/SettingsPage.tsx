import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { api, ApiError } from '@renderer/lib/api'
import { Button, Field, Input, Modal, Switch, useToast } from '@renderer/components/ui'
import { PageHeader } from '@renderer/features/overview/OverviewPage'
import { AiPanel } from './AiPanel'
import { McpPanel } from './McpPanel'
import { WebdavPanel } from './WebdavPanel'

function Card({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-card border border-hair">
      <header className="px-4 pb-3 pt-3.5">
        <h2 className="text-[13px] font-medium text-t1">{title}</h2>
        {description ? <p className="mt-0.5 text-[12px] text-t2">{description}</p> : null}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

function SettingRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex items-center gap-4 py-3"
      style={{ borderTop: '1px solid var(--hair)' }}
    >
      <div className="min-w-0">
        <p className="text-[12.5px] text-t1">{label}</p>
        {hint ? <p className="mt-0.5 text-[11.5px] text-t3">{hint}</p> : null}
      </div>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() })
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [backupPath, setBackupPath] = useState<string | null>(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  const patch = useMutation({
    mutationFn: (next: Record<string, unknown>) => api.settings.update(next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '保存失败', 'error')
  })

  const backup = useMutation({
    mutationFn: () => api.settings.backupNow(),
    onSuccess: (result) => {
      setBackupPath(result.path)
      toast.push('已生成备份快照')
    },
    onError: () => toast.push('备份失败', 'error')
  })

  const clearAll = useMutation({
    mutationFn: () => api.settings.resetData(),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      setConfirmClear(false)
      toast.push('已清空全部数据')
    },
    onError: () => toast.push('清空失败', 'error')
  })

  if (!settings) {
    return <div className="p-7 text-[12.5px] text-t3">加载中…</div>
  }

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="设置" meta="所有数据都保存在本机，不上传任何服务器" centered />

      <div className="mx-auto grid w-full max-w-[880px] gap-3 px-7 pb-10 pt-5">
        <Card title="数据存储" description="数据库与附件都在这个目录里，整个目录拷走就是完整备份">
          <div
            className="flex items-center gap-2 pb-3"
            style={{ borderBottom: '1px solid var(--hair)' }}
          >
            <code className="mono min-w-0 flex-1 truncate rounded-ctl px-2.5 py-1.5 text-[12px] text-t2" style={{ background: 'var(--bg-sunken)' }}>
              {settings.dataDir}
            </code>
            <Button onClick={() => void api.settings.openDataDir()}>
              <FolderOpen size={13} strokeWidth={1.6} />
              打开
            </Button>
            <Button
              onClick={async () => {
                const picked = await api.settings.pickDataDir()
                if (picked) patch.mutate({ dataDir: picked })
              }}
            >
              更改
            </Button>
          </div>

          <SettingRow label="立即备份" hint="生成一致性快照，不影响正常使用">
            <div className="flex items-center gap-2">
              {backupPath ? (
                <span className="max-w-[180px] truncate text-[11.5px] text-t3">
                  {backupPath.split(/[\\/]/).pop()}
                </span>
              ) : null}
              <Button onClick={() => backup.mutate()} disabled={backup.isPending}>
                {backup.isPending ? '备份中…' : '备份'}
              </Button>
            </div>
          </SettingRow>
        </Card>

        <Card
          title="WebDAV 备份"
          description="把数据库快照传到坚果云等 WebDAV 网盘，换电脑或误删时可一键恢复"
        >
          <WebdavPanel />
        </Card>

        <Card
          title="AI 助手"
          description="选一家模型服务商，填好 Key 就能在「AI 助手」页用对话管理库存"
        >
          <AiPanel />
        </Card>

        <Card title="窗口与启动" description="关闭窗口后程序会留在系统托盘，AI 仍可读写库存">
          <div style={{ marginTop: -12 }}>
            <SettingRow label="关闭窗口时最小化到托盘" hint="关掉后点 × 会直接退出程序">
              <Switch
                checked={settings.closeToTray}
                onChange={(next) => patch.mutate({ closeToTray: next })}
              />
            </SettingRow>
            <SettingRow label="最小化时收进托盘" hint="任务栏不保留窗口">
              <Switch
                checked={settings.minimizeToTray}
                onChange={(next) => patch.mutate({ minimizeToTray: next })}
              />
            </SettingRow>
            <SettingRow label="开机自动启动" hint="安装版生效，开发模式下不写注册表">
              <Switch
                checked={settings.launchAtLogin}
                onChange={(next) => patch.mutate({ launchAtLogin: next })}
              />
            </SettingRow>
          </div>
        </Card>

        <Card
          title="AI 接入（MCP）"
          description="让 WorkBuddy、Codex、豆包工作版直接查询和增加库存"
        >
          <McpPanel />
        </Card>

        <Card title="危险操作" description="不可撤销，建议先备份">
          <div className="flex items-center gap-4 pt-1">
            <div>
              <p className="text-[12.5px] text-t1">清空全部数据</p>
              <p className="mt-0.5 text-[11.5px] text-t3">
                删除所有物料、供应商、位置与流水，程序恢复空白状态
              </p>
            </div>
            <Button className="ml-auto" onClick={() => setConfirmClear(true)}>
              <span className="text-danger">清空数据</span>
            </Button>
          </div>
        </Card>

        <p className="text-[11.5px] text-t3">
          BoxFlow v{__APP_VERSION__} · Electron + SQLite · 数据仅存于本机
        </p>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => {
          setConfirmClear(false)
          setConfirmText('')
        }}
        title="确认清空全部数据？"
        subtitle="这一步没有撤销，备份文件不会被删除"
        width={440}
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => clearAll.mutate()}
              disabled={clearAll.isPending || confirmText !== '清空'}
              style={{ background: 'var(--danger)' }}
            >
              {clearAll.isPending ? '清空中…' : '确认清空'}
            </Button>
          </>
        }
      >
        <Field label="请输入 清空 以确认">
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="清空" />
        </Field>
      </Modal>
    </div>
  )
}
