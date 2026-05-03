import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveDepartmentFloor } from '@/services/directives'
import { runChannelMessage, runTask } from '@/services/agentOrchestrator'
import { prepareUploadedFiles } from '@/services/fileContext'
import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, DepartmentId, FLOORS, Message } from '@/types'
import type { UploadedFile } from '@/types'
import MessageContent from '@/components/layout/MessageContent'

const CHANNEL_ORDER: DepartmentId[] = [
  'ceo', 'executive',
  'security',
  'compliance', 'management', 'finance', 'hr', 'legal',
  'development',
  'qa', 'devops',
  'planning',
  'support', 'customer',
  'sales', 'b2g', 'expertsales', 'global',
  'marketing', 'presales', 'trend',
]

const TYPE_LABEL: Record<Message['type'], string> = {
  task: '업무',
  result: '결과',
  debate: '토론',
  system: '시스템',
}

const TYPE_COLOR: Record<Message['type'], string> = {
  task: 'bg-office-active/20 text-office-active',
  result: 'bg-emerald-500/20 text-emerald-400',
  debate: 'bg-purple-500/20 text-purple-400',
  system: 'bg-office-panel/60 text-office-text/60',
}

function isMessageInDeptChannel(message: Message, deptId: DepartmentId): boolean {
  const deptFloor = resolveDepartmentFloor(deptId)

  if (message.channelFloorId) return message.channelFloorId === deptFloor
  if (message.departmentIds && message.departmentIds.length > 0) {
    return message.departmentIds.includes(deptId)
  }
  return false
}

