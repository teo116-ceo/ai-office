import { useMemo } from 'react'
import { resolveAgentFloor, resolveDepartmentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { DEPARTMENTS, FLOORS, type DepartmentId, type FloorId, type Message } from '@/types'
import {
  ActionPill,
  AgentMatrixPanel,
  AlertRow,
  DepartmentStatusPanel,
  MetricCard,
  RecentMessagesPanel,
  TaskQueuePanel,
  ZoneBoard,
  type DepartmentCardData,
  type ZoneCardData,
} from './ControlRoomPanels'

type ZoneSpec = {
  name: string
  description: string
  accent: string
  signal: 'steady' | 'watch' | 'focus'
}

const FLOOR_ZONE_PRESETS: Partial<Record<FloorId, ZoneSpec[]>> = {
  '1f': [
    { name: '소회의실', description: '짧은 협의와 빠른 정리 공간', accent: '#a78bfa', signal: 'steady' },
    { name: '중회의실', description: '부서 회의와 브리핑 중심 공간', accent: '#38bdf8', signal: 'focus' },
    { name: '대회의실', description: '전사 공유와 의사결정 공간', accent: '#f59e0b', signal: 'watch' },
  ],
  '2f': [
    { name: '콘텐츠 기획', description: '콘텐츠 준비와 검토가 많은 구역', accent: '#fb7185', signal: 'focus' },
    { name: '시장 조사', description: '고객 반응과 자료 확인 구역', accent: '#f59e0b', signal: 'steady' },
    { name: '트렌드 확인', description: '업계 흐름과 이슈를 점검하는 구역', accent: '#fbbf24', signal: 'watch' },
  ],
}

export default function OrganizationControlRoom({
  accentColor,
}: {
  accentColor: string
}) {
  const { currentFloor, agents, tasks, messages, directives, setActiveView } = useAgentStore(
    useShallow((s) => ({
      currentFloor: s.currentFloor,
      agents: s.agents,
      tasks: s.tasks,
      messages: s.messages,
      directives: s.directives,
      setActiveView: s.setActiveView,
    }))
  )

  const floor = FLOORS[currentFloor]
  const floorDepartments = floor.departments
  const floorAgents = useMemo(
    () => agents.filter((agent) => resolveAgentFloor(agent) === currentFloor),
    [agents, currentFloor],
  )
  const activeAgents = floorAgents.filter((agent) => agent.status !== 'idle')
  const floorTasks = useMemo(
    () => tasks
      .filter((task) => task.assignedTo.some((departmentId) => resolveDepartmentFloor(departmentId) === currentFloor))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    [currentFloor, tasks],
  )
  const floorMessages = useMemo(
    () => messages
      .filter((message) => resolveMessageFloors(message).includes(currentFloor))
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime()),
    [currentFloor, messages],
  )
  const floorDirectives = useMemo(
    () => [...directives].reverse().filter((directive) => (
      directive.channelFloorId === currentFloor ||
      directive.departmentIds.some((departmentId) => resolveDepartmentFloor(departmentId) === currentFloor)
    )),
    [currentFloor, directives],
  )

  const zoneCards = useMemo<ZoneCardData[]>(() => {
    const zoneSpecs = FLOOR_ZONE_PRESETS[currentFloor] ?? buildDepartmentZones(floorDepartments, accentColor)
    return zoneSpecs.map((zone, index) => ({
      ...zone,
      occupancy: floorAgents.length === 0
        ? 0
        : Math.min(floorAgents.length, Math.max(1, Math.round(floorAgents.length / Math.max(zoneSpecs.length, 1)) + (index % 2))),
      load: activeAgents.length === 0 ? 14 : Math.min(92, 30 + activeAgents.length * 11 + index * 6),
    }))
  }, [accentColor, activeAgents.length, currentFloor, floorAgents.length, floorDepartments])

  const departmentCards = useMemo<DepartmentCardData[]>(
    () => floorDepartments.map((departmentId) => {
      const departmentAgents = floorAgents.filter((agent) => agent.departmentId === departmentId)
      const departmentTasks = floorTasks.filter((task) => task.assignedTo.includes(departmentId))
      const departmentMessages = floorMessages.filter((message) => message.departmentIds?.includes(departmentId))

      return {
        departmentId,
        departmentName: DEPARTMENTS[departmentId]?.name ?? departmentId,
        color: DEPARTMENTS[departmentId]?.color ?? accentColor,
        agentCount: departmentAgents.length,
        activeCount: departmentAgents.filter((agent) => agent.status !== 'idle').length,
        taskCount: departmentTasks.length,
        messageCount: departmentMessages.length,
      }
    }),
    [accentColor, floorAgents, floorDepartments, floorMessages, floorTasks],
  )

  const taskSummary = {
    inProgress: floorTasks.filter((task) => task.status === 'in_progress').length,
    approval: floorTasks.filter((task) => task.status === 'awaiting_approval').length,
    failed: floorTasks.filter((task) => task.status === 'failed').length,
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-5 lg:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-2xl border border-office-panel/70 bg-office-sidebar/80 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-office-active/70">운영 요약</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {floor.label} {floor.name}
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-office-text/60">
                  {getSummaryText(currentFloor, floorDepartments)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionPill label="업무 보기" onClick={() => setActiveView('tasks')} accent={accentColor} />
                <ActionPill label="대화 보기" onClick={() => setActiveView('chat')} accent={accentColor} />
                <ActionPill label="전체 현황" onClick={() => setActiveView('dashboard')} accent={accentColor} />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="현재 인원"
                value={`${floorAgents.length}명`}
                sub={activeAgents.length > 0 ? `움직이는 인원 ${activeAgents.length}명` : '지금은 모두 자리 중심입니다.'}
                accent={accentColor}
              />
              <MetricCard
                title="진행 중 업무"
                value={`${floorTasks.length}건`}
                sub={taskSummary.inProgress > 0 ? `지금 처리 중 ${taskSummary.inProgress}건` : '바로 처리할 업무가 많지 않습니다.'}
                accent="#38bdf8"
              />
              <MetricCard
                title="최근 지시"
                value={`${floorDirectives.length}건`}
                sub={floorDirectives[0]?.title ?? '새로 내려온 지시가 없습니다.'}
                accent="#f59e0b"
              />
              <MetricCard
                title="최근 대화"
                value={`${floorMessages.length}건`}
                sub={floorMessages[0] ? `${floorMessages[0].senderName} 대화가 가장 최근입니다.` : '방금 올라온 대화가 없습니다.'}
                accent="#22c55e"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-office-panel/70 bg-office-sidebar/80 p-5">
            <p className="text-sm font-semibold text-white">바로 확인할 일</p>
            <div className="mt-4 space-y-3">
              <AlertRow
                title={taskSummary.approval > 0 ? '승인 확인이 필요합니다' : '승인 대기 건이 없습니다'}
                detail={taskSummary.approval > 0 ? `확인만 하면 끝나는 업무가 ${taskSummary.approval}건 있습니다.` : '승인을 기다리는 업무는 없습니다.'}
                accent={taskSummary.approval > 0 ? '#f59e0b' : '#22c55e'}
              />
              <AlertRow
                title={taskSummary.failed > 0 ? '멈춘 업무가 있습니다' : '멈춘 업무는 없습니다'}
                detail={taskSummary.failed > 0 ? `다시 확인해야 할 업무가 ${taskSummary.failed}건 있습니다.` : '업무 흐름은 안정적으로 유지되고 있습니다.'}
                accent={taskSummary.failed > 0 ? '#fb7185' : '#38bdf8'}
              />
              <AlertRow
                title={activeAgents.length > 0 ? '지금 움직이는 인원이 있습니다' : '지금은 모두 자리 중심입니다'}
                detail={activeAgents.length > 0 ? formatAgentNames(activeAgents.map((agent) => agent.name)) : '급하게 이동 중인 사람은 없습니다.'}
                accent={activeAgents.length > 0 ? accentColor : '#94a3b8'}
              />
            </div>
          </div>
        </section>

        <ZoneBoard zones={zoneCards} />

        <section className="grid gap-5 2xl:grid-cols-[1.1fr_1fr_1fr]">
          <DepartmentStatusPanel departments={departmentCards} onOpenChat={() => setActiveView('chat')} />
          <TaskQueuePanel tasks={floorTasks} onOpenTasks={() => setActiveView('tasks')} />
          <RecentMessagesPanel messages={floorMessages} onOpenChat={() => setActiveView('chat')} />
        </section>

        <AgentMatrixPanel agents={floorAgents} onOpenAgents={() => setActiveView('agents')} />
      </div>
    </div>
  )
}

function buildDepartmentZones(floorDepartments: DepartmentId[], accentColor: string): ZoneSpec[] {
  if (floorDepartments.length === 0) {
    return [
      { name: '공용 공간', description: '사람이 모이고 이동하는 구역', accent: accentColor, signal: 'steady' },
      { name: '진행 확인', description: '회의와 안내를 정리하는 구역', accent: '#38bdf8', signal: 'focus' },
    ]
  }

  return floorDepartments.map((departmentId, index) => ({
    name: DEPARTMENTS[departmentId]?.name ?? departmentId,
    description: index % 2 === 0 ? '업무 처리와 응답이 많은 구역' : '자료 확인과 정리가 많은 구역',
    accent: DEPARTMENTS[departmentId]?.color ?? accentColor,
    signal: index === 0 ? 'focus' : index % 2 === 0 ? 'steady' : 'watch',
  }))
}

function getSummaryText(currentFloor: FloorId, floorDepartments: DepartmentId[]) {
  if (currentFloor === '1f') {
    return '회의 일정, 참석 인원, 회의실 사용 흐름을 한 화면에서 확인합니다.'
  }

  if (currentFloor === '2f') {
    return '마케팅 준비 자료 조사와 시장 흐름 확인 상황을 묶어서 보여줍니다.'
  }

  return `${floorDepartments.map((departmentId) => DEPARTMENTS[departmentId]?.name ?? departmentId).join(', ')} 업무 상황과 인원 움직임을 한눈에 확인합니다.`
}

function formatAgentNames(names: string[]) {
  const preview = names.slice(0, 3).join(', ')
  return names.length > 3 ? `${preview} 외 ${names.length - 3}명이 움직이고 있습니다.` : `${preview}이 움직이고 있습니다.`
}

function resolveMessageFloors(message: Message): FloorId[] {
  if (message.channelFloorId) return [message.channelFloorId]
  if (!message.departmentIds || message.departmentIds.length === 0) return []
  return Array.from(new Set(message.departmentIds.map((departmentId) => resolveDepartmentFloor(departmentId))))
}
