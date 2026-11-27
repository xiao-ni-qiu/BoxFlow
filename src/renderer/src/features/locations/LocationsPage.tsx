import { Fragment, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { api, ApiError, type LocationNode } from '@renderer/lib/api'
import { dash, formatDateTime } from '@renderer/lib/format'
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Textarea,
  useToast
} from '@renderer/components/ui'
import { PageHeader } from '@renderer/features/overview/OverviewPage'

const KIND_LABEL: Record<string, string> = {
  room: '房间 / 区域',
  rack: '柜',
  layer: '层',
  box: '盒 / 位'
}

const GRID = '132px minmax(0,1fr) minmax(0,1.1fr) 84px 56px 96px 68px'

interface FormState {
  code: string
  name: string
  kind: string
  note: string
}

const EMPTY_FORM: FormState = { code: '', name: '', kind: 'box', note: '' }

export function LocationsPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LocationNode | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<LocationNode | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()

  const { data } = useQuery({ queryKey: ['locations'], queryFn: () => api.locations.tree() })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['locations'] })
    void queryClient.invalidateQueries({ queryKey: ['facets'] })
    void queryClient.invalidateQueries({ queryKey: ['components'] })
  }

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? api.locations.update({ id: editing.id, ...payload })
        : api.locations.create(payload),
    onSuccess: () => {
      refresh()
      toast.push(editing ? '已保存修改' : '已新增位置')
      setFormOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败')
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.locations.remove(id),
    onSuccess: () => {
      refresh()
      toast.push('已删除位置')
      setConfirmDelete(null)
    },
    onError: (err) => {
      toast.push(err instanceof ApiError ? err.message : '删除失败', 'error')
      setConfirmDelete(null)
    }
  })

  const openCreate = (): void => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setFormOpen(true)
  }

  const openEdit = (node: LocationNode): void => {
    setEditing(node)
    setForm({
      code: node.code,
      name: node.name ?? '',
      kind: node.kind,
      note: node.note ?? ''
    })
    setError(null)
    setFormOpen(true)
  }

  const submit = (): void => {
    setError(null)
    if (!form.code.trim()) {
      setError('位置编码不能为空')
      return
    }
    save.mutate({
      code: form.code.trim(),
      name: form.name.trim() || null,
      kind: form.kind,
      note: form.note.trim() || null
    })
  }

  const roots = data ?? []

  const renderRow = (node: LocationNode, depth: number): ReactNode => (
    <Fragment key={node.id}>
      <div
        data-location={node.fullCode}
        className="group grid items-center gap-x-3 transition-colors hover:bg-[var(--bg-sunken)]"
        style={{
          gridTemplateColumns: GRID,
          height: depth === 0 ? 48 : 44,
          borderBottom: '1px solid var(--hair)',
          paddingLeft: depth * 14
        }}
      >
        <span
          className={depth === 0 ? 'mono truncate text-t1' : 'mono truncate text-[12px] text-t2'}
          title={node.fullCode}
        >
          {node.fullCode}
        </span>
        <span
          className={
            depth === 0
              ? 'truncate text-[12.5px] text-t2'
              : 'truncate text-[12px] text-t3'
          }
          title={node.name ?? ''}
        >
          {dash(node.name)}
        </span>
        <span
          className="truncate text-[12px] text-t3"
          title={node.note ?? ''}
        >
          {node.note ? node.note : dash(null)}
        </span>
        <span className={depth === 0 ? 'text-[12.5px] text-t2' : 'text-[12px] text-t3'}>
          {KIND_LABEL[node.kind] ?? node.kind}
        </span>
        <span className="num text-right text-[12px] text-t3">
          {node.componentCount > 0 ? node.componentCount : '—'}
        </span>
        <span className="num text-right text-[12px] text-t3">
          {formatDateTime(node.createdAt)}
        </span>
        <span className="flex items-center justify-end gap-0.5 opacity-45 transition-opacity group-hover:opacity-100">
          <IconButton label={`编辑 ${node.fullCode}`} onClick={() => openEdit(node)}>
            <Pencil size={13} strokeWidth={1.7} />
          </IconButton>
          <IconButton
            label={`删除 ${node.fullCode}`}
            className="hover:!bg-[var(--danger-soft)] hover:!text-danger"
            onClick={() => setConfirmDelete(node)}
          >
            <Trash2 size={13} strokeWidth={1.7} />
          </IconButton>
        </span>
      </div>
      {node.children.map((child) => renderRow(child, depth + 1))}
    </Fragment>
  )

  const blockedByChildren = (confirmDelete?.children.length ?? 0) > 0
  const blockedByComponents = (confirmDelete?.componentCount ?? 0) > 0
  const canDelete = Boolean(confirmDelete) && !blockedByChildren && !blockedByComponents

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="存放位置"
        meta="录入物料时填写编码会自动建档，这里可以改名、改编码、补备注"
        action={
          <Button variant="primary" onClick={openCreate}>
            新增位置
          </Button>
        }
      />

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-7">
        <div
          className="grid shrink-0 items-center gap-x-3 pb-2.5 text-[12px] text-t3"
          style={{ gridTemplateColumns: GRID, borderBottom: '1px solid var(--hair-strong)' }}
        >
          <span>编码</span>
          <span>名称</span>
          <span>备注</span>
          <span>类型</span>
          <span className="text-right">物料</span>
          <span className="text-right">创建时间</span>
          <span />
        </div>

        <div className="min-h-0 flex-1 overflow-auto pb-6">
          {roots.length === 0 ? (
            <EmptyState
              title="还没有位置"
              description="在物料里填 A-02-03 这样的编码就会自动建档。"
              action={
                <Button variant="primary" onClick={openCreate}>
                  新增位置
                </Button>
              }
            />
          ) : (
            roots.map((node) => renderRow(node, 0))
          )}
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        title={editing ? '编辑位置' : '新增位置'}
        subtitle={
          editing
            ? editing.children.length > 0
              ? '改编码会同步更新下属位置的编码'
              : '编码和名称都可以随时调整'
            : '单层编码直接填 A-02-03 即可'
        }
        width={480}
        footer={
          <>
            {error ? <span className="mr-auto text-[12px] text-danger">{error}</span> : null}
            <Button
              onClick={() => {
                setFormOpen(false)
                setEditing(null)
              }}
            >
              取消
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={submit}>
              {save.isPending ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="位置编码" hint={editing ? '必填' : '必填，如 A-02-03'}>
            <Input
              autoFocus
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="A-02-03"
              className="mono"
            />
          </Field>
          <Field label="名称" hint="选填，方便记忆">
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="A柜第2层第3盒"
            />
          </Field>
          <Field label="类型">
            <Select
              value={form.kind}
              onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
            >
              {Object.entries(KIND_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="备注" hint="选填，最多 200 字">
            <Textarea
              rows={3}
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="例如：防静电柜，仅存 IC；钥匙在第二个抽屉"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title={canDelete ? '删除位置' : '无法删除'}
        subtitle={confirmDelete ? confirmDelete.fullCode : undefined}
        width={440}
        footer={
          canDelete ? (
            <>
              <Button onClick={() => setConfirmDelete(null)}>取消</Button>
              <Button
                variant="primary"
                className="!bg-[var(--danger)] hover:!bg-[#a01818]"
                disabled={remove.isPending}
                onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
              >
                {remove.isPending ? '删除中…' : '确认删除'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirmDelete(null)}>知道了</Button>
          )
        }
      >
        {blockedByChildren ? (
          <p className="text-[12.5px] text-t2">
            这个位置下还有{' '}
            <span className="font-medium text-t1">{confirmDelete?.children.length}</span>{' '}
            个子位置，请先删除子位置，否则它们的上级编码会断掉。
          </p>
        ) : blockedByComponents ? (
          <p className="text-[12.5px] text-t2">
            还有{' '}
            <span className="font-medium text-t1">{confirmDelete?.componentCount}</span>{' '}
            个物料存放在这里。删除会让这些物料失去位置，请先把它们改到其他位置。
          </p>
        ) : (
          <p className="text-[12.5px] text-t2">
            删除后不可恢复。这个位置没有物料占用，也没有子位置，可以安全删除。
          </p>
        )}
      </Modal>
    </div>
  )
}
