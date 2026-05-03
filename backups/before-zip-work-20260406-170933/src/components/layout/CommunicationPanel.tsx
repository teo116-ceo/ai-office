import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { resolveDepartmentFloor } from '@/services/directives'
import { runTask } from '@/services/claudeApi'
import { formatFileSize, prepareUploadedFiles } from '@/services/fileContext'
import { exportMessages } from '@/services/exportService'
import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, FLOORS } from '@/types'
import type { Agent, Message, UploadedFile } from '@/types'
import ArchiveTreeView from './ArchiveTreeView'
import MessageContent from './MessageContent'

const ATTACHMENT_ANALYSIS_PROMPT = '첨부한 파일의 핵심 내용과 구조를 분석해 주세요.'

export default function CommunicationPanel() {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<UploadedFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPreparingFiles, setIsPreparingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const { messages, agents, currentFloor } = useAgentStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const floor = FLOORS[currentFloor]
  const hasChannel = currentFloor === '2f' || floor.departments.length > 0
  const visibleMessages = hasChannel
    ? messages.filter((message) => isMessageVisibleOnFloor(message, currentFloor, floor.departments, agents))
    : []
  const floorTeamsLabel = currentFloor === '2f'
    ? '대회의실, 중회의실, 소회의실'
    : floor.departments.map((deptId) => DEPARTMENTS[deptId].name).join(', ')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages, attachments, currentFloor])

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
    setIsLoading(true)

    try {
      await runTask(taskPrompt, submittedAttachments)
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = !isLoading && !isPreparingFiles && (input.trim().length > 0 || attachments.length > 0)

  return (
    <aside className="w-80 shrink-0 border-l border-office-panel bg-office-sidebar flex flex-col">
      <div className="p-4 border-b border-office-panel">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white text-sm font-semibold">팀 채널</p>
            <p className="text-office-text/60 text-xs">{`${floor.label} ${floor.name}`}</p>
            <p className="mt-1 text-[11px] text-office-text/40">
              {floorTeamsLabel || '이 층에는 소속 부서가 없습니다.'}
            </p>
          </div>
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!hasChannel ? (
          <div className="mt-8 space-y-2 text-center text-sm text-office-text/50">
            <p>이 층에는 팀 채널을 볼 수 있는 부서가 없습니다.</p>
            <div className="space-y-1 text-xs text-office-text/40">
              <p>부서가 있는 층을 선택하면 해당 팀 대화만 볼 수 있습니다.</p>
            </div>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="mt-8 space-y-2 text-center text-sm text-office-text/50">
            <p>{currentFloor === '2f' ? '회의실 대화가 아직 없습니다.' : `${floor.name} 팀 대화가 아직 없습니다.`}</p>
            <div className="space-y-1 text-xs text-office-text/40">
              {currentFloor === '2f' ? (
                <p>대회의실, 중회의실, 소회의실 소집 요청이 들어오면 이 채널에 대화가 표시됩니다.</p>
              ) : (
                <p>업무를 지시하면 배정된 층의 팀 채널에 대화가 표시됩니다.</p>
              )}
              <p>첨부 파일이 있는 요청도 배정된 채널에서 함께 확인할 수 있습니다.</p>
            </div>
          </div>
        ) : (
          visibleMessages.map((message) => (
            <div
              key={message.id}
              className={`rounded-lg p-3 text-sm ${
                message.sender === 'user' ? 'bg-office-panel ml-4' : 'bg-office-panel/50 mr-4'
              }`}
            >
              <p className="mb-1 text-xs text-office-active">{message.senderName}</p>
              <MessageContent content={message.content} />
              {message.attachments && message.attachments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {message.attachments.map((attachment) => (
                    <AttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                      removable={false}
                    />
                  ))}
                </div>
              ) : null}
              <p className="mt-1 text-xs text-office-text/30">
                {message.timestamp.toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))
        )}

        {isLoading ? (
          <div className="bg-office-panel/50 mr-4 rounded-lg p-3 text-sm">
            <p className="mb-1 text-xs text-office-active">AI 오피스</p>
            <p className="animate-pulse text-office-text/60">요청을 처리하는 중...</p>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-office-panel p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleSelectFiles}
        />

        <div className="mb-3 flex items-center justify-between text-xs text-office-text/60">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isPreparingFiles}
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
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleSubmit()
              }
            }}
            placeholder="업무를 입력하거나 첨부한 파일에 대해 질문하세요..."
            className="flex-1 rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/40 focus:outline-none focus:border-office-active"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="min-w-16 rounded bg-office-active px-3 py-2 text-sm font-semibold text-office-bg transition-opacity hover:opacity-80 disabled:opacity-40"
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
