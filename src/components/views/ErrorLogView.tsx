import { useEffect, useState } from 'react'
import {
  subscribeErrorLog,
  getErrorLog,
  clearErrorLog,
  type ErrorLogEntry,
} from '@/services/errorLog'
import { useAgentStore } from '@/store/agentStore'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function StatusBadge({ status }: { status?: number }) {
  if (!status) return null
  const color =
    status >= 500 ? 'bg-red-500/20 text-red-400' :
    status === 429 ? 'bg-orange-500/20 text-orange-400' :
    'bg-yellow-500/20 text-yellow-400'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${color}`}>
      HTTP {status}
    </span>
  )
}

export default function ErrorLogView() {
  const [entries, setEntries] = useState<ErrorLogEntry[]>(() => getErrorLog())
  const setActiveView = useAgentStore((s) => s.setActiveView)

  useEffect(() => {
    return subscribeErrorLog(setEntries)
  }, [])

  const handleClear = () => clearErrorLog()

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-office-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-office-panel px-6 py-4">
        <div>
          <button
            type="button"
            onClick={() => setActiveView('settings')}
            className="mb-1 text-xs text-office-text/40 hover:text-office-active transition-colors"
          >
            ← 설정으로
          </button>
          <h2 className="text-base font-semibold text-white">오류 기록</h2>
          <p className="mt-0.5 text-xs text-office-text/50">
            이번 세션에서 발생한 오류 {entries.length}건 — 앱을 새로고침하면 초기화됩니다.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-red-500/50 hover:text-red-400"
          >
            전체 지우기
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-3 text-4xl">✅</div>
            <p className="text-sm font-medium text-office-text/70">이번 세션에서 오류가 없습니다.</p>
            <p className="mt-1 text-xs text-office-text/40">
              LLM 호출 실패, 에이전트 실행 오류 등이 발생하면 여기에 기록됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-red-400">{entry.source}</span>
                  {entry.model && (
                    <span className="rounded bg-office-panel px-1.5 py-0.5 font-mono text-[10px] text-office-text/60">
                      {entry.model}
                    </span>
                  )}
                  <StatusBadge status={entry.status} />
                  <span className="ml-auto text-[10px] text-office-text/40">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-office-text/80">{entry.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
