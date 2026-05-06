import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Message } from '@/types'
import { resolveDepartmentFloor } from '@/services/directives'
import { exportTask, exportAllTasks } from '@/services/exportService'
import { generateDailyReport, generateDepartmentReport } from '@/services/dailyReportService'
import { runTask, approveAndFinalize, rejectAndNotify } from '@/services/agentOrchestrator'
import MessageContent from '@/components/layout/MessageContent'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { DEPARTMENTS, DIVISIONS, Task, type DepartmentId, type DepartmentResult, type TaskReview } from '@/types'
import { formatShortDateTime, formatFullDateTime } from '@/utils/dateFormat'
import { repairLegacyTaskTitle } from '@/utils/taskTitle'

type TaskFilter = 'all' | Task['status']

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '대기' },
  { id: 'in_progress', label: '진행 중' },
  { id: 'awaiting_approval', label: '승인 대기' },
  { id: 'completed', label: '완료' },
  { id: 'failed', label: '실패' },
]

const STATUS_LABEL: Record<Task['status'], string> = {
  pending: '대기',
  in_progress: '진행 중',
  awaiting_approval: '승인 대기',
  completed: '완료',
  failed: '실패',
}

const STATUS_COLOR: Record<Task['status'], { border: string; bg: string; text: string; dot: string }> = {
  pending:           { border: 'border-l-office-text/30', bg: 'bg-office-text/5',   text: 'text-office-text/60',  dot: 'bg-office-text/40' },
  in_progress:       { border: 'border-l-office-active',  bg: 'bg-office-active/10', text: 'text-office-active',   dot: 'bg-office-active' },
  awaiting_approval: { border: 'border-l-yellow-400',     bg: 'bg-yellow-500/10',    text: 'text-yellow-400',      dot: 'bg-yellow-400' },
  completed:         { border: 'border-l-emerald-400',    bg: 'bg-emerald-500/10',   text: 'text-emerald-400',     dot: 'bg-emerald-400' },
  failed:            { border: 'border-l-red-400',        bg: 'bg-red-500/10',       text: 'text-red-400',         dot: 'bg-red-400' },
}

// 진행 단계 (pending→in_progress→awaiting_approval or completed/failed)
const STEPS: Task['status'][] = ['pending', 'in_progress', 'awaiting_approval', 'completed']
function stepIndex(status: Task['status']): number {
  if (status === 'failed') return -1
  return STEPS.indexOf(status)
}

