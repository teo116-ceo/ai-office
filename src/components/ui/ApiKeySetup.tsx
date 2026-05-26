import { useState } from 'react'
import { apiHeaders } from '@/utils/apiHeaders'

interface Props {
  onSaved: () => void
}

export default function ApiKeySetup({ onSaved }: Props) {
  const [anthropic, setAnthropic] = useState('')
  const [openai, setOpenai] = useState('')
  const [gemini, setGemini] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!anthropic && !openai && !gemini) {
      setError('최소 1개의 API 키를 입력하세요.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (window.electronAPI) {
        // 재시작 후 자동 로그인을 위해 세션 토큰 임시 저장
        const token = sessionStorage.getItem('ai-office-session-token')
        if (token) await window.electronAPI.saveSessionForRelaunch(token)
        await window.electronAPI.saveApiKeys({ anthropic, openai, gemini })
      } else {
        const response = await fetch('/api/provider-keys', {
          method: 'POST',
          headers: apiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ anthropic, openai, gemini }),
        })
        const data = await response.json() as { ok?: boolean; error?: string }
        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? 'API 키 저장 실패')
        }
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
      setSaving(false)
    }
  }

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-[#0d0d1a]">
      <form
        onSubmit={(e) => { void handleSubmit(e) }}
        className="flex w-96 flex-col gap-5 rounded-2xl border border-white/10 bg-[#141428] p-8"
      >
        <div className="text-center">
          <div className="text-2xl font-bold text-white">AI Office</div>
          <div className="mt-1 text-xs text-white/40">
            사용할 AI 제공사의 API 키를 입력하세요. 최소 1개 필요합니다.
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Claude API 키 (Anthropic)</label>
          <input
            type="password"
            value={anthropic}
            onChange={(e) => setAnthropic(e.target.value)}
            placeholder="sk-ant-..."
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">GPT API 키 (OpenAI)</label>
          <input
            type="password"
            value={openai}
            onChange={(e) => setOpenai(e.target.value)}
            placeholder="sk-..."
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Gemini API 키 (Google)</label>
          <input
            type="password"
            value={gemini}
            onChange={(e) => setGemini(e.target.value)}
            placeholder="AIza..."
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/30"
          />
        </div>

        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/40">
          {isElectron
            ? '키는 이 컴퓨터에만 암호화 저장됩니다. 서버로 전송되지 않습니다.'
            : '키는 서버 실행 환경과 .env 파일에 저장됩니다. 저장 후 바로 사용할 수 있습니다.'}
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#ff2d55] py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '저장 중... (앱이 재시작됩니다)' : '저장하고 시작'}
        </button>
      </form>
    </div>
  )
}
