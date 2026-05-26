import { useEffect } from 'react'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { useTaskActions } from '@/hooks/useTaskActions'
import type { Toast, ToastLevel } from '@/types'

const LEVEL_STYLE: Record<Exclude<ToastLevel, 'approval'>, { bar: string; icon: string; label: string }> = {
  error:   { bar: 'bg-red-500',    icon: '✕', label: 'text-red-400' },
  warn:    { bar: 'bg-yellow-500', icon: '⚠', label: 'text-yellow-400' },
  info:    { bar: 'bg-blue-400',   icon: 'ℹ', label: 'text-blue-400' },
  success: { bar: 'bg-green-500',  icon: '✓', label: 'text-green-400' },
}

function ApprovalToastItem({ toast }: { toast: Toast }) {
  const { approve, reject } = useTaskActions()
  const { removeToast } = useAgentStore(
    useShallow((s) => ({
      removeToast: s.removeToast,
    }))
  )
  const taskDescription = useAgentStore((s) =>
    toast.taskId ? s.tasks.find((task) => task.id === toast.taskId)?.description : undefined
  )
  const detailText = taskDescription ?? toast.title

  function handleApprove() {
    if (toast.taskId) approve(toast.taskId)
    removeToast(toast.id)
  }

  function handleReject() {
    if (toast.taskId) reject(toast.taskId)
    removeToast(toast.id)
  }

  return (
    <div className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-yellow-500/40 bg-office-sidebar shadow-2xl sm:w-[28rem]">
      {/* 상단 헤더 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-yellow-500/20 bg-yellow-500/10 px-4 py-2.5">
        <span className="text-sm">🔔</span>
        <p className="flex-1 text-xs font-bold text-yellow-400">AI 결과물 검토 필요</p>
        <button
          type="button"
          onClick={() => removeToast(toast.id)}
          className="text-office-text/40 transition-colors hover:text-white"
          aria-label="닫기"
        >
          <span className="text-xs">✕</span>
        </button>
      </div>

      {/* 본문 */}
      <div className="min-h-0 overflow-y-auto px-4 py-3">
        <p className="break-words text-sm font-semibold leading-snug text-white">{detailText}</p>
        {toast.message && (
          <p className="mt-1 text-xs text-office-text/60 leading-relaxed">{toast.message}</p>
        )}

        {/* 승인 사유 태그 */}
        {toast.approvalReasons && toast.approvalReasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {toast.approvalReasons.map((reason) => (
              <span
                key={reason.id}
                className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-300"
              >
                {reason.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 승인 / 거절 버튼 */}
      <div className="flex shrink-0 border-t border-office-panel">
        <button
          type="button"
          onClick={handleReject}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10"
        >
          <span>✕</span> 거절
        </button>
        <div className="w-px bg-office-panel" />
        <button
          type="button"
          onClick={handleApprove}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-green-400 transition-colors hover:bg-green-500/10"
        >
          <span>✓</span> 승인
        </button>
      </div>
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useAgentStore((s) => s.removeToast)
  const style = LEVEL_STYLE[toast.level as Exclude<ToastLevel, 'approval'>]

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), toast.durationMs ?? 5000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.durationMs, removeToast])

  return (
    <div className="relative flex w-80 overflow-hidden rounded-xl border border-office-panel bg-office-sidebar shadow-2xl">
      <div className={`w-1 shrink-0 ${style.bar}`} />
      <div className="flex flex-1 items-start gap-3 px-4 py-3">
        <span className={`mt-0.5 shrink-0 text-sm font-bold ${style.label}`}>{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{toast.title}</p>
          {toast.message ? (
            <p className="mt-0.5 text-xs text-office-text/70 break-words">{toast.message}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => removeToast(toast.id)}
          className="shrink-0 text-office-text/40 transition-colors hover:text-white"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useAgentStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          {toast.level === 'approval'
            ? <ApprovalToastItem toast={toast} />
            : <ToastItem toast={toast} />
          }
        </div>
      ))}
    </div>
  )
}
