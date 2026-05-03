import { useMemo, useState } from 'react'
import { resolveAgentFloor, resolveDepartmentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { Agent, FLOORS, FloorId, Message } from '@/types'

type FloorFilter = 'all' | FloorId
type MessageFilter = 'all' | Message['type']

const FLOOR_ORDER: FloorId[] = ['12f', '11f', '10f', '9f', '8f', '7f', '6f', '5f', '4f', '3f', '2f', '1f']
const TYPE_LABEL: Record<Message['type'], string> = {
  task: '업무',
  result: '결과',
  debate: '토론',
  system: '시스템',
}

export default function TeamChatView() {
  const { agents, messages, currentFloor, setActiveView, setCurrentFloor } = useAgentStore()
  const [floorFilter, setFloorFilter] = useState<FloorFilter>('all')
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all')

  const filteredMessages = useMemo(() => {
    return [...messages]
      .filter((message) => messageFilter === 'all' || message.type === messageFilter)
      .filter((message) => floorFilter === 'all' || isVisibleOnFloor(message, floorFilter, agents))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }, [agents, floorFilter, messageFilter, messages])

  return (
    <section className="flex flex-1 overflow-hidden bg-office-bg">
      <div className="w-[280px] shrink-0 border-r border-office-panel bg-office-sidebar p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-office-active">팀 채팅</p>
            <h2 className="mt-1 text-xl font-semibold text-white">채널 모니터</h2>
            <p className="mt-2 text-xs text-office-text/50">
              층과 메시지 유형으로 대화를 모아볼 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveView('office')}
            className="shrink-0 whitespace-nowrap rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            오피스
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-office-text/40">층 필터</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip
              active={floorFilter === 'all'}
              label="전체"
              onClick={() => setFloorFilter('all')}
            />
            {FLOOR_ORDER.map((floorId) => (
              <FilterChip
                key={floorId}
                active={floorFilter === floorId}
                label={FLOORS[floorId].label}
                onClick={() => {
                  setFloorFilter(floorId)
                  setCurrentFloor(floorId)
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-office-text/40">메시지 유형</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip active={messageFilter === 'all'} label="전체" onClick={() => setMessageFilter('all')} />
            {(Object.keys(TYPE_LABEL) as Message['type'][]).map((type) => (
              <FilterChip
                key={type}
                active={messageFilter === type}
                label={TYPE_LABEL[type]}
                onClick={() => setMessageFilter(type)}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-office-panel/70 bg-office-panel/40 p-4">
          <p className="text-xs text-office-text/40">현재 선택 층</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {FLOORS[currentFloor].label} {FLOORS[currentFloor].name}
          </p>
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="mt-4 text-xs text-office-active transition-colors hover:text-white"
          >
            대시보드로 이동
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          {filteredMessages.length > 0 ? filteredMessages.map((message) => {
            const floors = resolveMessageFloors(message, agents)
            const floorLabel = floors.length > 0 ? floors.map((floorId) => FLOORS[floorId].label).join(', ') : '공통'

            return (
              <article
                key={message.id}
                className="rounded-2xl border border-office-panel bg-office-sidebar p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-office-active/20 px-2 py-1 text-[11px] text-office-active">
                        {TYPE_LABEL[message.type]}
                      </span>
                      <span className="rounded-full bg-office-panel/60 px-2 py-1 text-[11px] text-office-text/70">
                        {floorLabel}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">{message.senderName}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-office-text/40">
                      {message.timestamp.toLocaleString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {floors[0] ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentFloor(floors[0])
                          setActiveView('office')
                        }}
                        className="mt-2 text-xs text-office-active transition-colors hover:text-white"
                      >
                        해당 층 열기
                      </button>
                    ) : null}
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm text-office-text">{message.content}</p>

                {message.attachments && message.attachments.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <span
                        key={attachment.id}
                        className="rounded-full border border-office-panel/70 bg-office-panel/40 px-3 py-1 text-xs text-office-text/70"
                      >
                        {attachment.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          }) : (
            <div className="rounded-2xl border border-dashed border-office-panel/70 bg-office-sidebar px-6 py-20 text-center text-office-text/50">
              조건에 맞는 대화가 없습니다.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'border-office-active bg-office-active/20 text-office-active'
          : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function isVisibleOnFloor(message: Message, floorId: FloorId, agents: Agent[]) {
  return resolveMessageFloors(message, agents).includes(floorId)
}

function resolveMessageFloors(message: Message, agents: Agent[]): FloorId[] {
  if (message.channelFloorId) {
    return [message.channelFloorId]
  }

  if (message.departmentIds && message.departmentIds.length > 0) {
    return Array.from(new Set(message.departmentIds.map((departmentId) => resolveDepartmentFloor(departmentId))))
  }

  const sender = agents.find((agent) => agent.id === message.sender)
  return sender ? [resolveAgentFloor(sender)] : []
}
