import { memo, useState } from 'react'
import { useUpdateStore } from '@/hooks/useUpdater'

export const UpdateBanner = memo(function UpdateBanner() {
  const { status, info, progress, error, dismissed, dismiss, installUpdate } = useUpdateStore()
  const [installing, setInstalling] = useState(false)

  if (dismissed) return null
  if (status === 'idle' || status === 'checking' || status === 'up-to-date') return null
  if (status === 'error' && !error) return null

  const handleInstall = async () => {
    setInstalling(true)
    await installUpdate()
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs">
        <span className="text-red-400">업데이트 오류:</span>
        <span className="flex-1 truncate text-red-300/80">{error}</span>
        <button type="button" onClick={dismiss} className="shrink-0 text-red-400/60 hover:text-red-300">✕</button>
      </div>
    )
  }

  if (status === 'available') {
    return (
      <div className="flex items-center gap-3 border-b border-office-active/30 bg-office-active/10 px-4 py-2 text-xs">
        <span className="shrink-0 text-office-active">↓</span>
        <span className="flex-1 text-office-text/80">
          <span className="font-semibold text-white">v{info?.version}</span> 업데이트 다운로드 중...
        </span>
        <button type="button" onClick={dismiss} className="shrink-0 text-office-text/40 hover:text-white">✕</button>
      </div>
    )
  }

  if (status === 'downloading') {
    return (
      <div className="flex items-center gap-3 border-b border-office-active/30 bg-office-active/10 px-4 py-2 text-xs">
        <span className="shrink-0 text-office-active">↓</span>
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="shrink-0 text-office-text/60">v{info?.version} 다운로드 중</span>
          <div className="flex-1 rounded-full bg-office-panel/60 h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-office-active transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 tabular-nums text-office-active">{progress}%</span>
        </div>
        <button type="button" onClick={dismiss} className="shrink-0 text-office-text/40 hover:text-white">✕</button>
      </div>
    )
  }

  if (status === 'downloaded') {
    return (
      <div className="flex items-center gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs">
        <span className="shrink-0 text-emerald-400">✓</span>
        <span className="flex-1 text-office-text/80">
          <span className="font-semibold text-white">v{info?.version}</span> 업데이트 준비 완료 — 재시작 후 적용됩니다.
        </span>
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={installing}
          className="shrink-0 rounded-md border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {installing ? '재시작 중…' : '지금 재시작'}
        </button>
        <button type="button" onClick={dismiss} className="shrink-0 text-office-text/40 hover:text-white">✕</button>
      </div>
    )
  }

  return null
})
