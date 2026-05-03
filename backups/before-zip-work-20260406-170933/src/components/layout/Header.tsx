import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { resolveAgentFloor, resolveDepartmentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { FLOORS, FloorId, Message, Task, WorkspaceView } from '@/types'

type NotificationItem = {
  id: string
  title: string
  description: string
  time: Date
  floorId?: FloorId
  targetView: WorkspaceView
}

const VIEW_LABEL: Record<WorkspaceView, string> = {
  dashboard: '대시보드',
  office: 'AI 오피스',
  tasks: '작업 관리',
  chat: '팀 채팅',
  settings: '설정',
}

const FLOOR_ORDER: FloorId[] = ['12f', '11f', '10f', '9f', '8f', '7f', '6f', '5f', '4f', '3f', '2f', '1f']

export default function Header() {
  const {
    agents,
    messages,
    tasks,
    activeView,
    currentFloor,
    themeMode,
    officeViewMode,
    autoBehaviorEnabled,
    notificationsSeenAt,
    setActiveView,
    setCurrentFloor,
    toggleTheme,
    setOfficeViewMode,
    setAutoBehaviorEnabled,
    markNotificationsSeen,
  } = useAgentStore()

  const [search, setSearch] = useState('')
  const [searchHint, setSearchHint] = useState<string | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const notifications = useMemo<NotificationItem[]>(() => {
    const taskItems = tasks.map((task) => ({
      id: `task-${task.id}`,
      title: buildTaskTitle(task),
      description: task.title,
      time: task.createdAt,
      floorId: task.assignedTo[0] ? resolveDepartmentFloor(task.assignedTo[0]) : undefined,
      targetView: 'tasks' as const,
    }))

    const messageItems = messages.map((message) => ({
      id: `message-${message.id}`,
      title: buildMessageTitle(message),
      description: collapseMessage(message.content),
      time: message.timestamp,
      floorId: resolveMessageFloor(message),
      targetView: resolveMessageFloor(message) ? 'office' as const : 'chat' as const,
    }))

    return [...taskItems, ...messageItems]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 12)
  }, [messages, tasks])

  const unreadCount = notifications.filter((item) => item.time.getTime() > notificationsSeenAt.getTime()).length

  useEffect(() => {
    if (!isNotificationsOpen) return
    markNotificationsSeen(new Date())
  }, [isNotificationsOpen, markNotificationsSeen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (editorRef.current && !editorRef.current.contains(target)) {
        setIsEditorOpen(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setIsNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const quickSearch = () => {
    const query = search.trim().toLowerCase()
    if (!query) {
      setSearchHint('검색어를 입력하세요.')
      return
    }

    const floorMatch = FLOOR_ORDER.find((floorId) => {
      const floor = FLOORS[floorId]
      return floor.label.toLowerCase().includes(query) || floor.name.toLowerCase().includes(query)
    })
    if (floorMatch) {
      setCurrentFloor(floorMatch)
      setActiveView('office')
      setSearchHint(`${FLOORS[floorMatch].label} ${FLOORS[floorMatch].name}로 이동했습니다.`)
      return
    }

    const agentMatch = agents.find((agent) =>
      [agent.name, agent.role].some((field) => field.toLowerCase().includes(query)),
    )
    if (agentMatch) {
      const floorId = resolveAgentFloor(agentMatch)
      setCurrentFloor(floorId)
      setActiveView('office')
      setSearchHint(`${agentMatch.name}이 있는 ${FLOORS[floorId].label}로 이동했습니다.`)
      return
    }

    const messageMatch = messages.find((message) => message.content.toLowerCase().includes(query))
    if (messageMatch) {
      const floorId = resolveMessageFloor(messageMatch)
      if (floorId) {
        setCurrentFloor(floorId)
        setActiveView('office')
        setSearchHint(`관련 대화가 있는 ${FLOORS[floorId].label} 채널로 이동했습니다.`)
      } else {
        setActiveView('chat')
        setSearchHint('관련 대화를 팀 채팅 화면에서 확인할 수 있습니다.')
      }
      return
    }

    setSearchHint('일치하는 층, 에이전트, 대화를 찾지 못했습니다.')
  }

  return (
    <header className="relative z-20 h-12 shrink-0 border-b border-office-panel bg-office-sidebar">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-white font-semibold">AI 오피스</h1>
            <p className="text-[11px] text-office-text/40">{VIEW_LABEL[activeView]}</p>
          </div>

          <div ref={editorRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsEditorOpen((current) => !current)
                setIsNotificationsOpen(false)
              }}
              className="flex items-center gap-2 rounded bg-office-panel px-3 py-1.5 text-sm text-office-active transition-colors hover:bg-office-panel/80"
            >
              <span>✏</span>
              <span>사무실 편집</span>
            </button>

            {isEditorOpen ? (
              <div className="absolute left-0 top-full mt-2 w-[380px] rounded-2xl border border-office-panel bg-office-sidebar p-4 shadow-2xl">
                <div>
                  <p className="text-sm font-semibold text-white">오피스 제어</p>
                  <p className="mt-1 text-xs text-office-text/50">층 이동과 보기 상태를 한 번에 바꿀 수 있습니다.</p>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-office-text/40">층 바로가기</p>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {FLOOR_ORDER.map((floorId) => (
                        <button
                          key={floorId}
                          type="button"
                          onClick={() => {
                            setCurrentFloor(floorId)
                            setActiveView('office')
                            setIsEditorOpen(false)
                          }}
                          className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                            currentFloor === floorId
                              ? 'border-office-active bg-office-active/20 text-office-active'
                              : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                          }`}
                        >
                          {FLOORS[floorId].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <ControlCard
                      title="오피스 보기"
                      description={officeViewMode === '3d' ? '3D 아이소 뷰' : '2D 픽셀 뷰'}
                      actions={
                        <div className="flex gap-2">
                          <MiniToggle active={officeViewMode === '3d'} label="3D" onClick={() => setOfficeViewMode('3d')} />
                          <MiniToggle active={officeViewMode === '2d'} label="2D" onClick={() => setOfficeViewMode('2d')} />
                        </div>
                      }
                    />
                    <ControlCard
                      title="자율 메모"
                      description={autoBehaviorEnabled ? '현재 자동 생성 켜짐' : '현재 자동 생성 꺼짐'}
                      actions={
                        <div className="flex gap-2">
                          <MiniToggle active={autoBehaviorEnabled} label="켜기" onClick={() => setAutoBehaviorEnabled(true)} />
                          <MiniToggle active={!autoBehaviorEnabled} label="끄기" onClick={() => setAutoBehaviorEnabled(false)} />
                        </div>
                      }
                    />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-office-text/40">화면 이동</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(Object.keys(VIEW_LABEL) as WorkspaceView[]).map((view) => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => {
                            setActiveView(view)
                            setIsEditorOpen(false)
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            activeView === view
                              ? 'border-office-active bg-office-active/20 text-office-active'
                              : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                          }`}
                        >
                          {VIEW_LABEL[view]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  quickSearch()
                }
              }}
              placeholder="층, 에이전트, 대화 검색..."
              className="w-52 rounded border border-office-panel/50 bg-office-panel px-3 py-1.5 text-sm text-office-text placeholder-office-text/40 focus:border-office-active focus:outline-none"
            />
            {searchHint ? (
              <p className="absolute right-0 top-full mt-1 rounded-md border border-office-panel/70 bg-office-sidebar px-2 py-1 text-[10px] text-office-text/50 shadow-lg">
                {searchHint}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            title={themeMode === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}
            className="flex h-8 w-8 items-center justify-center text-office-text transition-colors hover:text-white"
          >
            {themeMode === 'dark' ? '☀' : '☾'}
          </button>

          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsNotificationsOpen((current) => !current)
                setIsEditorOpen(false)
              }}
              className="relative flex h-8 w-8 items-center justify-center text-office-text transition-colors hover:text-white"
              title="알림 센터"
            >
              🔔
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-office-accent px-1 text-center text-[10px] font-semibold text-white">
                  {Math.min(unreadCount, 9)}
                </span>
              ) : null}
            </button>

            {isNotificationsOpen ? (
              <div className="absolute right-0 top-full mt-2 w-[360px] rounded-2xl border border-office-panel bg-office-sidebar p-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">알림 센터</p>
                    <p className="mt-1 text-xs text-office-text/50">최근 업무와 대화 12건을 표시합니다.</p>
                  </div>
                  <span className="text-xs text-office-text/40">미확인 {unreadCount}건</span>
                </div>

                <div className={`mt-4 space-y-3 ${notifications.length > 5 ? 'max-h-[26rem] overflow-y-auto pr-1' : ''}`}>
                  {notifications.length > 0 ? notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.floorId) {
                          setCurrentFloor(item.floorId)
                        }
                        setActiveView(item.targetView)
                        setIsNotificationsOpen(false)
                      }}
                      className="w-full rounded-xl border border-office-panel/70 bg-office-panel/50 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/80"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="text-[11px] text-office-text/40">
                          {item.time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-office-text/60">{item.description}</p>
                    </button>
                  )) : (
                    <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-8 text-center text-sm text-office-text/50">
                      아직 표시할 알림이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-office-accent text-sm font-bold text-white">
            A
          </div>
        </div>
      </div>
    </header>
  )
}