export default function TeamChatView() {
  const { agents, messages, setActiveView } = useAgentStore()
  const [activeDept, setActiveDept] = useState<DepartmentId>('ceo')
  const [mobileView, setMobileView] = useState<'channels' | 'chat'>('channels')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<UploadedFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPreparingFiles, setIsPreparingFiles] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }

  function isNearBottom() {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const channelMessages = useMemo(() => (
    messages
      .filter((m) => isMessageInDeptChannel(m, activeDept))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  ), [messages, activeDept])

  // 새 메시지: 하단 근처일 때만 자동 스크롤
  useEffect(() => {
    if (isNearBottom()) {
      scrollToBottom()
    }
  }, [channelMessages])

  // 채널 전환 시엔 항상 하단으로
  useEffect(() => {
    scrollToBottom('auto')
  }, [activeDept])

  // 부서별 미확인 메시지 수
  const unreadByDept = useMemo(() => {
    const counts: Partial<Record<DepartmentId, number>> = {}
    for (const deptId of CHANNEL_ORDER) {
      const count = messages.filter(
        (m) => isMessageInDeptChannel(m, deptId) && m.sender !== 'user'
      ).length
      if (count > 0) counts[deptId] = count
    }
    return counts
  }, [messages])

  async function handleSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    setIsPreparingFiles(true)
    try {
      const uploaded = await prepareUploadedFiles(Array.from(fileList))
      setAttachments((prev) => [...prev, ...uploaded])
    } finally {
      setIsPreparingFiles(false)
      e.target.value = ''
    }
  }

  const isCeoChannel = activeDept === 'ceo'

  async function handleSend() {
    const text = input.trim()
    if ((text.length === 0 && attachments.length === 0) || isLoading || isPreparingFiles) return

    const submitted = attachments
    setInput('')
    setAttachments([])
    setIsLoading(true)
    try {
      // CEO 채널(12F)은 전사 공지 — CEO 라우팅을 통해 전 부서로 전달
      if (isCeoChannel) {
        await runTask(text, submitted)
      } else {
        await runChannelMessage(activeDept, text, submitted)
      }
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const dept = DEPARTMENTS[activeDept]
  const floor = FLOORS[resolveDepartmentFloor(activeDept)]
  const deptAgents = agents.filter((a) => a.departmentId === activeDept)

  return (
    <section className="flex flex-1 overflow-hidden bg-office-bg">
      {/* 채널 목록 사이드바 */}
      <div className={`shrink-0 overflow-y-auto border-r border-office-panel bg-office-sidebar w-full md:w-60 ${mobileView === 'chat' ? 'hidden md:block' : 'block'}`}>
        <div className="px-4 pb-3 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-office-text/40">채널</p>
        </div>
        <div className="space-y-0.5 px-2 pb-4">
          {CHANNEL_ORDER.map((deptId) => {
            const d = DEPARTMENTS[deptId]
            const isActive = activeDept === deptId
            const unread = unreadByDept[deptId] ?? 0
            return (
              <button
                key={deptId}
                type="button"
                onClick={() => { setActiveDept(deptId); setMobileView('chat') }}
                title={`${d.name} 팀 채널 대화를 엽니다.`}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-office-active/20 text-white'
                    : 'text-office-text/60 hover:bg-office-panel/60 hover:text-office-text'
                }`}
              >
                <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="flex-1 truncate">{d.name}</span>
                {unread > 0 && !isActive && (
                  <span className="rounded-full bg-office-active/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 채널 본문 */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${mobileView === 'channels' ? 'hidden md:flex' : 'flex'}`}>
        {/* 채널 헤더 */}
        <div className={`flex items-center justify-between border-b border-office-panel px-5 py-3 ${isCeoChannel ? 'bg-yellow-500/5' : 'bg-office-sidebar'}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileView('channels')}
              className="md:hidden text-sm text-office-active mr-1"
            >
              ← 채널
            </button>
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: dept.color }} />
            <div>
              <span className="text-sm font-semibold text-white">{dept.name}</span>
              <span className="ml-2 text-xs text-office-text/40">{floor.label} · {deptAgents.length}명</span>
            </div>
            {isCeoChannel && (
              <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                전사 공지
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveView('office')}
            title="현재 채널을 닫고 AI 오피스로 돌아갑니다."
            className="rounded border border-office-panel/70 bg-office-panel px-3 py-1 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            오피스
          </button>
        </div>

        {/* 메시지 목록 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
          {channelMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-office-text/30">
              <div className="h-8 w-8 rounded-full" style={{ backgroundColor: dept.color + '33' }} />
              <p className="text-sm">{dept.name} 채널에 아직 대화가 없습니다.</p>
              <p className="text-xs">아래 입력창으로 팀에게 메시지를 보내보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {channelMessages.map((message) => {
                const isUser = message.sender === 'user'
                return (
                  <div key={message.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                    {/* 아바타 */}
                    <div
                      className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: isUser ? '#555' : dept.color }}
                    >
                      {isUser ? '나' : message.senderName.slice(0, 1)}
                    </div>

                    {/* 말풍선 */}
                    <div className={`max-w-[72%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      <div className="flex items-center gap-2">
                        {!isUser && (
                          <span className="text-xs font-semibold text-office-text/70">{message.senderName}</span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLOR[message.type]}`}>
                          {TYPE_LABEL[message.type]}
                        </span>
                        <span className="text-[10px] text-office-text/30">
                          {message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          isUser
                            ? 'rounded-tr-sm bg-office-active/25 text-white'
                            : 'rounded-tl-sm bg-office-sidebar border border-office-panel/60 text-office-text'
                        }`}
                      >
                        <MessageContent content={message.content} streaming={message.streaming} />
                      </div>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {message.attachments.map((f) => (
                            <span
                              key={f.id}
                              className="rounded-full border border-office-panel/60 bg-office-panel/40 px-2 py-0.5 text-[10px] text-office-text/60"
                            >
                              {f.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {isLoading && (
                <div className="flex gap-3">
                  <div
                    className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: dept.color }}
                  >
                    {dept.name.slice(0, 1)}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-office-panel/60 bg-office-sidebar px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-office-text/40 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-office-text/40 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-office-text/40 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* 입력창 */}
        <div className="border-t border-office-panel bg-office-sidebar px-4 py-3">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((f, i) => (
                <span
                  key={f.id}
                  className="flex items-center gap-1.5 rounded-full border border-office-panel/60 bg-office-panel/60 pl-3 pr-2 py-1 text-xs text-office-text/80"
                >
                  {f.name}
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    title="이 첨부 파일을 입력 목록에서 제거합니다."
                    className="text-office-text/40 hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleSelectFiles}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="shrink-0 rounded-lg border border-office-panel/60 bg-office-panel/40 p-2 text-office-text/50 transition-colors hover:border-office-active/50 hover:text-office-active disabled:opacity-40"
              title="파일 첨부"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0z"/>
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isCeoChannel ? '전사 공지 입력... CEO가 전 부서로 전달합니다 (Enter 전송)' : `${dept.name}팀에게 메시지 보내기... (Enter 전송, Shift+Enter 줄바꿈)`}
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-lg border border-office-panel/60 bg-office-panel/40 px-3 py-2 text-sm text-white placeholder-office-text/30 outline-none focus:border-office-active/60 disabled:opacity-50"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading || isPreparingFiles || (input.trim().length === 0 && attachments.length === 0)}
              title={isCeoChannel ? '전사 공지를 전송합니다.' : `${dept.name} 팀 채널로 메시지를 보냅니다.`}
              className="shrink-0 rounded-lg border border-office-active/40 bg-office-active/10 px-4 py-2 text-sm font-semibold text-office-active transition-colors hover:bg-office-active/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
