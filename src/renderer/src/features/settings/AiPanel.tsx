import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, KeyRound, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { AI_PROVIDERS, findProvider, type AiModelInfo } from '@shared/ai'
import { api, ApiError } from '@renderer/lib/api'
import {
  Button,
  Combobox,
  Field,
  Input,
  Select,
  Switch,
  useToast,
  type ComboboxOption
} from '@renderer/components/ui'

interface Draft {
  providerId: string
  baseUrl: string
  model: string
  apiKey: string
  temperature: number
  confirmWrites: boolean
  extraPrompt: string
}

const EMPTY: Draft = {
  providerId: 'deepseek',
  baseUrl: '',
  model: '',
  apiKey: '',
  temperature: 0.3,
  confirmWrites: true,
  extraPrompt: ''
}

export function AiPanel() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: config } = useQuery({ queryKey: ['ai-config'], queryFn: () => api.ai.config() })

  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [touched, setTouched] = useState(false)

  // 服务商实时返回的模型清单，换了模型或上新模型都不用改代码
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [modelNote, setModelNote] = useState<{ error?: string; latency?: number }>({})
  const autoLoaded = useRef(false)

  useEffect(() => {
    if (!config || touched) return
    setDraft({
      providerId: config.providerId,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: '',
      temperature: config.temperature,
      confirmWrites: config.confirmWrites,
      extraPrompt: config.extraPrompt
    })
  }, [config, touched])

  const preset = findProvider(draft.providerId)

  /**
   * 读取模型清单。优先用界面上刚填的值，这样「填完 Key 先看看有哪些模型」
   * 不用先保存一次；Key 只在主进程里用于这一次请求。
   */
  const loadModels = useMutation({
    mutationFn: (input: { providerId?: string; baseUrl?: string; apiKey?: string }) =>
      api.ai.listModels(input),
    onSuccess: (result) => {
      setModels(result.models)
      setModelNote({ latency: result.latencyMs })
    },
    onError: (err) => {
      // 刷新失败时保留上一次读到的列表，别让用户手里的选项突然消失
      setModelNote({ error: err instanceof ApiError ? err.message : '读取模型列表失败' })
    }
  })

  const reloadModels = (source: Draft = draft): void => {
    setModelNote({})
    loadModels.mutate({
      providerId: source.providerId,
      baseUrl: source.baseUrl,
      apiKey: source.apiKey || undefined
    })
  }

  // 打开设置页时用已存的 Key 自动读一次，省掉一次点击
  useEffect(() => {
    if (autoLoaded.current || !config) return
    if (!config.hasApiKey || config.providerId !== draft.providerId) return
    autoLoaded.current = true
    reloadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, draft.providerId])

  const set = (patch: Partial<Draft>): void => {
    setTouched(true)
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const changeProvider = (providerId: string): void => {
    const next = findProvider(providerId)
    setTouched(true)
    setModels([])
    setModelNote({})
    setDraft((prev) => ({
      ...prev,
      providerId,
      baseUrl: next.baseUrl,
      model: next.models[0] ?? ''
    }))
  }

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.ai.saveConfig(patch),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      const justSavedKey = draft.apiKey
      setDraft((prev) => ({ ...prev, apiKey: '' }))
      setTouched(false)
      // 保存后顺手刷新一次模型清单，顺便验证 Key 能否读到列表
      reloadModels({ ...draft, apiKey: justSavedKey } as Draft)
      if (next.ready) {
        // 保存后顺手验证一次，省得用户再点
        test.mutate()
      } else {
        toast.push('已保存，但配置还不完整')
      }
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '保存失败', 'error')
  })

  const test = useMutation({
    mutationFn: () => api.ai.test(),
    onSuccess: (result) => {
      const sample = result.sample ? `「${result.sample}」` : ''
      toast.push(`连接成功 · ${result.model} ${sample}`)
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '连接失败', 'error')
  })

  // 开关属于「改了立刻生效」，单独提交，避免用户以为已经关掉
  const toggleConfirm = useMutation({
    mutationFn: (next: boolean) => api.ai.saveConfig({ confirmWrites: next }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ai-config'] }),
    onError: (err) => toast.push(err instanceof ApiError ? err.message : '保存失败', 'error')
  })

  const pending = save.isPending || test.isPending

  const submit = (): void => {
    const patch: Record<string, unknown> = {
      providerId: draft.providerId,
      baseUrl: draft.baseUrl,
      model: draft.model,
      temperature: draft.temperature,
      confirmWrites: draft.confirmWrites,
      extraPrompt: draft.extraPrompt
    }
    if (draft.apiKey) patch.apiKey = draft.apiKey
    save.mutate(patch)
  }

  const modelOptions: ComboboxOption[] = models.map((item) => ({
    value: item.id,
    label: item.label ? `${item.id} · ${item.label}` : item.id,
    hint: item.hint
  }))
  // 远端清单已经拿到时就不必再摆预设 chips，避免混淆
  const suggestions = (models.length ? [] : preset.models).filter((model) => model !== draft.model)
  const canReadModels =
    Boolean(draft.baseUrl.trim()) &&
    (Boolean(draft.apiKey) || Boolean(config?.hasApiKey) || Boolean(preset.local))

  return (
    <div>
      <div className="grid gap-3 pb-4" style={{ borderBottom: '1px solid var(--hair)' }}>
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <Field label="模型服务商" hint={preset.note}>
            <Select value={draft.providerId} onChange={(e) => changeProvider(e.target.value)}>
              {AI_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="模型"
            hint={
              models.length
                ? '列表由服务商实时返回，可搜索，也可直接输入'
                : '填服务商文档里的模型标识，或点下方读取'
            }
          >
            <Combobox
              value={draft.model}
              onChange={(next) => set({ model: next })}
              options={modelOptions}
              allowCreate
              createHint="使用这个模型名"
              emptyText="没有匹配项，可直接输入模型名"
              placeholder={preset.models[0] ?? 'model-name'}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {suggestions.length ? (
            <>
              <span className="text-[11px] text-t3">预设常用</span>
              {suggestions.map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => set({ model })}
                  className="rounded-full px-2 py-0.5 text-[11px] text-t2 transition-colors duration-fast hover:bg-sunken hover:text-t1"
                  style={{ border: '1px solid var(--hair)' }}
                >
                  {model}
                </button>
              ))}
            </>
          ) : (
            <span className="text-[11.5px] text-t3">
              {models.length
                ? `已读取 ${models.length} 个可用模型${modelNote.latency ? ` · ${modelNote.latency} ms` : ''}`
                : modelNote.error
                  ? '未能读取列表'
                  : '还没有读取模型清单'}
            </span>
          )}
          <Button
            className="ml-auto h-7 px-2.5 text-[12px]"
            disabled={loadModels.isPending || !canReadModels}
            onClick={() => reloadModels()}
            title={canReadModels ? '按当前 Key 读取服务商开放的模型' : '先填写接口地址与 API Key'}
          >
            <RefreshCw
              size={12}
              strokeWidth={1.8}
              className={loadModels.isPending ? 'animate-spin' : undefined}
            />
            {loadModels.isPending ? '读取中…' : models.length ? '刷新模型' : '读取可用模型'}
          </Button>
        </div>

        {modelNote.error ? (
          <p className="-mt-1 text-[11.5px] leading-relaxed text-warn">
            {modelNote.error}
          </p>
        ) : null}

        <Field label="接口地址" hint="OpenAI 兼容时结尾是 /v1，不要带 /chat/completions">
          <Input
            value={draft.baseUrl}
            onChange={(e) => set({ baseUrl: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
            spellCheck={false}
            className="mono"
          />
        </Field>

        <Field
          label="API Key"
          hint={
            preset.local
              ? '本地模型通常不需要，留空即可'
              : config?.hasApiKey
                ? '已保存，留空则不修改'
                : '只保存在本机，不会同步到任何服务器'
          }
        >
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={draft.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder={config?.hasApiKey ? '••••••••••••' : 'sk-...'}
              autoComplete="new-password"
              className="min-w-0 flex-1"
            />
            {preset.keyUrl ? (
              <Button onClick={() => void api.ai.openKeyUrl(preset.keyUrl!)}>
                <ExternalLink size={13} strokeWidth={1.6} />
                申请
              </Button>
            ) : null}
          </div>
        </Field>

        <div className="grid grid-cols-[160px_1fr] gap-3">
          <Field label="温度" hint="0 更稳定，1 更发散">
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={draft.temperature}
              onChange={(e) => set({ temperature: Number(e.target.value) })}
            />
          </Field>
          <Field label="补充说明" hint="会拼进系统提示词，例如「型号一律写厂商前缀」">
            <Input
              value={draft.extraPrompt}
              onChange={(e) => set({ extraPrompt: e.target.value })}
              placeholder="选填，最多 4000 字"
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[12.5px] text-t1">改动库存前先让我确认</p>
          <p className="mt-0.5 text-[11.5px] text-t3">
            开启后，助手每次入库/出库/盘点都会先弹出明细，点「执行」才真正写入
          </p>
        </div>
        <div className="ml-auto">
          <Switch
            checked={draft.confirmWrites}
            onChange={(next) => {
              setDraft((prev) => ({ ...prev, confirmWrites: next }))
              toggleConfirm.mutate(next)
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-1" style={{ borderTop: '1px solid var(--hair)', paddingTop: 14 }}>
        <Button variant="primary" onClick={submit} disabled={pending}>
          <Sparkles size={13} strokeWidth={1.7} />
          {save.isPending ? '保存中…' : '保存并测试连接'}
        </Button>
        <Button onClick={() => test.mutate()} disabled={pending || !config?.ready}>
          {test.isPending ? '测试中…' : '测试连接'}
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-t3">
          {config?.hasApiKey ? (
            <>
              <ShieldCheck size={12} strokeWidth={1.6} />
              {config.encrypted ? 'Key 已用系统密钥加密' : 'Key 未加密（系统密钥环不可用）'}
            </>
          ) : (
            <>
              <KeyRound size={12} strokeWidth={1.6} />
              {config?.ready ? '本地模型，无需 Key' : '尚未配置 Key'}
            </>
          )}
        </span>
      </div>

      <p className="pt-2 text-[11.5px] leading-relaxed text-t3">
        请求由本机直接发往服务商，BoxFlow 不做中转；只有你主动提问时才会联网。模型清单按当前 Key 实时读取，
        服务商上新或下线模型都不用升级软件；个别网关没开放该接口时，直接手填模型名即可。
      </p>
    </div>
  )
}
