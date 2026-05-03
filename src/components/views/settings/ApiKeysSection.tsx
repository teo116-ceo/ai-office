import { useState } from 'react'
import { apiHeaders } from '@/utils/apiHeaders'
import type { ProviderId } from '@/types'
import { SectionCard } from './SettingsPrimitives'

interface Props {
  providerKeyStatus: Record<ProviderId, boolean>
  onStatusChange: (status: Record<ProviderId, boolean>) => void
}

const PROVIDERS: Array<{ id: ProviderId; label: string; placeholder: string; prefix: string }> = [
  { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-api03-...', prefix: 'sk-ant-' },
  { id: 'openai',    label: 'OpenAI (GPT)',       placeholder: 'sk-proj-...',       prefix: 'sk-'     },
  { id: 'gemini',    label: 'Google (Gemini)',     placeholder: 'AIza...',           prefix: 'AIza'    },
]

export default function ApiKeysSection({ providerKeyStatus, onStatusChange }: Props) {
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ anthropic: '', openai: '', gemini: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [show, setShow] = useState<Record<ProviderId, boolean>>({ anthropic: false, openai: false, gemini: false })

  function setKey(id: ProviderId, value: string) {
    setKeys((prev) => ({ ...prev, [id]: value }))
  }

  function toggleShow(id: ProviderId) {
    setShow((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSave() {
    const hasAnyInput = Object.values(keys).some((v) => v.trim().length > 0)
    if (!hasAnyInput) {
      setMsg({ text: '변경할 키를 하나 이상 입력하세요.', ok: false })
      return
    }

    setSaving(true)
    setMsg(null)

    try {
      const body: Record<string, string> = {}
      if (keys.anthropic.trim()) body.anthropic = keys.anthropic.trim()
      if (keys.openai.trim()) body.openai = keys.openai.trim()
      if (keys.gemini.trim()) body.gemini = keys.gemini.trim()

      const response = await fetch('/api/provider-keys', {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      const data = await response.json() as { ok?: boolean; error?: string }

      if (!response.ok || !data.ok) throw new Error(data.error ?? '저장 실패')

      setKeys({ anthropic: '', openai: '', gemini: '' })
      setMsg({ text: 'API 키가 저장되었습니다.', ok: true })

      const statusRes = await fetch('/api/provider-status')
      if (statusRes.ok) {
        const statusData = await statusRes.json() as { providers?: Record<ProviderId, boolean> }
        if (statusData.providers) onStatusChange(statusData.providers)
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : '저장 실패', ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  return (
    <SectionCard
      title="AI API 키"
      description="Claude, GPT, Gemini API 키를 추가하거나 교체합니다. 입력한 키만 업데이트되며 빈 칸은 기존 키를 유지합니다."
    >
      <div className="space-y-3">
        {PROVIDERS.map(({ id, label, placeholder }) => {
          const connected = providerKeyStatus[id]
          return (
            <div key={id} className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{label}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    connected
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-office-panel text-office-text/40'
                  }`}
                >
                  {connected ? '연결됨' : '미입력'}
                </span>
              </div>
              <div className="relative">
                <input
                  type={show[id] ? 'text' : 'password'}
                  value={keys[id]}
                  onChange={(e) => setKey(id, e.target.value)}
                  placeholder={connected ? '새 키를 입력하면 교체됩니다' : placeholder}
                  className="w-full rounded border border-office-panel/50 bg-office-panel py-2 pl-3 pr-10 text-sm text-office-text placeholder-office-text/30 focus:border-office-active focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => toggleShow(id)}
                  title={show[id] ? '숨기기' : '표시'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-office-text/40 hover:text-office-text/80"
                >
                  {show[id] ? '숨김' : '표시'}
                </button>
              </div>
            </div>
          )
        })}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg border border-office-active/60 bg-office-active/20 px-4 py-2 text-sm font-semibold text-office-active transition-colors hover:bg-office-active/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          {msg ? (
            <span className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</span>
          ) : null}
        </div>
      </div>
    </SectionCard>
  )
}
