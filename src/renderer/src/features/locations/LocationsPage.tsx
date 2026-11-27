import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@renderer/lib/api'
import { dash, formatDateTime } from '@renderer/lib/format'
import { Button, EmptyState, Field, Input, Modal, Select, useToast } from '@renderer/components/ui'
import { PageHeader } from '@renderer/features/overview/OverviewPage'

const KIND_LABEL: Record<string, string> = {
  room: '房间 / 区域',
  rack: '柜',
  layer: '层',
  box: '盒 / 位'
}

const GRID = '150px minmax(0,1.4fr) 100px 130px'

export function LocationsPage() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('box')
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()

  const { data } = useQuery({ queryKey: ['locations'], queryFn: () => api.locations.tree() })

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.locations.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['locations'] })
      void queryClient.invalidateQueries({ queryKey: ['facets'] })
      toast.push('已新增位置')
      setOpen(false)
      setCode('')
      setName('')
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存失败')
  })

  const roots = data ?? []

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="存放位置"
        meta="录入物料时填写编码会自动建档，这里可以补上可读名称和层级"
        action={
          <Button variant="primary" onClick={() => setOpen(true)}>
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
          <span>类型</span>
          <span className="text-right">创建时间</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto pb-6">
          {roots.length === 0 ? (
            <EmptyState
              title="还没有位置"
              description="在物料里填 A-02-03 这样的编码就会自动建档。"
              action={
                <Button variant="primary" onClick={() => setOpen(true)}>
                  新增位置
                </Button>
              }
            />
          ) : (
            roots.map((node) => (
              <div key={node.id}>
                <div
                  className="grid items-center gap-x-3"
                  style={{ gridTemplateColumns: GRID, height: 48, borderBottom: '1px solid var(--hair)' }}
                >
                  <span className="mono text-t1">{node.fullCode}</span>
                  <span className="truncate text-[12.5px] text-t2">{dash(node.name)}</span>
                  <span className="text-[12.5px] text-t2">{KIND_LABEL[node.kind] ?? node.kind}</span>
                  <span className="num text-right text-[12px] text-t3">
                    {formatDateTime(node.createdAt)}
                  </span>
                </div>
                {node.children.map((child) => (
                  <div
                    key={child.id}
                    className="grid items-center gap-x-3"
                    style={{
                      gridTemplateColumns: GRID,
                      height: 44,
                      borderBottom: '1px solid var(--hair)',
                      paddingLeft: 16
                    }}
                  >
                    <span className="mono text-t2">{child.fullCode}</span>
                    <span className="truncate text-[12px] text-t3">{dash(child.name)}</span>
                    <span className="text-[12px] text-t3">{KIND_LABEL[child.kind] ?? child.kind}</span>
                    <span />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="新增位置"
        subtitle="单层编码直接填 A-02-03 即可"
        width={480}
        footer={
          <>
            {error ? <span className="mr-auto text-[12px] text-danger">{error}</span> : null}
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={mutation.isPending}
              onClick={() => {
                setError(null)
                if (!code.trim()) {
                  setError('位置编码不能为空')
                  return
                }
                mutation.mutate({ code: code.trim(), name: name.trim() || null, kind })
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="位置编码" hint="必填">
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="A-02-03"
              className="mono"
            />
          </Field>
          <Field label="名称">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A柜第2层第3盒"
            />
          </Field>
          <Field label="类型">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
