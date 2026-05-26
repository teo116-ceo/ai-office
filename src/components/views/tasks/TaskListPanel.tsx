import { memo, useEffect, useRef, useState } from 'react'
import { DEPARTMENTS, DIVISIONS, Task, type DepartmentId } from '@/types'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { exportAllTasks } from '@/services/exportService'
import { generateDailyReport, generateDepartmentReport } from '@/services/dailyReportService'
import { formatShortDateTime } from '@/utils/dateFormat'
import { repairLegacyTaskTitle } from '@/utils/taskTitle'
import { FILTERS, STATUS_LABEL, STATUS_COLOR, STEPS, stepIndex, type TaskFilter } from './taskConstants'

interface TaskListPanelProps {
  filter: TaskFilter
  onFilterChange: (f: TaskFilter) => void
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  filteredTasks: Task[]
  statusCounts: Record<Task['status'], number>
  revisionsByRoot: Map<string, Task[]>
  approvalTasks: Task[]
}

export const TaskListPanel = memo(function TaskListPanel({
  filter, onFilterChange, selectedTaskId, onSelectTask,
  filteredTasks, statusCounts, revisionsByRoot, approvalTasks,
}: TaskListPanelProps) {
  const { tasks, messages, setActiveView, activeThreadId, setActiveThreadId } = useAgentStore(
    useShallow((s) => ({
      tasks: s.tasks,
      messages: s.messages,
      setActiveView: s.setActiveView,
      activeThreadId: s.activeThreadId,
      setActiveThreadId: s.setActiveThreadId,
    }))
  )
  const [reportMenuOpen, setReportMenuOpen] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const reportMenuRef = useRef<HTMLDivElement>(null)
  const latestApprovalTask = approvalTasks[0]

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

  return (
    <div className={`shrink-0 border-r border-office-panel bg-office-sidebar flex flex-col w-full md:w-[360px] ${selectedTaskId ? 'hidden md:flex' : 'flex'}`}>

      {/* 헤더 */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-office-active/70">작업 관리</p>
            <h2 className="mt-0.5 text-xl font-bold text-white">업무 목록</h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="shrink-0 rounded-lg border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            운영실 →
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
              onClick={() => onFilterChange(key)}
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

        {approvalTasks.length > 0 ? (
          <div className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-yellow-300">
                  승인 대기 알림 {approvalTasks.length}건
                </p>
                <p className="mt-1 truncate text-[11px] text-yellow-100/70">
                  {latestApprovalTask ? repairLegacyTaskTitle(latestApprovalTask).title : '검토가 필요한 업무가 있습니다.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onFilterChange('awaiting_approval')
                  if (latestApprovalTask) onSelectTask(latestApprovalTask.id)
                }}
                className="shrink-0 rounded-lg border border-yellow-500/50 bg-yellow-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-yellow-200 transition-colors hover:bg-yellow-500/25"
              >
                검토하기
              </button>
            </div>
          </div>
        ) : null}

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
              onClick={() => onFilterChange(item.id)}
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
              onClick={() => onSelectTask(task.id)}
              className={`w-full rounded-xl border-l-[3px] border border-office-panel/60 text-left transition-all ${sc.border} ${
                isSelected ? 'bg-office-active/10 border-office-active/40' : 'bg-office-panel/40 hover:bg-office-panel/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-3 pt-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                  {STATUS_LABEL[task.status]}
                </span>
                <span className="text-[10px] text-office-text/40">{formatShortDateTime(task.createdAt)}</span>
              </div>

              <p className="mt-2 px-3 text-sm font-semibold text-white leading-snug line-clamp-2">{title}</p>

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
                    onClick={(e) => { e.stopPropagation(); setActiveThreadId(task.threadId ?? task.id); setActiveView('dashboard') }}
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
                <p className="mb-4 mt-1 text-xs text-office-text/30">대시보드에서 에이전트에게 업무를 지시해 보세요.</p>
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  className="rounded border border-office-active/40 bg-office-active/10 px-3 py-1.5 text-xs text-office-active transition-colors hover:bg-office-active/20"
                >
                  대시보드로 이동
                </button>
              </>
            ) : (
              <p className="text-sm text-office-text/50">조건에 맞는 업무가 없습니다.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
