import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Message } from '@/types'
import { DEPARTMENTS, Task, type DepartmentResult, type TaskReview, type TaskTokenUsage } from '@/types'
import { useTaskActions } from '@/hooks/useTaskActions'
import MessageContent from '@/components/layout/MessageContent'
import { useAgentStore } from '@/store/agentStore'
import { exportTask } from '@/services/exportService'
import { formatShortDateTime, formatFullDateTime } from '@/utils/dateFormat'
import { repairLegacyTaskTitle } from '@/utils/taskTitle'
import { STATUS_LABEL, STATUS_COLOR, STEPS, stepIndex } from './taskConstants'

export const TaskDetail = memo(function TaskDetail({
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
  const { submitTask, isRunning: isRevising } = useTaskActions()
  const [revisionInput, setRevisionInput] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [versionTab, setVersionTab] = useState<number | null>(null)
  const { title } = repairLegacyTaskTitle(task)
  const sc = STATUS_COLOR[task.status]

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVersionTab(revisions.length > 0 ? revisions.length - 1 : null)
  }, [revisions.length])

  const viewedTask = versionTab !== null ? (revisions[versionTab] ?? task) : task

  const handleRevision = async () => {
    if (!revisionInput.trim() || isRevising) return
    const feedback = revisionInput.trim()
    setRevisionInput('')
    onReject(feedback)
    const latestResult = revisions.at(-1)?.result ?? task.result
    const prompt = ['[재작업 요청]', `원본 업무: ${title}`, `수정 요청: ${feedback}`, latestResult ? `\n[이전 결과 참고]\n${latestResult.slice(0, 1500)}` : ''].filter(Boolean).join('\n')
    await submitTask(prompt, task.attachments ?? [], undefined, { revisionOf: task.id })
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
        <div className={`h-1 w-full ${sc.dot}`} />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${sc.bg} ${sc.text}`}>
                  <span className={`h-2 w-2 rounded-full ${sc.dot} ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                  {STATUS_LABEL[task.status]}
                </span>
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
              <button type="button" onClick={onOpenOffice} className="rounded-lg border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white">운영실에서 보기</button>
              <button type="button" onClick={onOpenChat} className="rounded-lg border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white">팀 채팅 보기</button>
              <button type="button" onClick={() => exportTask(task)} className="rounded-lg border border-office-active/40 bg-office-active/10 px-3 py-2 text-xs text-office-active transition-colors hover:bg-office-active/20">텍스트로 저장</button>
            </div>
          </div>
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

      {/* 토큰 사용량 */}
      {task.tokenUsage && <TokenUsageBadge usage={task.tokenUsage} />}

      {/* 실행 결과 */}
      <DepartmentResultsSection departmentResults={viewedTask.departmentResults} fallbackResult={viewedTask.result} />

      {/* 부서 토론 기록 */}
      <DeptDebateSection taskId={viewedTask.id} />
    </div>
  )
})

// ── 부서별 실행 결과 ──────────────────────────────────────────────────────────
const DepartmentResultsSection = memo(function DepartmentResultsSection({
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
})

// ── 부서 토론 기록 ────────────────────────────────────────────────────────────
const DeptDebateSection = memo(function DeptDebateSection({ taskId }: { taskId: string }) {
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
        <p className="text-sm font-semibold text-violet-300">💬 부서 토론 기록</p>
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
})

// ── 교차 검토 ─────────────────────────────────────────────────────────────────
const ReviewsSection = memo(function ReviewsSection({ reviews }: { reviews: TaskReview[] }) {
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
})

const TokenUsageBadge = memo(function TokenUsageBadge({ usage }: { usage: TaskTokenUsage }) {
  const totalTokens = usage.inputTokens + usage.outputTokens
  const costStr = usage.estimatedCostUsd < 0.001
    ? '< $0.001'
    : `$${usage.estimatedCostUsd.toFixed(4)}`
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-office-panel/60 bg-office-panel/30 px-4 py-3 text-xs text-office-text/60">
      <span className="font-medium text-office-text/80">토큰 사용</span>
      <span>입력 {usage.inputTokens.toLocaleString()}</span>
      <span className="text-office-text/30">·</span>
      <span>출력 {usage.outputTokens.toLocaleString()}</span>
      <span className="text-office-text/30">·</span>
      <span>합계 {totalTokens.toLocaleString()}</span>
      <span className="ml-auto font-medium text-office-active/80">{costStr}</span>
    </div>
  )
})

const SectionCard = memo(function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
})
