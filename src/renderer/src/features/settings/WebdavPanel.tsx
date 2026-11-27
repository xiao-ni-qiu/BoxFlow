import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudUpload, Download, RefreshCw, ShieldCheck } from 'lucide-react'
import { api, ApiError } from '@renderer/lib/api'
import { Button, Field, Input, Modal, Switch, useToast } from '@renderer/components/ui'

interface Draft {
  url: string
  username: string
  password: string
  remoteDir: string
  keepCount: number
  enabled: boolean
  autoBackup: boolean
}

const EMPTY: Draft = {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  remoteDir: 'BoxFlow',
  keepCount: 7,
  enabled: true,
  autoBackup: true
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(iso: string | null): string {
  if (!iso) return '从未备份'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function WebdavPanel() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ['webdav-status'],
    queryFn: () => api.webdav.status()
  })

  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  // 首次拿到远端配置后灌入表单；用户改过之后不再覆盖
  useEffect(() => {
    if (!status || touched) return
    setDraft({
      url: status.url || EMPTY.url,
      username: status.username,
      password: '',
      remoteDir: status.remoteDir || 'BoxFlow',
      keepCount: status.keepCount || 7,
      enabled: status.enabled,
      autoBackup: status.autoBackup
    })
  }, [status, touched])

  const set = (patch: Partial<Draft>): void => {
    setTouched(true)
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.webdav.save(patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['webdav-status'] })
      setDraft((prev) => ({ ...prev, password: '' }))
      setTouched(false)
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '保存失败', 'error')
  })

  // 开关属于「改了立刻生效」，不跟表单一起提交，避免用户以为已经打开
  const toggle = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.webdav.save(patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['webdav-status'] }),
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '保存失败', 'error')
  })

  const test = useMutation({
    mutationFn: () => api.webdav.test(),
    onSuccess: (result) => toast.push(`${result.message}（${result.latencyMs} ms）`),
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '连接失败', 'error'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['webdav-status'] })
  })

  const backup = useMutation({
    mutationFn: () => api.webdav.backup(),
    onSuccess: (result) => {
      const pruned = result.pruned.length ? `，已清理 ${result.pruned.length} 份旧备份` : ''
      toast.push(`已上传 ${result.file}（${formatBytes(result.bytes)}）${pruned}`)
      void queryClient.invalidateQueries({ queryKey: ['webdav-status'] })
      void queryClient.invalidateQueries({ queryKey: ['webdav-files'] })
    },
    onError: (err) => {
      toast.push(err instanceof ApiError ? err.message : '备份失败', 'error')
      void queryClient.invalidateQueries({ queryKey: ['webdav-status'] })
    }
  })

  const files = useQuery({
    queryKey: ['webdav-files'],
    queryFn: () => api.webdav.list(),
    enabled: Boolean(status?.configured),
    retry: false
  })

  const restore = useMutation({
    mutationFn: (name: string) => api.webdav.restore(name),
    onSuccess: (result) => {
      setConfirmRestore(null)
      void queryClient.invalidateQueries()
      toast.push(`已从 ${result.file} 恢复，原数据已另存为 ${result.safetySnapshot.split(/[\\/]/).pop()}`)
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '恢复失败', 'error')
  })

  const configured = Boolean(status?.configured)
  const lastError = status?.lastError

  const pending = save.isPending || test.isPending

  const submit = (): void => {
    const patch: Record<string, unknown> = {
      url: draft.url,
      username: draft.username,
      remoteDir: draft.remoteDir,
      keepCount: draft.keepCount,
      // 第一次配置完成时直接启用，否则用户会以为配好了却什么都不备份
      enabled: status?.configured ? draft.enabled : true,
      autoBackup: draft.autoBackup
    }
    if (draft.password) patch.password = draft.password
    save.mutate(patch, {
      onSuccess: () => {
        // 保存后立刻验证一次，省得用户自己再点
        test.mutate()
      }
    })
  }

  return (
    <div>
      <div className="grid gap-3 pb-4" style={{ borderBottom: '1px solid var(--hair)' }}>
        <Field label="服务地址" hint="坚果云固定为 https://dav.jianguoyun.com/dav/">
          <Input
            value={draft.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://dav.jianguoyun.com/dav/"
            spellCheck={false}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="账号" hint="坚果云登录邮箱">
            <Input
              value={draft.username}
              onChange={(e) => set({ username: e.target.value })}
              placeholder="you@example.com"
              spellCheck={false}
            />
          </Field>
          <Field
            label="应用密码"
            hint={status?.hasPassword ? '已保存，留空则不修改' : '不是登录密码'}
          >
            <Input
              type="password"
              value={draft.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={status?.hasPassword ? '••••••••' : '第三方应用密码'}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="远程目录" hint="会自动创建">
            <Input
              value={draft.remoteDir}
              onChange={(e) => set({ remoteDir: e.target.value })}
              placeholder="BoxFlow"
              spellCheck={false}
            />
          </Field>
          <Field label="保留份数" hint="超出后自动删除最旧的">
            <Input
              type="number"
              min={1}
              max={60}
              value={draft.keepCount}
              onChange={(e) => set({ keepCount: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 py-3.5">
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? '处理中…' : '保存并测试连接'}
        </Button>
        <Button onClick={() => backup.mutate()} disabled={!configured || backup.isPending}>
          <CloudUpload size={13} strokeWidth={1.6} />
          {backup.isPending ? '上传中…' : '立即备份到云端'}
        </Button>
        <Button
          onClick={() => void files.refetch()}
          disabled={!configured || files.isFetching}
          title="重新读取云端备份列表"
        >
          <RefreshCw size={13} strokeWidth={1.6} className={files.isFetching ? 'animate-spin' : ''} />
          刷新
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-t3">
          <ShieldCheck size={12} strokeWidth={1.6} />
          {!status?.hasPassword
            ? '尚未设置应用密码'
            : status.encrypted
              ? '应用密码已用系统密钥加密'
              : '应用密码未加密（系统密钥环不可用）'}
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--hair)' }}>
        <div className="flex items-center gap-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[12.5px] text-t1">启用 WebDAV 备份</p>
            <p className="mt-0.5 text-[11.5px] text-t3">关闭后不再上传，已上传的备份仍保留在云端</p>
          </div>
          <div className="ml-auto">
            <Switch
              checked={draft.enabled}
              onChange={(next) => {
                setDraft((prev) => ({ ...prev, enabled: next }))
                toggle.mutate({ enabled: next })
              }}
            />
          </div>
        </div>
        <div
          className="flex items-center gap-4 py-2.5"
          style={{ borderTop: '1px solid var(--hair)' }}
        >
          <div className="min-w-0">
            <p className="text-[12.5px] text-t1">每天自动备份一次</p>
            <p className="mt-0.5 text-[11.5px] text-t3">
              启动后检查，距上次超过 23 小时才会上传，避免触发坚果云频率限制
            </p>
          </div>
          <div className="ml-auto">
            <Switch
              checked={draft.autoBackup}
              disabled={!draft.enabled}
              onChange={(next) => {
                setDraft((prev) => ({ ...prev, autoBackup: next }))
                toggle.mutate({ autoBackup: next })
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 py-3 text-[11.5px]">
        <p className="text-t2">
          上次备份：<span className="text-t1">{formatTime(status?.lastBackupAt ?? null)}</span>
          {status?.lastBackupFile ? <span className="text-t3"> · {status.lastBackupFile}</span> : null}
        </p>
        {lastError ? <p style={{ color: 'var(--danger)' }}>上次失败：{lastError}</p> : null}
        <p className="text-t3">
          需要到坚果云「账户信息 → 安全选项 → 第三方应用管理」添加应用后获取专用密码；免费账号有请求频率限制，建议只开每日自动备份。
        </p>
      </div>

      {configured ? (
        <div className="pt-1">
          <p className="pb-2 text-[12px] text-t2">云端备份</p>
          {files.isLoading ? (
            <p className="text-[11.5px] text-t3">读取中…</p>
          ) : files.error ? (
            <p className="text-[11.5px]" style={{ color: 'var(--danger)' }}>
              {files.error instanceof ApiError ? files.error.message : '读取失败'}
            </p>
          ) : (files.data?.length ?? 0) === 0 ? (
            <p className="text-[11.5px] text-t3">云端还没有备份文件</p>
          ) : (
            <div className="overflow-hidden rounded-ctl border border-hair">
              {files.data?.map((file, index) => (
                <div
                  key={file.name}
                  className="flex items-center gap-3 px-3 py-2"
                  style={index ? { borderTop: '1px solid var(--hair)' } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-t1">{file.name}</p>
                    <p className="text-[11px] text-t3">
                      {formatTime(file.modifiedAt)} · {formatBytes(file.size)}
                    </p>
                  </div>
                  <Button onClick={() => setConfirmRestore(file.name)}>
                    <Download size={12} strokeWidth={1.6} />
                    恢复
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={Boolean(confirmRestore)}
        onClose={() => setConfirmRestore(null)}
        title="用云端备份覆盖当前数据？"
        subtitle="当前数据库会先另存一份到本地 backups 目录，但界面上的改动都会回退"
        width={460}
        footer={
          <>
            <Button onClick={() => setConfirmRestore(null)}>取消</Button>
            <Button
              variant="primary"
              style={{ background: 'var(--danger)' }}
              disabled={restore.isPending}
              onClick={() => {
                if (confirmRestore) restore.mutate(confirmRestore)
              }}
            >
              {restore.isPending ? '恢复中…' : '确认恢复'}
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-t2">
          将下载 <span className="mono text-t1">{confirmRestore}</span> 并替换本机数据库。恢复过程中请不要关闭程序。
        </p>
      </Modal>
    </div>
  )
}
