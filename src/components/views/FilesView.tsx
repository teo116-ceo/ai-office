import { useEffect, useRef, useState } from 'react'
import { fetchOutputFiles, fetchOutputFileContent, fetchOutputFileBlob, deleteOutputFile } from '@/services/agentTools'
import type { OutputFileInfo } from '@/services/agentTools'
import { formatFileDate } from '@/utils/dateFormat'

const EXT_ICON: Record<string, string> = {
  md: 'MD',
  txt: 'TXT',
  json: 'JSON',
  ts: 'TS',
  js: 'JS',
  py: 'PY',
  go: 'GO',
  yaml: 'YML',
  yml: 'YML',
  csv: 'CSV',
  html: 'HTML',
  png: 'IMG',
  jpg: 'IMG',
  jpeg: 'IMG',
  gif: 'IMG',
  webp: 'IMG',
  svg: 'IMG',
  bmp: 'IMG',
  pdf: 'PDF',
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])
const BINARY_EXTS = new Set(['pdf', 'docx', 'xlsx', 'zip', 'mp4', 'mp3'])

function getExt(filename: string) {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function extIcon(filename: string) {
  return EXT_ICON[getExt(filename)] ?? 'FILE'
}

function isImageFile(filename: string) {
  return IMAGE_EXTS.has(getExt(filename))
}

function isBinaryFile(filename: string) {
  return BINARY_EXTS.has(getExt(filename))
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function FilesView() {
  const [files, setFiles] = useState<OutputFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<OutputFileInfo | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const prevBlobUrl = useRef<string | null>(null)

  const loadFiles = async () => {
    setLoading(true)
    const list = await fetchOutputFiles()
    setFiles(list.sort((left, right) => new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime()))
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFiles()
  }, [])

  const clearBlobUrl = () => {
    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current)
      prevBlobUrl.current = null
    }
  }

  const openFile = async (file: OutputFileInfo) => {
    setSelected(file)
    setContent(null)
    setBlobUrl(null)
    clearBlobUrl()
    setContentLoading(true)
    setMobileView('detail')

    if (isImageFile(file.name)) {
      const blob = await fetchOutputFileBlob(file.name)
      if (blob) {
        const url = URL.createObjectURL(blob)
        prevBlobUrl.current = url
        setBlobUrl(url)
      } else {
        setBlobUrl(null)
      }
    } else if (isBinaryFile(file.name)) {
      setContent('')
    } else {
      const text = await fetchOutputFileContent(file.name)
      setContent(text)
    }

    setContentLoading(false)
  }

  const handleDelete = async (file: OutputFileInfo) => {
    if (!window.confirm(`${file.name} 파일을 삭제할까요? 삭제 후에는 복구할 수 없습니다.`)) return

    setDeletingFile(file.name)
    const ok = await deleteOutputFile(file.name)
    if (ok) {
      setFiles((prev) => prev.filter((f) => f.name !== file.name))
      if (selected?.name === file.name) {
        setSelected(null)
        setContent(null)
        setBlobUrl(null)
        clearBlobUrl()
      }
    }
    setDeletingFile(null)
  }

  const downloadFile = async (file: OutputFileInfo) => {
    if (isImageFile(file.name) || isBinaryFile(file.name)) {
      const blob = await fetchOutputFileBlob(file.name)
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
    } else if (content !== null) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`flex shrink-0 flex-col border-r border-office-panel bg-office-sidebar w-full md:w-72 ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center justify-between border-b border-office-panel px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">에이전트 결과물</p>
            <p className="mt-0.5 text-[11px] text-office-text/50">{files.length}개 파일</p>
          </div>
          <button
            type="button"
            onClick={loadFiles}
            className="text-lg text-office-text/40 transition-colors hover:text-white"
            title="새로고침"
            aria-label="파일 목록 새로고침"
          >
            🔄
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-office-text/40">
              불러오는 중...
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <p className="text-sm text-office-text/50">아직 파일이 없습니다.</p>
              <p className="mt-1 text-xs text-office-text/30">에이전트가 결과물을 저장하면 여기에 표시됩니다.</p>
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.name}
                className={`group mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  selected?.name === file.name
                    ? 'border border-office-active/40 bg-office-panel'
                    : 'hover:bg-office-panel/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openFile(file)}
                  title={`${file.name} 파일 내용을 미리 봅니다.`}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 shrink-0 text-[11px] font-semibold">{extIcon(file.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white" title={file.name}>{file.name}</p>
                    <p className="mt-0.5 text-[11px] text-office-text/50">
                      {formatSize(file.size)} · {formatFileDate(new Date(file.modifiedAt))}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(file)}
                  disabled={deletingFile === file.name}
                  title={`${file.name} 삭제`}
                  className="mt-0.5 shrink-0 opacity-0 transition-all group-hover:opacity-100 disabled:opacity-30"
                >
                  {deletingFile === file.name ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin text-office-text/40" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="7" cy="7" r="5" strokeDasharray="20" strokeDashoffset="10" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" className="text-office-text/30 hover:text-red-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1,3.5 13,3.5" />
                      <path d="M2.5 3.5V12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V3.5" />
                      <path d="M4.5 3.5V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
                    </svg>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`flex flex-1 flex-col overflow-hidden bg-office-bg ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {selected ? (
          <>
            <div className="shrink-0 border-b border-office-panel bg-office-sidebar px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="md:hidden text-sm text-office-active mr-1"
                  >
                    ← 목록
                  </button>
                  <span className="text-[11px] font-semibold">{extIcon(selected.name)}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{selected.name}</p>
                    <p className="text-[11px] text-office-text/50">{formatSize(selected.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadFile(selected)}
                  disabled={contentLoading}
                  title={contentLoading ? '파일을 불러오는 중입니다' : `${selected.name} 다운로드`}
                  aria-label={contentLoading ? '파일을 불러오는 중' : `${selected.name} 다운로드`}
                  className="flex items-center gap-2 rounded-lg border border-office-active/50 bg-office-active/10 px-3 py-1.5 text-xs text-office-active transition-colors hover:bg-office-active/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  다운로드
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {contentLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-office-text/40">
                  파일을 읽는 중...
                </div>
              ) : isImageFile(selected.name) ? (
                blobUrl ? (
                  <div className="flex justify-center">
                    <img
                      src={blobUrl}
                      alt={selected.name}
                      className="max-w-full rounded-lg object-contain"
                      style={{ maxHeight: '70vh' }}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <p className="text-sm text-red-400">이미지를 불러올 수 없습니다.</p>
                    <button
                      type="button"
                      onClick={() => { void openFile(selected) }}
                      title={`${selected.name} 파일을 다시 불러옵니다.`}
                      className="rounded border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
                    >
                      다시 시도
                    </button>
                  </div>
                )
              ) : isBinaryFile(selected.name) ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <p className="text-sm text-office-text/50">미리보기를 지원하지 않는 파일 형식입니다.</p>
                  <button
                    type="button"
                    onClick={() => void downloadFile(selected)}
                    className="rounded border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
                  >
                    다운로드하여 열기
                  </button>
                </div>
              ) : content === null ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <p className="text-sm text-red-400">파일을 읽을 수 없습니다.</p>
                  <p className="text-xs text-office-text/40">파일이 삭제되었거나 읽기 권한이 없을 수 있습니다.</p>
                  <button
                    type="button"
                    onClick={() => { void openFile(selected) }}
                    title={`${selected.name} 파일을 다시 불러옵니다.`}
                    className="rounded border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
                  >
                    다시 시도
                  </button>
                </div>
              ) : (
                <pre className="break-words whitespace-pre-wrap font-mono text-sm leading-relaxed text-office-text/90">
                  {content}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-sm text-office-text/40">파일을 선택하면 내용을 미리 볼 수 있습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