function buildTaskTitle(task: Task) {
  switch (task.status) {
    case 'pending':
      return '새 업무 대기'
    case 'in_progress':
      return '업무 진행 중'
    case 'completed':
      return '업무 완료'
    case 'failed':
      return '업무 실패'
  }
}

function buildMessageTitle(message: Message) {
  switch (message.type) {
    case 'task':
      return '새 요청 접수'
    case 'result':
      return `${message.senderName} 결과 업데이트`
    case 'debate':
      return `${message.senderName} 토론 메시지`
    case 'system':
      return `${message.senderName} 시스템 안내`
  }
}

function collapseMessage(content: string) {
  return content.replace(/\s+/g, ' ').slice(0, 90)
}

function resolveMessageFloor(message: Message): FloorId | undefined {
  if (message.channelFloorId) {
    return message.channelFloorId
  }

  if (message.departmentIds && message.departmentIds.length > 0) {
    return resolveDepartmentFloor(message.departmentIds[0])
  }

  return undefined
}

function ControlCard({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions: ReactNode
}) {
  return (
    <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 p-3">
      <p className="text-xs font-semibold text-white">{title}</p>
      <p className="mt-1 text-[11px] text-office-text/50">{description}</p>
      <div className="mt-3">{actions}</div>
    </div>
  )
}

function MiniToggle({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-office-active bg-office-active/20 text-office-active'
          : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}
