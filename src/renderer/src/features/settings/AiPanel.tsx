import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { AI_PROVIDERS, findProvider } from '@shared/ai'
import { api, ApiError } from '@renderer/lib/api'
import { Button, Field, Input, Select, Switch, Textarea, useToast } from '@renderer/components/ui'

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

  const set = (patch: Partial<Draft>): void => {
    setTouched(true)
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  const changeProvider = (providerId: string): void => {
    const next = findProvider(providerId)
    setTouched(true)
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
      setDraft((prev) => ({ ...prev, apiKey: '' }))
      setTouched(false)
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

  const suggestions = preset.models.filter((model) => model !== draft.model)

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
              suggestions.length
                ? '可以直接输入，界面里也有常用项'
                : '填服务商文档里的模型标识'
            }
          >
            <Input
              value={draft.model}
              onChange={(e) => set({ model: e.target.value })}
              placeholder={preset.models[0] ?? 'model-name'}
              spellCheck={false}
              className="mono"
            />
          </Field>
        </div>

        {suggestions.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-t3">常用</span>
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
          </div>
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
        请求由本机直接发往服务商，BoxFlow 不做中转；只有你主动提问时才会联网。模型能力差异较大，建议先用
        「测试连接」确认可用，再到 AI 助手页试一句「现在有哪些物料快没了」。
      </p>
    </div>
  )
}
