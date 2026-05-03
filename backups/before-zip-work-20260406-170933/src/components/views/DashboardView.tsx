import { useMemo } from 'react'
import { resolveDepartmentFloor, resolveAgentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { FLOORS, FloorId, Message } from '@/types'

const FLOOR_ORDER: FloorId[] = ['12f', '11f', '10f', '9f', '8f', '7f', '6f', '5f', '4f', '3f', '2f', '1f']

export default function DashboardView() {
  const {
    agents,
    tasks,
    messages,
    currentFloor,
    setCurrentFloor,
    setActiveView,
  } = useAgentStore()

  const activeAgents = agents.filter((agent) => agent.status !== 'idle').length
  const inProgressTasks = tasks.filter((task) => task.status === 'in_progress').length
  const completedTasks = tasks.filter((task) => task.status === 'completed').length
  const failedTasks = tasks.filter((task) => task.status === 'failed').length

  const floorSummaries = useMemo(() => {
    return FLOOR_ORDER.map((floorId) => {
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
  }, [agents, messages])

  const recentMessages = [...messages]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 6)

  return (
    <section className="flex-1 overflow-y-auto bg-office-bg p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-office-active">대시보드</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">AI 오피스 현황</h2>
            <p className="mt-2 text-sm text-office-text/60">
              현재 선택 층은 {FLOORS[currentFloor].label} {FLOORS[currentFloor].name}입니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveView('office')}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              AI 오피스로 이동
            </button>
            <button
              type="button"
              onClick={() => setActiveView('tasks')}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              작업 관리 열기
            </button>
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              팀 채팅 열기
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="전체 에이전트" value={`${agents.length}명`} description={`현재 활동 중 ${activeAgents}명`} />
          <StatCard title="진행 중 업무" value={`${inProgressTasks}건`} description={`완료 ${completedTasks}건 / 실패 ${failedTasks}건`} />
          <StatCard title="누적 대화" value={`${messages.length}건`} description="팀 채널과 회의실 메시지 기준" />
          <StatCard title="현재 층" value={FLOORS[currentFloor].label} description={FLOORS[currentFloor].name} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">층별 활동</p>
                <p className="mt-1 text-xs text-office-text/50">층을 누르면 해당 층으로 바로 이동합니다.</p>
              </div>
              <span className="text-xs text-office-text/40">회의실과 카페 포함</span>
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
                      {messageCount}대화
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-office-text/70">
                    상주 {agentCount}명 · 활동 중 {activeCount}명
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
                  className="w-full rounded-xl border border-office-panel/70 bg-office-panel/50 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-office-active">{message.senderName}</p>
                    <p className="text-[11px] text-office-text/40">
                      {message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-office-text">
                    {message.content}
                  </p>
                </button>
              )) : (
                <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-8 text-center text-sm text-office-text/50">
                  아직 기록된 대화가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
      <p className="text-sm text-office-text/60">{title}</p>
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
