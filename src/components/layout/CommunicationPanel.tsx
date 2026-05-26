import { type ChangeEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { resolveDepartmentFloor } from '@/services/directives'
import { useTaskActions } from '@/hooks/useTaskActions'
import { formatFileSize, prepareUploadedFiles } from '@/services/fileContext'
import { exportMessages, exportMessage } from '@/services/exportService'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { DEPARTMENTS, FLOORS } from '@/types'
import type { Agent, Message, UploadedFile } from '@/types'
import ArchiveTreeView from './ArchiveTreeView'
import MessageContent from './MessageContent'
import { getStreamingContent, subscribeToStreaming } from '@/services/streamingCache'

const ATTACHMENT_ANALYSIS_PROMPT = '첨부한 파일의 핵심 내용과 구조를 분석해 주세요.'

interface CommunicationPanelProps {
  onClose?: () => void
}

// 스트리밍 캐시 구독 훅 — rAF 기반이므로 Zustand set() 없이 60fps로 UI 업데이트
function useStreamingTick() {
  const [, tick] = useReducer((x: number) => x + 1, 0)
  useEffect(() => subscribeToStreaming(tick), [])
}

// 에이전트 원문 메시지 여부 — 기본 접힘 대상
function isRawAgentMessage(message: Message): boolean {
  return message.type === 'result' || message.type === 'debate'
}

// 비서 보고 요약 여부 — 강조 표시
function isBriefingSummary(message: Message): boolean {
  return message.type === 'system' && message.senderName.includes('비서 보고')
}

export default function CommunicationPanel({ onClose }: CommunicationPanelProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<UploadedFile[]>([])
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) =>
    setExpandedMessages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const { submitTask, submitChannelMessage, isRunning: isLoading } = useTaskActions()
  const [isPreparingFiles, setIsPreparingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  useStreamingTick() // 스트리밍 캐시 변경 시 이 컴포넌트만 리렌더
  const { messages, agents, currentFloor, tasks, activeThreadId, setActiveThreadId } = useAgentStore(
    useShallow((s) => ({
      messages: s.messages,
      agents: s.agents,
      currentFloor: s.currentFloor,
      tasks: s.tasks,
      activeThreadId: s.activeThreadId,
      setActiveThreadId: s.setActiveThreadId,
    }))
  )
  const activeThread = activeThreadId
    ? tasks.find((t) => t.id === activeThreadId || t.threadId === activeThreadId)
    : null
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  function isNearBottom() {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  const floor = FLOORS[currentFloor]
  const hasChannel = currentFloor === '2f' || floor.departments.length > 0
  const visibleMessages = useMemo(
    () => hasChannel
      ? messages.filter((message) => isMessageVisibleOnFloor(message, currentFloor, floor.departments, agents))
      : [],
    [hasChannel, messages, currentFloor, floor.departments, agents],
  )
  const floorTeamsLabel = currentFloor === '2f'
    ? '대회의실, 중회의실, 소회의실'
    : floor.departments.map((deptId) => DEPARTMENTS[deptId].name).join(', ')

  useEffect(() => {
    if (isNearBottom()) {
      scrollToBottom()
    }
  }, [scrollToBottom, visibleMessages])

  useEffect(() => {
    scrollToBottom('auto')
  }, [attachments, currentFloor, scrollToBottom])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [input])

  const handleSelectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList || fileList.length === 0) return

    setUploadError(null)
    setIsPreparingFiles(true)

    try {
      const uploaded = await prepareUploadedFiles(Array.from(fileList))
      setAttachments((current) => [...current, ...uploaded])
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '선택한 파일을 읽지 못했습니다.')
    } finally {
      setIsPreparingFiles(false)
      event.target.value = ''
    }
  }

  const handleSubmit = async () => {
    const text = input.trim()
    if ((text.length === 0 && attachments.length === 0) || isLoading || isPreparingFiles) return

    const submittedAttachments = attachments
    const taskPrompt = text || ATTACHMENT_ANALYSIS_PROMPT

    setInput('')
    setAttachments([])
    setUploadError(null)
    // 12F(대표실)에서만 전사 라우팅, 나머지 층은 해당 부서에만 전달
    if (currentFloor === '11f' || floor.departments.length === 0) {
      await submitTask(taskPrompt, submittedAttachments)
    } else {
      await submitChannelMessage(floor.departments[0], taskPrompt, submittedAttachments)
    }
  }

  const canSubmit = !isLoading && !isPreparingFiles && (input.trim().length > 0 || attachments.length > 0)

  const [panelWidth, setPanelWidth] = useState(320)
  const isResizing = useRef(false)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true

    const startX = e.clientX
    const startWidth = panelWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return
      const delta = startX - moveEvent.clientX
      const next = Math.min(640, Math.max(240, startWidth + delta))
      setPanelWidth(next)
    }

    const onMouseUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [panelWidth])

  return (
    <aside
      className="relative flex min-h-0 flex-1 flex-col border-l border-office-panel bg-office-sidebar md:flex-none md:shrink-0"
      style={{ width: typeof window !== 'undefined' && window.innerWidth >= 768 ? panelWidth : undefined }}
    >
      {/* 리사이즈 핸들 */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-office-active/40 transition-colors"
        style={{ transform: 'translateX(-2px)' }}
      />
      <div className="p-4 border-b border-office-panel">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white text-sm font-semibold">팀 채널</p>
            <p className="text-office-text/60 text-xs">{`${floor.label} ${floor.name}`}</p>
            <p className="mt-1 text-[11px] text-office-text/40">
              {floorTeamsLabel || '이 구역에는 소속 부서가 없습니다.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {visibleMessages.length > 0 && (
              <button
                type="button"
                onClick={() => exportMessages(visibleMessages, `${floor.label} ${floor.name}`)}
                className="shrink-0 rounded border border-office-panel/70 px-2 py-1 text-[11px] text-office-text/60 transition-colors hover:border-office-active hover:text-white"
              title="이 채널 대화 내보내기"
            >
              내보내기
            </button>
            )}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-office-panel/70 px-2 py-1 text-[11px] text-office-text/60 transition-colors hover:border-office-active hover:text-white"
                title="채널 닫기"
              >
                닫기
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain p-4">
        {!hasChannel ? (
          <div className="mt-8 space-y-2 text-center text-sm text-office-text/50">
            <p>이 구역에는 팀 채널을 볼 수 있는 부서가 없습니다.</p>
            <div className="space-y-1 text-xs text-office-text/40">
              <p>부서가 있는 구역을 선택하면 해당 팀 대화만 볼 수 있습니다.</p>
            </div>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="mt-8 space-y-2 text-center text-sm text-office-text/50">
            <p>{currentFloor === '2f' ? '회의실 대화가 아직 없습니다.' : `${floor.name} 팀 대화가 아직 없습니다.`}</p>
            <div className="space-y-1 text-xs text-office-text/40">
              {currentFloor === '2f' ? (
                <p>대회의실, 중회의실, 소회의실 소집 요청이 들어오면 이 채널에 대화가 표시됩니다.</p>
              ) : (
                <p>업무를 지시하면 배정된 조직 구역의 팀 채널에 대화가 표시됩니다.</p>
              )}
              <p>첨부 파일도 이 채널에서 함께 확인됩니다.</p>
            </div>
          </div>
        ) : (
          visibleMessages.map((message) => {
            const isRaw = isRawAgentMessage(message)
            const isBriefing = isBriefingSummary(message)
            const isExpanded = expandedMessages.has(message.id)
            const content = message.streaming
              ? (getStreamingContent(message.id) ?? message.content)
              : message.content

            // ── 비서 보고 요약 카드 ───────────────────────────────────────────
            if (isBriefing) {
              return (
                <div
                  key={message.id}
                  className="rounded-xl border border-office-active/40 bg-office-active/10 p-4 text-sm mr-2"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-office-active/60">비서 보고</span>
                    <p className="text-xs font-semibold text-office-active">{message.senderName.replace(' (비서 보고)', '')}</p>
                    <span className="ml-auto text-[10px] text-office-text/30">
                      {message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <MessageContent content={content} streaming={message.streaming} />
                </div>
              )
            }

            // ── 에이전트 원문 (result/debate) — 기본 접힘 ────────────────────
            if (isRaw) {
              return (
                <div
                  key={message.id}
                  className="rounded-lg border border-office-panel/50 bg-office-panel/30 mr-4 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(message.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-office-text/40 uppercase tracking-wide shrink-0">
                        {message.type === 'debate' ? '토론' : '실행 결과'}
                      </span>
                      <p className="text-xs text-office-text/60 truncate">{message.senderName}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!isExpanded && (
                        <span className="text-[10px] text-office-text/30 truncate max-w-[120px]">
                          {content.slice(0, 40).replace(/\n/g, ' ')}…
                        </span>
                      )}
                      <span className="text-[10px] text-office-text/40">{isExpanded ? '▲ 접기' : '▼ 펼치기'}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-office-panel/40 px-3 pb-3 pt-2">
                      <MessageContent content={content} streaming={message.streaming} />
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {message.attachments.map((att) => (
                            <AttachmentCard key={att.id} attachment={att} removable={false} />
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[10px] text-office-text/30">
                          {message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <button
                          type="button"
                          onClick={() => exportMessage(message)}
                          className="rounded border border-office-panel/60 px-1.5 py-0.5 text-[10px] text-office-text/50 hover:border-office-active hover:text-white transition-colors"
                          title="이 메시지를 파일로 저장"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            // ── 일반 메시지 ───────────────────────────────────────────────────
            return (
              <div
                key={message.id}
                className={`rounded-lg p-3 text-sm ${
                  message.sender === 'user' ? 'bg-office-panel ml-4' : 'bg-office-panel/50 mr-4'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-office-active">{message.senderName}</p>
                </div>
                <MessageContent content={content} streaming={message.streaming} />
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.attachments.map((att) => (
                      <AttachmentCard key={att.id} attachment={att} removable={false} />
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-office-text/30">
                  {message.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )
          })
        )}

        {isLoading ? (
          <div className="bg-office-panel/50 mr-4 rounded-lg p-3 text-sm">
            <p className="mb-1 text-xs text-office-active">AI Office</p>
            <p className="animate-pulse text-office-text/60">요청을 처리하는 중...</p>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="hidden md:block border-t border-office-panel p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleSelectFiles}
        />

        {activeThread && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-office-active/30 bg-office-active/10 px-3 py-1.5">
            <div className="min-w-0">
              <p className="text-[10px] text-office-active/70">스레드 진행 중</p>
              <p className="truncate text-xs text-office-active">{activeThread.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveThreadId(null)}
              className="shrink-0 text-[10px] text-office-text/50 hover:text-white transition-colors"
              title="스레드 종료"
            >
              ✕ 종료
            </button>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between text-xs text-office-text/60">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isPreparingFiles}
            title="작업 요청에 파일을 첨부합니다."
            className="rounded border border-office-panel/70 px-2 py-1 text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
          >
            파일 첨부
          </button>
          <span>{isPreparingFiles ? '파일 읽는 중...' : `${attachments.length}개 첨부됨`}</span>
        </div>

        {attachments.length > 0 ? (
          <div className="mb-3 max-h-40 space-y-2 overflow-y-auto pr-1">
            {attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                removable
                onRemove={() => {
                  setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                }}
              />
            ))}
          </div>
        ) : null}

        {uploadError ? (
          <p className="mb-2 text-xs text-red-400">{uploadError}</p>
        ) : null}

        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder="업무를 입력하세요... (Enter 전송 / Shift+Enter 줄바꿈)"
            rows={1}
            className="max-h-40 min-h-20 flex-1 resize-none overflow-y-auto rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/40 focus:border-office-active focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title="입력한 요청과 첨부 파일을 AI Office로 전송합니다."
            className="min-w-16 self-end rounded bg-office-active px-3 py-2 text-sm font-semibold text-office-bg transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </div>
    </aside>
  )
}

function isMessageVisibleOnFloor(
  message: Message,
  currentFloor: string,
  floorDepartments: Agent['departmentId'][],
  agents: Agent[],
) {
  if (message.channelFloorId) {
    return message.channelFloorId === currentFloor
  }

  const scopedDepartments = resolveMessageDepartments(message, agents)
  return scopedDepartments.some((departmentId) => {
    if (currentFloor === '2f') {
      return resolveDepartmentFloor(departmentId) === '2f'
    }

    return floorDepartments.includes(departmentId) && resolveDepartmentFloor(departmentId) === currentFloor
  })
}

function resolveMessageDepartments(message: Message, agents: Agent[]) {
  if (message.departmentIds && message.departmentIds.length > 0) {
    return message.departmentIds
  }

  const senderAgent = agents.find((agent) => agent.id === message.sender)
  return senderAgent ? [senderAgent.departmentId] : []
}

interface AttachmentCardProps {
  attachment: UploadedFile
  removable: boolean
  onRemove?: () => void
}

function AttachmentCard({ attachment, removable, onRemove }: AttachmentCardProps) {
  const kindLabel = attachment.kind === 'archive'
    ? '압축파일'
    : attachment.kind === 'binary'
      ? '바이너리'
      : '텍스트'
  const archiveMeta = attachment.archive
    ? `항목 ${attachment.archive.entryCount}개`
    : attachment.kind === 'binary'
      ? '메타데이터만 추출'
      : '텍스트 일부 추출'

  return (
    <div className="rounded border border-office-panel/60 bg-office-bg/20 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">{attachment.name}</p>
          <p className="text-[11px] uppercase tracking-wide text-office-active">
            {kindLabel} - {archiveMeta}
          </p>
        </div>
        {removable ? (
          <button
            type="button"
            onClick={onRemove}
            title="이 첨부 파일을 제거합니다."
            className="text-xs text-office-text/50 transition-colors hover:text-red-300"
          >
            제거
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-office-text/60">
        {formatFileSize(attachment.size)} - {attachment.summary}
      </p>
      {attachment.archive && (
        <ArchiveTreeView archive={attachment.archive} accent="#64ffda" />
      )}
    </div>
  )
}
