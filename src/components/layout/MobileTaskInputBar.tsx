import { type ChangeEvent, useRef, useState } from 'react'
import { runTask } from '@/services/agentOrchestrator'
import { formatFileSize, prepareUploadedFiles } from '@/services/fileContext'
import type { UploadedFile } from '@/types'

const ATTACHMENT_ANALYSIS_PROMPT = '첨부한 파일의 핵심 내용과 구조를 분석해 주세요.'

export default function MobileTaskInputBar() {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<UploadedFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPreparingFiles, setIsPreparingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div className="md:hidden shrink-0 border-t border-office-panel bg-office-sidebar px-3 py-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleSelectFiles}
      />

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-1 rounded border border-office-panel/60 bg-office-bg/20 px-2 py-0.5 text-[11px] text-office-text/70"
            >
              <span className="max-w-[120px] truncate">{attachment.name}</span>
              <span className="text-office-text/40">({formatFileSize(attachment.size)})</span>
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                className="text-office-text/40 hover:text-red-300 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadError && (
        <p className="mb-1 text-xs text-red-400">{uploadError}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isPreparingFiles}
          title="파일 첨부"
          className="shrink-0 rounded border border-office-panel/70 px-2 py-1.5 text-xs text-office-text/70 transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
        >
          {isPreparingFiles ? '읽는 중...' : `파일 첨부${attachments.length > 0 ? ` (${attachments.length})` : ''}`}
        </button>

        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          placeholder=""
          rows={1}
          className="flex-1 resize-none rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/40 focus:outline-none focus:border-office-active"
        />

        <button
          type="button"
          onClick={() => { void handleSubmit() }}
          disabled={!canSubmit}
          title="전송"
          className="shrink-0 self-end rounded bg-office-active px-3 py-2 text-sm font-semibold text-office-bg transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {isLoading ? '...' : '전송'}
        </button>
      </div>
    </div>
  )
}
