import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveAgentFloor, resolveDepartmentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { FLOORS, FloorId, Message, Task, WorkspaceView } from '@/types'
import { formatTime } from '@/utils/dateFormat'
import { repairLegacyTaskTitle } from '@/utils/taskTitle'

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
  agents: '에이전트',
  files: '결과 파일',
  settings: '설정',
}

const FLOOR_ORDER: FloorId[] = ['11f', '10f', '9f', '8f', '7f', '6f', '5f', '4f', '3f', '2f', '1f']

export default function Header() {
  const {
    agents,
    messages,
    tasks,
    activeView,
    currentFloor,
    notificationsSeenAt,
    setActiveView,
    setCurrentFloor,
    toggleTheme,
    markNotificationsSeen,
  } = useAgentStore(
    useShallow((s) => ({
      agents: s.agents,
      messages: s.messages,
      tasks: s.tasks,
      activeView: s.activeView,
      currentFloor: s.currentFloor,
      notificationsSeenAt: s.notificationsSeenAt,
      setActiveView: s.setActiveView,
      setCurrentFloor: s.setCurrentFloor,
      toggleTheme: s.toggleTheme,
      markNotificationsSeen: s.markNotificationsSeen,
    }))
  )

  const [search, setSearch] = useState('')
  const [searchHint, setSearchHint] = useState<string | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  useEffect(() => {
    if (!searchHint) return
    const timer = setTimeout(() => setSearchHint(null), 3000)
    return () => clearTimeout(timer)
  }, [searchHint])
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const notifications = useMemo<NotificationItem[]>(() => {
    const taskItems = tasks.map((task) => ({
      id: `task-${task.id}`,
      title: buildTaskTitle(task),
      description: repairLegacyTaskTitle(task).title,
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
      .sort((left, right) => right.time.getTime() - left.time.getTime())
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
        setSearchHint(`관련 대화가 있는 ${FLOORS[floorId].label}로 이동했습니다.`)
      } else {
        setActiveView('chat')
        setSearchHint('관련 대화를 팀 채팅 화면에서 확인할 수 있습니다.')
      }
      return
    }

    setSearchHint('일치하는 층, 에이전트, 대화를 찾지 못했습니다.')
  }

  return (
    <header className="relative z-20 h-12 shrink-0 border-b border-office-panel bg-office-sidebar md:h-12">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-semibold text-white">AI 오피스</h1>
            <p className="text-[11px] text-office-text/40">{VIEW_LABEL[activeView]}</p>
          </div>

          <div ref={editorRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsEditorOpen((current) => !current)
                setIsNotificationsOpen(false)
              }}
              title="층 이동, 화면 전환, 테마 변경 메뉴를 엽니다."
              className="flex items-center gap-2 rounded bg-office-panel px-3 py-1.5 text-sm text-office-active transition-colors hover:bg-office-panel/80"
            >
              <span>바로가기</span>
            </button>

            {isEditorOpen ? (
              <div className="fixed inset-x-4 top-14 z-50 rounded-2xl border border-office-panel bg-office-sidebar p-4 shadow-2xl md:absolute md:inset-x-auto md:left-0 md:top-full md:mt-2 md:w-[380px]">
                <div>
                  <p className="text-sm font-semibold text-white">빠른 이동</p>
                  <p className="mt-1 text-xs text-office-text/50">
                    층 이동과 화면 전환, 테마를 빠르게 바꿀 수 있습니다.
                  </p>
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
                          title={`${FLOORS[floorId].label} ${FLOORS[floorId].name}층으로 이동합니다.`}
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
                          title={`${VIEW_LABEL[view]} 화면으로 이동합니다.`}
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
          <div className="relative hidden md:flex">
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
            title="다음 테마로 전환"
            aria-label="다음 테마로 전환"
            className="hidden md:flex h-8 w-8 items-center justify-center text-office-text transition-colors hover:text-white"
          >
            🎨
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
              aria-label={`알림 센터${unreadCount > 0 ? ` (미확인 ${unreadCount}건)` : ''}`}
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-office-accent px-1 text-center text-[10px] font-semibold text-white">
                  {Math.min(unreadCount, 9)}
                </span>
              ) : null}
            </button>

            {isNotificationsOpen ? (
              <div className="fixed inset-x-4 top-14 z-50 rounded-2xl border border-office-panel bg-office-sidebar p-4 shadow-2xl md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-[360px]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">알림 센터</p>
                    <p className="mt-1 text-xs text-office-text/50">최근 업무와 대화 {notifications.length}건을 표시합니다.</p>
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
                      title="이 알림이 발생한 화면이나 층으로 이동합니다."
                      className="w-full rounded-xl border border-office-panel/70 bg-office-panel/50 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/80"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="text-[11px] text-office-text/40">
                          {formatTime(item.time)}
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

          <button
            type="button"
            onClick={() => setActiveView('settings')}
            title="설정"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              activeView === 'settings'
                ? 'bg-office-active text-office-bg'
                : 'bg-office-panel text-office-text hover:bg-office-active/20 hover:text-white'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}

function buildTaskTitle(task: Task): string {
  switch (task.status) {
    case 'pending':
      return '새 업무 대기'
    case 'in_progress':
      return '업무 진행 중'
    case 'completed':
      return '업무 완료'
    case 'awaiting_approval':
      return '승인 대기 중'
    case 'failed':
      return '업무 실패'
  }
}

function buildMessageTitle(message: Message) {
  switch (message.type) {
    case 'task':
      return '작업 요청 접수'
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
