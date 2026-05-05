import { useMemo } from 'react'
import { resolveDepartmentFloor, resolveAgentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { DEPARTMENTS, FLOORS, FloorId, Message, ExecutionLogKind } from '@/types'
import { formatTime, formatTimeWithSeconds } from '@/utils/dateFormat'

const LOG_STYLE: Record<ExecutionLogKind, { icon: string; color: string }> = {
  llm: { icon: 'AI', color: 'text-purple-400' },
  tool: { icon: '도구', color: 'text-blue-400' },
  memory: { icon: '기억', color: 'text-green-400' },
  system: { icon: '시스템', color: 'text-office-text/50' },
}

const AGENT_STATUS_LABEL: Record<string, { label: string; dot: string }> = {
  working:  { label: '작업 중',  dot: 'bg-blue-400 animate-pulse' },
  thinking: { label: '생각 중',  dot: 'bg-purple-400 animate-pulse' },
  debating: { label: '토론 중',  dot: 'bg-yellow-400 animate-pulse' },
  moving:   { label: '이동 중',  dot: 'bg-green-400' },
}

const FLOOR_ORDER: FloorId[] = ['11f', '10f', '9f', '8f', '7f', '6f', '5f', '4f', '3f', '2f', '1f']

export default function DashboardView() {
  const {
    agents,
    tasks,
    messages,
    currentFloor,
    executionLogs,
    clearExecutionLogs,
    setCurrentFloor,
    setActiveView,
  } = useAgentStore(
    useShallow((s) => ({
      agents: s.agents,
      tasks: s.tasks,
      messages: s.messages,
      currentFloor: s.currentFloor,
      executionLogs: s.executionLogs,
      clearExecutionLogs: s.clearExecutionLogs,
      setCurrentFloor: s.setCurrentFloor,
      setActiveView: s.setActiveView,
    }))
  )

  const activeAgents = agents.filter((agent) => agent.status !== 'idle').length
  const inProgressTasks = tasks.filter((task) => task.status === 'in_progress').length
  const awaitingApprovalTasks = tasks.filter((task) => task.status === 'awaiting_approval').length
  const completedTasks = tasks.filter((task) => task.status === 'completed').length
  const failedTasks = tasks.filter((task) => task.status === 'failed').length

  const floorSummaries = useMemo(() => (
    FLOOR_ORDER.map((floorId) => {
      const floor = FLOORS[floorId]
      const floorAgents = agents.filter((agent) => resolveAgentFloor(agent) === floorId)
      const floorMessages = messages.filter((message) => resolveMessageFloors(message).includes(floorId))

      return {
        floorId,
        floor,
        agentCount: floorAgents.length,
        activeCount: floorAgents.filter((agent) => agent.status !== 'idle').length,
        messageCount: floorMessages.length,
      }
    })
  ), [agents, messages])

  const recentMessages = [...messages]
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, 6)

  return (
    <section className="flex-1 overflow-y-auto bg-office-bg p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-office-active">대시보드</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">AI 오피스 현황</h2>
            <p className="mt-2 text-sm text-office-text/60">
              현재 선택된 층은 {FLOORS[currentFloor].label} {FLOORS[currentFloor].name}입니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveView('office')}
              title="현재 층의 AI 오피스 화면으로 이동합니다."
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              오피스로 이동
            </button>
            <button
              type="button"
              onClick={() => setActiveView('tasks')}
              title="업무 목록과 승인 대기 작업을 확인합니다."
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              작업 보기
            </button>
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              title="부서별 채팅 채널 화면으로 이동합니다."
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              채팅 보기
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="전체 에이전트" value={`${agents.length}명`} description={`현재 활성 상태 ${activeAgents}명`} />
          <StatCard
            title="진행 중 업무"
            value={`${inProgressTasks}건`}
            description={`완료 ${completedTasks}건 / 실패 ${failedTasks}건`}
            badge={awaitingApprovalTasks > 0 ? `승인 대기 ${awaitingApprovalTasks}건` : undefined}
          />
          <StatCard title="누적 메시지" value={`${messages.length}건`} description="팀 채팅과 회의 메시지 기록" />
          <StatCard title="현재 층" value={FLOORS[currentFloor].label} description={FLOORS[currentFloor].name} />
        </div>

        <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">실행 로그</p>
              <p className="mt-0.5 text-xs text-office-text/50">AI 호출 · 기능 실행 · 메모리 검색 (최근 100건)</p>
            </div>
            <button
              type="button"
              onClick={clearExecutionLogs}
              disabled={executionLogs.length === 0}
              title="실행 로그 목록을 비웁니다."
              className="shrink-0 rounded border border-office-panel/60 px-2 py-1 text-[11px] text-office-text/50 transition-colors hover:border-office-active hover:text-white disabled:opacity-30"
            >
              초기화
            </button>
          </div>
          <div className="mt-4 max-h-52 space-y-1 overflow-y-auto pr-1">
            {executionLogs.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-office-text/30">아직 기록이 없습니다.</p>
                <p className="mt-1 text-xs text-office-text/20">업무를 지시하면 여기에 표시됩니다.</p>
              </div>
            ) : (
              [...executionLogs].reverse().map((log) => (
                <div key={log.id} className="flex items-start gap-2 rounded-lg bg-office-panel/40 px-3 py-2">
                  <span className={`shrink-0 text-[10px] font-semibold ${LOG_STYLE[log.kind].color}`}>
                    {LOG_STYLE[log.kind].icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs font-medium ${LOG_STYLE[log.kind].color}`}>{log.label}</span>
                    {log.detail ? <p className="mt-0.5 truncate text-[11px] text-office-text/50">{log.detail}</p> : null}
                  </div>
                  <span className="shrink-0 text-[10px] text-office-text/30">
                    {formatTimeWithSeconds(log.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── 현재 작업 중인 에이전트 ── */}
        <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">현재 작업 중인 에이전트</p>
              <p className="mt-1 text-xs text-office-text/50">
                실시간 상태 · {activeAgents > 0 ? `${activeAgents}명 활성` : '전원 대기 중'}
              </p>
            </div>
            {activeAgents > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-semibold text-blue-300">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                {activeAgents}명 작업 중
              </span>
            )}
          </div>

          <div className="mt-4">
            {activeAgents === 0 ? (
              <p className="py-5 text-center text-sm text-office-text/30">모든 에이전트가 대기 중입니다.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {agents
                  .filter((agent) => agent.status !== 'idle')
                  .map((agent) => {
                    const statusInfo = AGENT_STATUS_LABEL[agent.status] ?? { label: agent.status, dot: 'bg-gray-400' }
                    const deptName = DEPARTMENTS[agent.departmentId]?.name ?? agent.departmentId
                    const floorId = resolveAgentFloor(agent)
                    const floorLabel = floorId ? FLOORS[floorId]?.label : ''
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          if (floorId) setCurrentFloor(floorId)
                          setActiveView('office')
                        }}
                        title={`${floorLabel} ${deptName}으로 이동합니다.`}
                        className="rounded-xl border border-office-panel/70 bg-office-panel/50 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/80"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`shrink-0 inline-block h-2 w-2 rounded-full ${statusInfo.dot}`}
                              style={{ backgroundColor: agent.color }}
                            />
                            <span className="truncate text-xs font-semibold text-white">{agent.name}</span>
                          </div>
                          <span className="shrink-0 rounded-full bg-office-bg/50 px-2 py-0.5 text-[10px] text-office-active">
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-office-text/50">{floorLabel} · {deptName}</p>
                        {agent.message && (
                          <p className="mt-1.5 truncate text-[11px] text-office-text/70">{agent.message}</p>
                        )}
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
            <div>
              <p className="text-sm font-semibold text-white">층별 현황</p>
              <p className="mt-0.5 text-xs text-office-text/50">층을 누르면 해당 층으로 이동 · 회의실·카페 포함</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {floorSummaries.map(({ floorId, floor, agentCount, activeCount, messageCount }) => (
                <button
                  key={floorId}
                  type="button"
                  onClick={() => {
                    setCurrentFloor(floorId)
                    setActiveView('office')
                  }}
                  title={`${floor.label} ${floor.name}층의 오피스 화면으로 이동합니다.`}
                  className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                    currentFloor === floorId
                      ? 'border-office-active bg-office-active/20'
                      : 'border-office-panel bg-office-panel/50 hover:border-office-active hover:bg-office-panel/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{floor.label}</p>
                      <p className="mt-1 text-xs text-office-text/60">{floor.name}</p>
                    </div>
                    <span className="rounded-full bg-office-bg/40 px-2 py-1 text-[11px] text-office-active">
                      {messageCount}건
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-office-text/70">
                    인원 {agentCount}명 · 활성 {activeCount}명
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">최근 활동</p>
                <p className="mt-1 text-xs text-office-text/50">가장 최근 메시지 6건입니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('chat')}
                title="최근 활동 전체를 팀 채팅 화면에서 확인합니다."
                className="text-xs text-office-active transition-colors hover:text-white"
              >
                전체 보기
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {recentMessages.length > 0 ? recentMessages.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => openMessageContext(message, setCurrentFloor, setActiveView)}
                  title="이 대화가 발생한 채널이나 층으로 이동합니다."
                  className="w-full rounded-xl border border-office-panel/70 bg-office-panel/50 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-office-active">{message.senderName}</p>
                    <p className="text-[11px] text-office-text/40">
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-office-text">
                    {message.content}
                  </p>
                </button>
              )) : (
                <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-8 text-center">
                  <p className="text-sm text-office-text/50">아직 기록된 대화가 없습니다.</p>
                  <p className="mb-4 mt-1 text-xs text-office-text/30">에이전트에게 업무를 지시하면 대화가 시작됩니다.</p>
                  <button
                    type="button"
                    onClick={() => setActiveView('office')}
                    title="AI 오피스 화면으로 이동해 새 업무를 시작합니다."
                    className="rounded border border-office-active/40 bg-office-active/10 px-3 py-1.5 text-xs text-office-active transition-colors hover:bg-office-active/20"
                  >
                    AI 오피스로 이동
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatCard({
  title,
  value,
  description,
  badge,
}: {
  title: string
  value: string
  description: string
  badge?: string
}) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-office-text/60">{title}</p>
        {badge ? (
          <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[11px] font-semibold text-yellow-300">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs text-office-text/50">{description}</p>
    </div>
  )
}

function resolveMessageFloors(message: Message): FloorId[] {
  if (message.channelFloorId) return [message.channelFloorId]
  if (!message.departmentIds || message.departmentIds.length === 0) return []
  return Array.from(new Set(message.departmentIds.map((departmentId) => resolveDepartmentFloor(departmentId))))
}

function openMessageContext(
  message: Message,
  setCurrentFloor: (floor: FloorId) => void,
  setActiveView: (view: 'office' | 'chat') => void,
) {
  const [targetFloor] = resolveMessageFloors(message)
  if (targetFloor) {
    setCurrentFloor(targetFloor)
    setActiveView('office')
    return
  }

  setActiveView('chat')
}