export default function TasksView() {
  const {
    tasks,
    messages,
    setActiveView,
    setCurrentFloor,
    setActiveThreadId,
    activeThreadId,
  } = useAgentStore(
    useShallow((s) => ({
      tasks: s.tasks,
      messages: s.messages,
      setActiveView: s.setActiveView,
      setCurrentFloor: s.setCurrentFloor,
      setActiveThreadId: s.setActiveThreadId,
      activeThreadId: s.activeThreadId,
    }))
  )
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [reportMenuOpen, setReportMenuOpen] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const reportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reportMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) {
        setReportMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [reportMenuOpen])

  const handleDailyReport = async () => {
    if (isGeneratingReport) return
    setIsGeneratingReport(true)
    try { await generateDailyReport(tasks, messages) } finally { setIsGeneratingReport(false) }
  }

  const handleDeptReport = async (deptId: DepartmentId) => {
    setReportMenuOpen(false)
    if (isGeneratingReport) return
    setIsGeneratingReport(true)
    try { await generateDepartmentReport(deptId, tasks, messages) } finally { setIsGeneratingReport(false) }
  }

  const rootTasks = useMemo(() => tasks.filter((t) => !t.revisionOf), [tasks])

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const c: Record<Task['status'], number> = { pending: 0, in_progress: 0, awaiting_approval: 0, completed: 0, failed: 0 }
    for (const t of rootTasks) c[t.status] = (c[t.status] ?? 0) + 1
    return c
  }, [rootTasks])

  const filteredTasks = useMemo(() => {
    const sorted = [...rootTasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return filter === 'all' ? sorted : sorted.filter((t) => t.status === filter)
  }, [filter, rootTasks])

  useEffect(() => {
    if (filteredTasks.length === 0) { setSelectedTaskId(null); return }
    if (!selectedTaskId || !filteredTasks.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0].id)
    }
  }, [filteredTasks, selectedTaskId])

  const selectedTask = filteredTasks.find((t) => t.id === selectedTaskId) ?? null

  const revisionsByRoot = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.revisionOf) continue
      const list = map.get(t.revisionOf) ?? []
      list.push(t)
      map.set(t.revisionOf, list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))
    }
    return map
  }, [tasks])

  return (
    <section className="flex flex-1 overflow-hidden bg-office-bg">
      {/* ── 왼쪽 패널 ── */}
      <div className={`shrink-0 border-r border-office-panel bg-office-sidebar flex flex-col w-full md:w-[360px] ${selectedTask ? 'hidden md:flex' : 'flex'}`}>

        {/* 헤더 */}
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-office-active/70">작업 관리</p>
              <h2 className="mt-0.5 text-xl font-bold text-white">업무 목록</h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('office')}
              className="shrink-0 rounded-lg border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              AI 오피스 →
            </button>
          </div>

          {/* 상태별 통계 카드 */}
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {([
              { key: 'in_progress', label: '진행' },
              { key: 'awaiting_approval', label: '승인대기' },
              { key: 'completed', label: '완료' },
              { key: 'failed', label: '실패' },
            ] as { key: Task['status']; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-xl border p-2 text-center transition-colors ${
                  filter === key
                    ? `${STATUS_COLOR[key].bg} border-current ${STATUS_COLOR[key].text}`
                    : 'border-office-panel/50 bg-office-panel/30 hover:bg-office-panel/60'
                }`}
              >
                <p className={`text-lg font-bold ${STATUS_COLOR[key].text}`}>{statusCounts[key]}</p>
                <p className="text-[10px] text-office-text/50 mt-0.5">{label}</p>
              </button>
            ))}
          </div>

          {/* 내보내기/보고서 */}
          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => exportAllTasks(tasks)}
              disabled={tasks.length === 0}
              className="flex-1 rounded-lg border border-office-panel/70 bg-office-panel px-2 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
            >
              내보내기
            </button>
            <div ref={reportMenuRef} className="relative flex flex-1">
              <button
                type="button"
                onClick={() => void handleDailyReport()}
                disabled={isGeneratingReport || tasks.length === 0}
                className="flex-1 rounded-l-lg border border-office-panel/70 bg-office-panel px-2 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
              >
                {isGeneratingReport ? '생성 중…' : '보고서'}
              </button>
              <button
                type="button"
                onClick={() => setReportMenuOpen((v) => !v)}
                disabled={isGeneratingReport || tasks.length === 0}
                className="rounded-r-lg border border-l-0 border-office-panel/70 bg-office-panel px-2 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
              >
                ▾
              </button>
              {reportMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-office-panel bg-office-sidebar shadow-2xl">
                  {Object.values(DIVISIONS).map((div) => {
                    const depts = Object.values(DEPARTMENTS).filter((d) => d.divisionId === div.id)
                    if (depts.length === 0) return null
                    return (
                      <div key={div.id}>
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-office-text/40">{div.name}</p>
                        {depts.map((dept) => (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => void handleDeptReport(dept.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-office-text transition-colors hover:bg-office-panel/70 hover:text-white"
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dept.color }} />
                            {dept.name}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 필터 탭 */}
          <div className="mt-3 flex gap-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`flex-1 whitespace-nowrap rounded-full border py-1 text-[11px] transition-colors ${
                  filter === item.id
                    ? 'border-office-active bg-office-active/20 text-office-active'
                    : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 태스크 목록 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-2">
          {filteredTasks.length > 0 ? filteredTasks.map((task) => {
            const sc = STATUS_COLOR[task.status]
            const revCount = revisionsByRoot.get(task.id)?.length ?? 0
            const { title } = repairLegacyTaskTitle(task)
            const isSelected = selectedTaskId === task.id

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className={`w-full rounded-xl border-l-[3px] border border-office-panel/60 text-left transition-all ${sc.border} ${
                  isSelected ? 'bg-office-active/10 border-office-active/40' : 'bg-office-panel/40 hover:bg-office-panel/70'
                }`}
              >
                {/* 상단 행: 상태 뱃지 + 시간 */}
                <div className="flex items-center justify-between gap-2 px-3 pt-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                    {STATUS_LABEL[task.status]}
                  </span>
                  <span className="text-[10px] text-office-text/40">{formatShortDateTime(task.createdAt)}</span>
                </div>

                {/* 제목 */}
                <p className="mt-2 px-3 text-sm font-semibold text-white leading-snug line-clamp-2">{title}</p>

                {/* 부서 컬러 점 + 이름 */}
                <div className="mt-2 px-3 flex flex-wrap gap-x-2 gap-y-1">
                  {task.assignedTo.length > 0 ? task.assignedTo.map((deptId) => {
                    const dept = DEPARTMENTS[deptId]
                    return (
                      <span key={deptId} className="flex items-center gap-1 text-[10px] text-office-text/60">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: dept.color }} />
                        {dept.name}
                      </span>
                    )
                  }) : <span className="text-[10px] text-office-text/40">미배정</span>}
                </div>

                {/* 진행 단계 바 */}
                {task.status !== 'failed' && (
                  <div className="mt-2 px-3 flex gap-0.5">
                    {STEPS.map((s, i) => (
                      <div
                        key={s}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= stepIndex(task.status)
                            ? (task.status === 'completed' ? 'bg-emerald-400' : 'bg-office-active')
                            : 'bg-office-panel/60'
                        }`}
                      />
                    ))}
                  </div>
                )}
                {task.status === 'failed' && (
                  <div className="mt-2 px-3">
                    <div className="h-1 w-full rounded-full bg-red-500/50" />
                  </div>
                )}

                {/* 하단 뱃지 행 */}
                <div className="mt-2 pb-3 px-3 flex flex-wrap gap-1.5">
                  {task.approvalReasons?.slice(0, 2).map((reason) => (
                    <span key={reason.id} className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-300">
                      {reason.label}
                    </span>
                  ))}
                  {(task.approvalReasons?.length ?? 0) > 2 && (
                    <span className="text-[10px] text-office-text/40">+{(task.approvalReasons?.length ?? 0) - 2}</span>
                  )}
                  {revCount > 0 && (
                    <span className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300">
                      v{revCount + 1}
                    </span>
                  )}
                  {(task.status === 'completed' || task.status === 'awaiting_approval') && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveThreadId(task.threadId ?? task.id); setActiveView('office') }}
                      className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                        activeThreadId === (task.threadId ?? task.id)
                          ? 'border-office-active bg-office-active/20 text-office-active'
                          : 'border-office-panel/60 text-office-text/50 hover:border-office-active hover:text-white'
                      }`}
                    >
                      이어진 작업
                    </button>
                  )}
                </div>
              </button>
            )
          }) : (
            <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-8 text-center">
              {filter === 'all' ? (
                <>
                  <p className="text-sm text-office-text/50">아직 업무가 없습니다.</p>
                  <p className="mb-4 mt-1 text-xs text-office-text/30">AI 오피스에서 에이전트에게 업무를 지시해 보세요.</p>
                  <button
                    type="button"
                    onClick={() => setActiveView('office')}
                    className="rounded border border-office-active/40 bg-office-active/10 px-3 py-1.5 text-xs text-office-active transition-colors hover:bg-office-active/20"
                  >
                    AI 오피스로 이동
                  </button>
                </>
              ) : (
                <p className="text-sm text-office-text/50">조건에 맞는 업무가 없습니다.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 오른쪽 디테일 ── */}
      <div className={`flex-1 overflow-y-auto p-6 flex flex-col ${!selectedTask ? 'hidden md:flex' : ''}`}>
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            revisions={revisionsByRoot.get(selectedTask.id) ?? []}
            onBack={() => setSelectedTaskId(null)}
            onOpenOffice={() => {
              const [firstDept] = selectedTask.assignedTo
              if (firstDept) setCurrentFloor(resolveDepartmentFloor(firstDept))
              setActiveView('office')
            }}
            onOpenChat={() => setActiveView('chat')}
            onApprove={() => void approveAndFinalize(selectedTask.id)}
            onReject={(reason) => void rejectAndNotify(selectedTask.id, reason)}
          />
        ) : (
          <div className="flex w-full h-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-office-panel/70 bg-office-sidebar">
            <p className="text-sm text-office-text/50">표시할 업무가 없습니다.</p>
            <button
              type="button"
              onClick={() => setActiveView('office')}
              className="rounded border border-office-active/40 bg-office-active/10 px-4 py-2 text-sm text-office-active transition-colors hover:bg-office-active/20"
            >
              AI 오피스에서 첫 업무 시작하기
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

// ── TaskDetail ────────────────────────────────────────────────────────────────
function TaskDetail({
  task, revisions, onBack, onOpenOffice, onOpenChat, onApprove, onReject,
}: {
  task: Task
  revisions: Task[]
  onBack: () => void
  onOpenOffice: () => void
  onOpenChat: () => void
  onApprove: () => void
  onReject: (reason?: string) => void
}) {
  const [revisionInput, setRevisionInput] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [isRevising, setIsRevising] = useState(false)
  const [versionTab, setVersionTab] = useState<number | null>(null)
  const { title } = repairLegacyTaskTitle(task)
  const sc = STATUS_COLOR[task.status]

  useEffect(() => {
    setVersionTab(revisions.length > 0 ? revisions.length - 1 : null)
  }, [revisions.length])

  const viewedTask = versionTab !== null ? (revisions[versionTab] ?? task) : task

  const handleRevision = async () => {
    if (!revisionInput.trim() || isRevising) return
    const feedback = revisionInput.trim()
    setRevisionInput('')
    setIsRevising(true)
    onReject(feedback)
    const latestResult = revisions.at(-1)?.result ?? task.result
    const prompt = ['[재작업 요청]', `원본 업무: ${title}`, `수정 요청: ${feedback}`, latestResult ? `\n[이전 결과 참고]\n${latestResult.slice(0, 1500)}` : ''].filter(Boolean).join('\n')
    try { await runTask(prompt, task.attachments ?? [], undefined, { revisionOf: task.id }) }
    finally { setIsRevising(false) }
  }

  function handleRejectConfirm() {
    onReject(rejectReason.trim() || undefined)
    setShowRejectInput(false)
    setRejectReason('')
  }

  return (
    <div className="mx-auto max-w-4xl w-full space-y-5">
      <button type="button" onClick={onBack} className="md:hidden mb-2 flex items-center gap-2 text-sm text-office-active">
        ← 목록으로
      </button>

      {/* 승인 대기 배너 */}
      {task.status === 'awaiting_approval' && (
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5">
          <p className="text-sm font-semibold text-yellow-300">⚡ AI 결과물 검토 필요</p>
          <p className="mt-1 text-xs text-yellow-200/70">승인하면 외부 알림·저장·자동 후속 업무가 실행됩니다.</p>
          {task.approvalReasons && task.approvalReasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {task.approvalReasons.map((r) => (
                <span key={r.id} title={r.description} className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-100">{r.label}</span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onApprove} className="rounded-lg border border-green-500/50 bg-green-500/20 px-4 py-2 text-sm font-semibold text-green-300 transition-colors hover:bg-green-500/30">✅ 승인 (완료 처리)</button>
            <button type="button" onClick={() => setShowRejectInput((v) => !v)} className="rounded-lg border border-red-500/50 bg-red-500/20 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/30">❌ 거절</button>
          </div>
          {showRejectInput && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRejectConfirm() }}
                placeholder="거절 사유 입력 (선택)"
                autoFocus
                className="flex-1 rounded-lg border border-red-500/30 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/40 focus:border-red-400 focus:outline-none"
              />
              <button type="button" onClick={handleRejectConfirm} className="rounded-lg border border-red-500/50 bg-red-500/20 px-3 py-2 text-sm text-red-300">확인</button>
              <button type="button" onClick={() => { setShowRejectInput(false); setRejectReason('') }} className="rounded-lg border border-office-panel/50 px-3 py-2 text-sm text-office-text/50">취소</button>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={revisionInput}
              onChange={(e) => setRevisionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleRevision() }}
              placeholder="수정 요청 → 거절 후 재작업 실행"
              disabled={isRevising}
              className="flex-1 rounded-lg border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/40 focus:border-office-active focus:outline-none disabled:opacity-50"
            />
            <button type="button" onClick={() => void handleRevision()} disabled={!revisionInput.trim() || isRevising} className="rounded-lg border border-office-active/40 bg-office-active/10 px-3 py-2 text-sm text-office-active transition-colors hover:bg-office-active/20 disabled:opacity-40">
              {isRevising ? '재작업 중...' : '재작업 요청'}
            </button>
          </div>
        </div>
      )}

      {/* 태스크 헤더 카드 */}
      <div className="rounded-2xl border border-office-panel bg-office-sidebar overflow-hidden">
        {/* 컬러 상태 바 */}
        <div className={`h-1 w-full ${sc.dot}`} />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* 상태 + 진행 단계 */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${sc.bg} ${sc.text}`}>
                  <span className={`h-2 w-2 rounded-full ${sc.dot} ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                  {STATUS_LABEL[task.status]}
                </span>
                {/* 단계 표시 */}
                {task.status !== 'failed' && (
                  <div className="flex items-center gap-1">
                    {STEPS.map((s, i) => (
                      <div key={s} className="flex items-center gap-1">
                        <div className={`h-2 w-2 rounded-full ${i <= stepIndex(task.status) ? sc.dot : 'bg-office-panel/60'}`} />
                        {i < STEPS.length - 1 && (
                          <div className={`h-px w-4 ${i < stepIndex(task.status) ? sc.dot : 'bg-office-panel/40'}`} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <h3 className="mt-3 text-xl font-bold text-white leading-snug">{title}</h3>
              <p className="mt-1 text-xs text-office-text/50">생성 {formatFullDateTime(task.createdAt)}</p>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <button type="button" onClick={onOpenOffice} className="rounded-lg border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white">오피스에서 보기</button>
              <button type="button" onClick={onOpenChat} className="rounded-lg border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white">팀 채팅 보기</button>
              <button type="button" onClick={() => exportTask(task)} className="rounded-lg border border-office-active/40 bg-office-active/10 px-3 py-2 text-xs text-office-active transition-colors hover:bg-office-active/20">텍스트로 저장</button>
            </div>
          </div>

          {/* 담당 부서 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {task.assignedTo.map((deptId) => {
              const dept = DEPARTMENTS[deptId]
              return (
                <span key={deptId} className="inline-flex items-center gap-1.5 rounded-full border border-office-panel/70 bg-office-panel/50 px-3 py-1 text-xs text-office-text">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dept.color }} />
                  {dept.name}
                </span>
              )
            })}
          </div>

          {/* 승인 이유 뱃지 */}
          {task.approvalReasons && task.approvalReasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {task.approvalReasons.map((r) => (
                <span key={r.id} title={r.description} className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] text-yellow-200">{r.label}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 요청 설명 */}
      <SectionCard title="📋 요청 설명">
        <pre className="whitespace-pre-wrap font-inherit text-sm text-office-text leading-relaxed">{task.description}</pre>
      </SectionCard>

      {/* 첨부 파일 */}
      {task.attachments && task.attachments.length > 0 && (
        <SectionCard title="📎 첨부 파일">
          <div className="space-y-2">
            {task.attachments.map((f) => (
              <div key={f.id} className="flex items-start gap-3 rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-3">
                <span className="text-lg">📄</span>
                <div>
                  <p className="text-sm font-semibold text-white">{f.name}</p>
                  {f.summary && <p className="mt-0.5 text-xs text-office-text/60">{f.summary}</p>}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 교차 검토 */}
      {task.reviews && task.reviews.length > 0 && <ReviewsSection reviews={task.reviews} />}

      {/* 버전 히스토리 */}
      {revisions.length > 0 && (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-purple-300">🔄 버전 히스토리</p>
            <span className="text-xs text-office-text/40">{revisions.length + 1}개 버전</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setVersionTab(null)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${versionTab === null ? 'border-purple-400 bg-purple-400/20 text-purple-200' : 'border-office-panel/60 text-office-text/50 hover:border-purple-400/60 hover:text-purple-200'}`}>
              v1 원본 <span className={`ml-1 text-[10px] ${sc.text}`}>{STATUS_LABEL[task.status]}</span>
            </button>
            {revisions.map((rev, idx) => (
              <button key={rev.id} type="button" onClick={() => setVersionTab(idx)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${versionTab === idx ? 'border-purple-400 bg-purple-400/20 text-purple-200' : 'border-office-panel/60 text-office-text/50 hover:border-purple-400/60 hover:text-purple-200'}`}>
                v{idx + 2} 수정 <span className={`ml-1 text-[10px] ${STATUS_COLOR[rev.status].text}`}>{STATUS_LABEL[rev.status]}</span>
              </button>
            ))}
          </div>
          {versionTab !== null && revisions[versionTab] && (
            <p className="mt-2 text-xs text-office-text/40">{formatFullDateTime(revisions[versionTab].createdAt)} 생성</p>
          )}
        </div>
      )}

      {/* 실행 결과 */}
      <DepartmentResultsSection departmentResults={viewedTask.departmentResults} fallbackResult={viewedTask.result} />

      {/* 모델 토론 */}
      <ModelDebateSection taskId={viewedTask.id} />
    </div>
  )
}

// ── 부서별 실행 결과 ──────────────────────────────────────────────────────────
function DepartmentResultsSection({
  departmentResults, fallbackResult,
}: { departmentResults?: DepartmentResult[]; fallbackResult?: string }) {
  const hasDeptResults = departmentResults !== undefined && departmentResults.length > 1
  const [activeTab, setActiveTab] = useState(0)
  const prevLen = useRef(departmentResults?.length ?? 0)

  useEffect(() => {
    if ((departmentResults?.length ?? 0) !== prevLen.current) {
      setActiveTab(0)
      prevLen.current = departmentResults?.length ?? 0
    }
  }, [departmentResults])

  if (hasDeptResults && departmentResults) {
    const safe = Math.min(activeTab, departmentResults.length - 1)
    const cur = departmentResults[safe]
    const dept = DEPARTMENTS[cur.deptId]
    const deptName = dept?.name ?? cur.deptId

    return (
      <div className="rounded-2xl border border-office-panel bg-office-sidebar overflow-hidden">
        <div className="border-b border-office-panel px-6 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">📊 부서별 실행 결과</p>
          <span className="text-xs text-office-text/40">{departmentResults.length}개 부서</span>
        </div>
        {/* 부서 탭 */}
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          {departmentResults.map((r, i) => {
            const d = DEPARTMENTS[r.deptId]
            return (
              <button
                key={r.deptId}
                type="button"
                onClick={() => setActiveTab(i)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  safe === i ? 'border-office-active bg-office-active/20 text-office-active' : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                }`}
              >
                {d && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />}
                {d?.name ?? r.deptId}
              </button>
            )
          })}
        </div>
        <div className="px-6 pb-6 pt-4">
          <p className="mb-3 text-xs text-office-text/50">
            <span className="inline-flex items-center gap-1.5">
              {dept && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dept.color }} />}
              {deptName}
            </span>
            {cur.agentName && <span className="ml-1">· {cur.agentName}</span>}
          </p>
          <div className="max-h-[600px] overflow-y-auto text-sm rounded-xl border border-office-panel/50 bg-office-panel/20 p-4">
            <MessageContent content={cur.content} />
          </div>
        </div>
      </div>
    )
  }

  const content = departmentResults?.[0]?.content ?? fallbackResult
  return (
    <SectionCard title="📊 실행 결과">
      {content ? (
        <div className="max-h-[600px] overflow-y-auto text-sm rounded-xl border border-office-panel/50 bg-office-panel/20 p-4">
          <MessageContent content={content} />
        </div>
      ) : (
        <p className="text-sm text-office-text/50">아직 결과가 기록되지 않았습니다.</p>
      )}
    </SectionCard>
  )
}

// ── 모델 토론 ─────────────────────────────────────────────────────────────────
function ModelDebateSection({ taskId }: { taskId: string }) {
  const messages = useAgentStore((s) => s.messages)
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  const debateMessages = useMemo(
    () => messages.filter((m): m is Message & { taskId: string } => m.taskId === taskId && m.type === 'debate'),
    [messages, taskId],
  )
  if (debateMessages.length === 0) return null

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-violet-300">🧠 모델 토론 기록</p>
        <span className="text-xs text-office-text/40">{debateMessages.length}건</span>
      </div>
      <div className="mt-3 space-y-2">
        {debateMessages.map((msg, idx) => {
          const isOpen = openIdx === idx
          return (
            <div key={msg.id} className={`rounded-xl border transition-colors ${isOpen ? 'border-violet-500/40 bg-violet-500/10' : 'border-office-panel/60 bg-office-panel/30'}`}>
              <button type="button" onClick={() => setOpenIdx(isOpen ? null : idx)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className={`text-xs font-semibold ${isOpen ? 'text-violet-200' : 'text-office-text/70'}`}>{msg.senderName}</span>
                <span className="shrink-0 text-[10px] text-office-text/30">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-violet-500/20 px-4 pb-4 pt-3">
                  <div className="max-h-64 overflow-y-auto text-xs text-office-text/80">
                    <MessageContent content={msg.content} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 교차 검토 ─────────────────────────────────────────────────────────────────
function ReviewsSection({ reviews }: { reviews: TaskReview[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-emerald-300">✅ 교차 검토 결과</p>
        <span className="text-xs text-office-text/40">{reviews.length}건</span>
      </div>
      <div className="mt-3 space-y-2">
        {reviews.map((review, idx) => {
          const dept = DEPARTMENTS[review.reviewerId]
          const isOpen = openIdx === idx
          return (
            <div key={review.id} className={`rounded-xl border transition-colors ${isOpen ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-office-panel/60 bg-office-panel/30'}`}>
              <button type="button" onClick={() => setOpenIdx(isOpen ? null : idx)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dept?.color ?? '#888' }} />
                  <span className="text-xs font-semibold text-white">{review.reviewerName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-office-text/40">{formatShortDateTime(review.createdAt)}</span>
                  <span className="text-xs text-office-text/40">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-office-panel/40 px-4 py-3">
                  <div className="max-h-80 overflow-y-auto text-sm">
                    <MessageContent content={review.content} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}
