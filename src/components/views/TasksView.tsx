import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Message } from '@/types'
import { resolveDepartmentFloor } from '@/services/directives'
import { exportTask, exportAllTasks } from '@/services/exportService'
import { generateDailyReport, generateDepartmentReport } from '@/services/dailyReportService'
import { runTask, approveAndFinalize, rejectAndNotify } from '@/services/agentOrchestrator'
import MessageContent from '@/components/layout/MessageContent'
import { useAgentStore } from '@/store/agentStore'
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

export default function TasksView() {
  const {
    tasks,
    messages,
    setActiveView,
    setCurrentFloor,
    setActiveThreadId,
    activeThreadId,
  } = useAgentStore()
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

  // 루트 태스크만 목록에 표시 (수정본은 원본 카드에 버전 탭으로 표시)
  const filteredTasks = useMemo(() => {
    const rootOnly = tasks.filter((t) => !t.revisionOf)
    const sorted = [...rootOnly].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    return filter === 'all' ? sorted : sorted.filter((task) => task.status === filter)
  }, [filter, tasks])

  useEffect(() => {
    if (filteredTasks.length === 0) {
      setSelectedTaskId(null)
      return
    }

    if (!selectedTaskId || !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0].id)
    }
  }, [filteredTasks, selectedTaskId])

  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? null

  // 각 루트 태스크의 수정본 목록 (최신순)
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
      <div className={`shrink-0 border-r border-office-panel bg-office-sidebar p-5 w-full md:w-[340px] ${selectedTask ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
        <div className="flex flex-col gap-3">
          {/* 타이틀 + AI 오피스 버튼 */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-office-active">작업 관리</p>
              <h2 className="mt-1 text-xl font-semibold text-white">업무 목록</h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('office')}
              title="업무 화면을 닫고 AI 오피스로 이동합니다."
              className="shrink-0 rounded border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              AI 오피스 →
            </button>
          </div>

          {/* 내보내기 / 보고서 버튼 한 줄 */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => exportAllTasks(tasks)}
              disabled={tasks.length === 0}
              title="전체 작업을 마크다운으로 내보내기"
              className="flex-1 rounded border border-office-panel/70 bg-office-panel px-2 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
            >
              내보내기
            </button>

            {/* 보고서 스플릿 버튼 */}
            <div ref={reportMenuRef} className="relative flex flex-1">
              <button
                type="button"
                onClick={() => void handleDailyReport()}
                disabled={isGeneratingReport || tasks.length === 0}
                title="전체 일일 업무 보고서를 Word 파일로 다운로드합니다."
                className="flex-1 rounded-l border border-office-panel/70 bg-office-panel px-2 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
              >
                {isGeneratingReport ? '생성 중…' : '보고서'}
              </button>
              <button
                type="button"
                onClick={() => setReportMenuOpen((v) => !v)}
                disabled={isGeneratingReport || tasks.length === 0}
                title="부서별 보고서 선택"
                className="rounded-r border border-l-0 border-office-panel/70 bg-office-panel px-2 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
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
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-office-text/40">
                          {div.name}
                        </p>
                        {depts.map((dept) => (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => void handleDeptReport(dept.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-office-text transition-colors hover:bg-office-panel/70 hover:text-white"
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: dept.color }}
                            />
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
        </div>

        <div className="mt-4 flex gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              title={`${item.label} 상태의 작업만 표시합니다.`}
              className={`flex-1 whitespace-nowrap rounded-full border py-1.5 text-xs transition-colors ${
                filter === item.id
                  ? 'border-office-active bg-office-active/20 text-office-active'
                  : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
          {filteredTasks.length > 0 ? filteredTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => { setSelectedTaskId(task.id) }}
              title="이 작업의 상세 내용을 엽니다."
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selectedTaskId === task.id
                  ? 'border-office-active bg-office-active/20'
                  : 'border-office-panel/70 bg-office-panel/50 hover:border-office-active hover:bg-office-panel/80'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-white" title={repairLegacyTaskTitle(task).title}>{repairLegacyTaskTitle(task).title}</p>
                <span className={`shrink-0 text-[11px] ${
                  task.status === 'awaiting_approval' ? 'text-yellow-400' : 'text-office-active'
                }`}>
                  {STATUS_LABEL[task.status]}
                </span>
              </div>
              <p className="mt-2 text-xs text-office-text/60">{formatShortDateTime(task.createdAt)}</p>
              <p className="mt-2 text-xs text-office-text/50">
                담당: {task.assignedTo.length > 0
                  ? task.assignedTo.map((deptId) => DEPARTMENTS[deptId].name).join(', ')
                  : '미배정'}
              </p>
              {task.approvalReasons && task.approvalReasons.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {task.approvalReasons.slice(0, 2).map((reason) => (
                    <span
                      key={reason.id}
                      className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-300"
                    >
                      {reason.label}
                    </span>
                  ))}
                  {task.approvalReasons.length > 2 ? (
                    <span className="text-[10px] text-office-text/40">+{task.approvalReasons.length - 2}</span>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                {task.threadId ? (
                  <span className="rounded-full border border-office-active/30 bg-office-active/10 px-2 py-0.5 text-[10px] text-office-active/70">
                    스레드
                  </span>
                ) : null}
                {(revisionsByRoot.get(task.id)?.length ?? 0) > 0 ? (
                  <span className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300">
                    v{(revisionsByRoot.get(task.id)?.length ?? 0) + 1}
                  </span>
                ) : null}
                {(task.status === 'completed' || task.status === 'awaiting_approval') ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveThreadId(task.threadId ?? task.id)
                      setActiveView('office')
                    }}
                    title="이 작업과 연결된 스레드를 오피스 화면에서 이어서 봅니다."
                    className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                      activeThreadId === (task.threadId ?? task.id)
                        ? 'border-office-active bg-office-active/20 text-office-active'
                        : 'border-office-panel/60 text-office-text/50 hover:border-office-active hover:text-white'
                    }`}
                  >
                    이어진 작업
                  </button>
                ) : null}
              </div>
            </button>
          )) : (
            <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-8 text-center">
              {filter === 'all' ? (
                <>
                  <p className="text-sm text-office-text/50">아직 업무가 없습니다.</p>
                  <p className="mb-4 mt-1 text-xs text-office-text/30">AI 오피스에서 에이전트에게 업무를 지시해 보세요.</p>
                  <button
                    type="button"
                    onClick={() => setActiveView('office')}
                    title="AI 오피스로 이동해 첫 작업을 생성합니다."
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

      <div className={`flex-1 overflow-y-auto p-6 flex flex-col ${!selectedTask ? 'hidden md:flex' : ''}`}>
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            revisions={revisionsByRoot.get(selectedTask.id) ?? []}
            onBack={() => setSelectedTaskId(null)}
            onOpenOffice={() => {
              const [firstDepartment] = selectedTask.assignedTo
              if (firstDepartment) {
                setCurrentFloor(resolveDepartmentFloor(firstDepartment))
              }
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
              title="AI 오피스로 이동해 새 작업을 시작합니다."
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

function TaskDetail({
  task,
  revisions,
  onBack,
  onOpenOffice,
  onOpenChat,
  onApprove,
  onReject,
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
  // 버전 탭: 0=원본, 1..N=수정본
  const [versionTab, setVersionTab] = useState<number | null>(null)
  const displayTitle = repairLegacyTaskTitle(task).title

  // 수정본이 새로 추가되면 최신 버전으로 자동 이동
  useEffect(() => {
    if (revisions.length > 0) {
      setVersionTab(revisions.length - 1)
    } else {
      setVersionTab(null)
    }
  }, [revisions.length])

  // 현재 보는 버전의 태스크: null이면 원본(task)
  const viewedTask = versionTab !== null ? (revisions[versionTab] ?? task) : task

  const handleRevision = async () => {
    if (!revisionInput.trim() || isRevising) return
    const feedback = revisionInput.trim()
    setRevisionInput('')
    setIsRevising(true)
    onReject(feedback)

    const latestResult = revisions.at(-1)?.result ?? task.result
    const revisionPrompt = [
      '[재작업 요청]',
      `원본 업무: ${displayTitle}`,
      `수정 요청: ${feedback}`,
      latestResult ? `\n[이전 결과 참고]\n${latestResult.slice(0, 1500)}` : '',
    ].filter(Boolean).join('\n')

    try {
      // revisionOf를 전달해 버전 체인 형성
      await runTask(revisionPrompt, task.attachments ?? [], undefined, { revisionOf: task.id })
    } finally {
      setIsRevising(false)
    }
  }

  function handleRejectConfirm() {
    onReject(rejectReason.trim() || undefined)
    setShowRejectInput(false)
    setRejectReason('')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="md:hidden mb-4 flex items-center gap-2 text-sm text-office-active"
      >
        ← 목록으로
      </button>
      {task.status === 'awaiting_approval' ? (
        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5">
          <p className="text-sm font-semibold text-yellow-300">AI 결과물 검토 필요</p>
          <p className="mt-1 text-xs text-yellow-200/70">
            승인하면 외부 알림·저장·자동 후속 업무가 실행됩니다. 거절하면 담당 부서에 사유가 전달됩니다.
          </p>
          {task.approvalReasons && task.approvalReasons.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {task.approvalReasons.map((reason) => (
                <span
                  key={reason.id}
                  title={reason.description}
                  className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-100"
                >
                  {reason.label}
                </span>
              ))}
            </div>
          ) : null}

          {/* 승인 / 거절 버튼 */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApprove}
              title="승인 → 완료 처리 + Webhook/Notion/자동 전달"
              className="rounded border border-green-500/50 bg-green-500/20 px-4 py-2 text-sm font-semibold text-green-300 transition-colors hover:bg-green-500/30"
            >
              ✅ 승인 (완료 처리)
            </button>
            <button
              type="button"
              onClick={() => setShowRejectInput((v) => !v)}
              title="거절 → 실패 처리 + 담당 부서에 사유 전달"
              className="rounded border border-red-500/50 bg-red-500/20 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/30"
            >
              ❌ 거절 (실패 처리)
            </button>
          </div>

          {/* 거절 사유 입력 */}
          {showRejectInput && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRejectConfirm() }}
                placeholder="거절 사유 입력 (선택) — 담당 부서 채널에 전달됩니다"
                autoFocus
                className="flex-1 rounded border border-red-500/30 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/40 focus:border-red-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleRejectConfirm}
                className="rounded border border-red-500/50 bg-red-500/20 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/30"
              >
                확인
              </button>
              <button
                type="button"
                onClick={() => { setShowRejectInput(false); setRejectReason('') }}
                className="rounded border border-office-panel/50 px-3 py-2 text-sm text-office-text/50 transition-colors hover:text-white"
              >
                취소
              </button>
            </div>
          )}

          {/* 재작업 요청 */}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={revisionInput}
              onChange={(event) => setRevisionInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleRevision() }}
              placeholder="수정 요청 내용 입력 → 거절 후 해당 내용으로 재작업 실행"
              disabled={isRevising}
              className="flex-1 rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/40 focus:border-office-active focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleRevision()}
              disabled={!revisionInput.trim() || isRevising}
              title="거절 처리 후 수정 요청 내용으로 재작업을 즉시 실행합니다."
              className="rounded border border-office-active/40 bg-office-active/10 px-3 py-2 text-sm text-office-active transition-colors hover:bg-office-active/20 disabled:opacity-40"
            >
              {isRevising ? '재작업 중...' : '재작업 요청'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`text-sm font-semibold ${
              task.status === 'awaiting_approval' ? 'text-yellow-400' : 'text-office-active'
            }`}>
              {STATUS_LABEL[task.status]}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{displayTitle}</h3>
            <p className="mt-2 text-sm text-office-text/60">생성 시각 {formatFullDateTime(task.createdAt)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenOffice}
              title="배정된 부서가 있는 층의 오피스 화면으로 이동합니다."
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              오피스에서 보기
            </button>
            <button
              type="button"
              onClick={onOpenChat}
              title="관련 팀 채팅 화면으로 이동합니다."
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              팀 채팅 보기
            </button>
            <button
              type="button"
              onClick={() => exportTask(task)}
              title="현재 작업 내용을 텍스트 파일로 저장합니다."
              className="rounded border border-office-active/40 bg-office-active/10 px-3 py-2 text-sm text-office-active transition-colors hover:bg-office-active/20"
            >
              텍스트로 저장
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {task.assignedTo.map((deptId) => (
            <span
              key={deptId}
              className="rounded-full border border-office-panel/70 bg-office-panel/50 px-3 py-1 text-xs text-office-text"
            >
              {DEPARTMENTS[deptId].name}
            </span>
          ))}
        </div>

        {task.approvalReasons && task.approvalReasons.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {task.approvalReasons.map((reason) => (
              <span
                key={reason.id}
                title={reason.description}
                className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-200"
              >
                {reason.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <SectionCard title="요청 설명">
        <pre className="whitespace-pre-wrap font-inherit text-sm text-office-text">{task.description}</pre>
      </SectionCard>

      <SectionCard title="첨부 파일">
        {task.attachments && task.attachments.length > 0 ? (
          <div className="space-y-2">
            {task.attachments.map((attachment) => (
              <div key={attachment.id} className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-3">
                <p className="text-sm font-semibold text-white">{attachment.name}</p>
                <p className="mt-1 text-xs text-office-text/60">{attachment.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-office-text/50">첨부 파일이 없습니다.</p>
        )}
      </SectionCard>

      {/* 교차 검토 결과 */}
      {task.reviews && task.reviews.length > 0 && (
        <ReviewsSection reviews={task.reviews} />
      )}

      {/* 버전 히스토리 탭 */}
      {revisions.length > 0 && (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-purple-300">버전 히스토리</p>
            <span className="text-xs text-office-text/40">{revisions.length + 1}개 버전</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* v1 = 원본 */}
            <button
              type="button"
              onClick={() => setVersionTab(null)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                versionTab === null
                  ? 'border-purple-400 bg-purple-400/20 text-purple-200'
                  : 'border-office-panel/60 text-office-text/50 hover:border-purple-400/60 hover:text-purple-200'
              }`}
            >
              v1 원본
              <span className={`ml-1.5 text-[10px] ${
                task.status === 'completed' ? 'text-emerald-400' :
                task.status === 'failed' ? 'text-red-400' :
                task.status === 'awaiting_approval' ? 'text-yellow-400' :
                'text-office-text/40'
              }`}>
                {STATUS_LABEL[task.status]}
              </span>
            </button>
            {revisions.map((rev, idx) => (
              <button
                key={rev.id}
                type="button"
                onClick={() => setVersionTab(idx)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  versionTab === idx
                    ? 'border-purple-400 bg-purple-400/20 text-purple-200'
                    : 'border-office-panel/60 text-office-text/50 hover:border-purple-400/60 hover:text-purple-200'
                }`}
              >
                v{idx + 2} 수정
                <span className={`ml-1.5 text-[10px] ${
                  rev.status === 'completed' ? 'text-emerald-400' :
                  rev.status === 'failed' ? 'text-red-400' :
                  rev.status === 'awaiting_approval' ? 'text-yellow-400' :
                  rev.status === 'in_progress' ? 'text-office-active' :
                  'text-office-text/40'
                }`}>
                  {STATUS_LABEL[rev.status]}
                </span>
              </button>
            ))}
          </div>
          {versionTab !== null && revisions[versionTab] && (
            <p className="mt-2 text-xs text-office-text/40">
              {formatFullDateTime(revisions[versionTab].createdAt)} 생성
            </p>
          )}
        </div>
      )}

      <DepartmentResultsSection
        departmentResults={viewedTask.departmentResults}
        fallbackResult={viewedTask.result}
      />

      <ModelDebateSection taskId={viewedTask.id} />
    </div>
  )
}

function DepartmentResultsSection({
  departmentResults,
  fallbackResult,
}: {
  departmentResults?: DepartmentResult[]
  fallbackResult?: string
}) {
  const hasDeptResults = departmentResults !== undefined && departmentResults.length > 1
  const [activeTab, setActiveTab] = useState(0)
  const prevDeptLen = useRef(departmentResults?.length ?? 0)

  useEffect(() => {
    if ((departmentResults?.length ?? 0) !== prevDeptLen.current) {
      setActiveTab(0)
      prevDeptLen.current = departmentResults?.length ?? 0
    }
  }, [departmentResults])

  if (hasDeptResults && departmentResults) {
    const safeActiveTab = Math.min(activeTab, departmentResults.length - 1)
    const current = departmentResults[safeActiveTab]
    const deptName = DEPARTMENTS[current.deptId]?.name ?? current.deptId

    return (
      <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">부서별 실행 결과</p>
          <span className="text-xs text-office-text/40">{departmentResults.length}개 부서</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {departmentResults.map((result, index) => {
            const name = DEPARTMENTS[result.deptId]?.name ?? result.deptId
            return (
              <button
                key={result.deptId}
                type="button"
                onClick={() => setActiveTab(index)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  safeActiveTab === index
                    ? 'border-office-active bg-office-active/20 text-office-active'
                    : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs text-office-text/50">{deptName} · {current.agentName}</p>
          <div className="max-h-[520px] overflow-y-auto text-sm">
            <MessageContent content={current.content} />
          </div>
        </div>
      </div>
    )
  }

  const content = departmentResults?.[0]?.content ?? fallbackResult
  return (
    <SectionCard title="실행 결과">
      {content ? (
        <div className="max-h-[520px] overflow-y-auto text-sm">
          <MessageContent content={content} />
        </div>
      ) : (
        <p className="text-sm text-office-text/50">아직 결과가 기록되지 않았습니다.</p>
      )}
    </SectionCard>
  )
}

function ModelDebateSection({ taskId }: { taskId: string }) {
  const messages = useAgentStore((s) => s.messages)
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  const debateMessages = useMemo(
    () => messages.filter((m): m is Message & { taskId: string } =>
      m.taskId === taskId && m.type === 'debate'
    ),
    [messages, taskId],
  )

  if (debateMessages.length === 0) return null

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-violet-300">모델 토론 기록</p>
        <span className="text-xs text-office-text/40">{debateMessages.length}건</span>
      </div>
      <div className="mt-3 space-y-2">
        {debateMessages.map((msg, idx) => {
          const isOpen = openIdx === idx
          return (
            <div
              key={msg.id}
              className={`rounded-xl border transition-colors ${
                isOpen ? 'border-violet-500/40 bg-violet-500/10' : 'border-office-panel/60 bg-office-panel/30'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className={`text-xs font-semibold ${isOpen ? 'text-violet-200' : 'text-office-text/70'}`}>
                  {msg.senderName}
                </span>
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

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function ReviewsSection({ reviews }: { reviews: TaskReview[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-emerald-300">교차 검토 결과</p>
        <span className="text-xs text-office-text/40">{reviews.length}건</span>
      </div>
      <div className="mt-3 space-y-2">
        {reviews.map((review, idx) => {
          const dept = DEPARTMENTS[review.reviewerId]
          const isOpen = openIdx === idx
          return (
            <div
              key={review.id}
              className={`rounded-xl border transition-colors ${
                isOpen ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-office-panel/60 bg-office-panel/30'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dept?.color ?? '#888' }}
                  />
                  <span className="text-xs font-semibold text-white">{review.reviewerName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-office-text/40">
                    {formatShortDateTime(review.createdAt)}
                  </span>
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
