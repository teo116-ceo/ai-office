import { useState } from 'react'

interface CodeBlock {
  lang: string
  code: string
}

function parseMessageParts(content: string): Array<{ type: 'text'; value: string } | { type: 'code'; lang: string; code: string }> {
  const parts: ReturnType<typeof parseMessageParts> = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: content.slice(last, match.index) })
    }
    parts.push({ type: 'code', lang: match[1] || 'text', code: match[2] })
    last = match.index + match[0].length
  }
  if (last < content.length) {
    parts.push({ type: 'text', value: content.slice(last) })
  }
  return parts
}

function downloadCode(code: string, lang: string) {
  const extMap: Record<string, string> = {
    typescript: 'ts', javascript: 'js', python: 'py', go: 'go',
    rust: 'rs', java: 'java', bash: 'sh', shell: 'sh', sh: 'sh',
    css: 'css', html: 'html', json: 'json', yaml: 'yml', sql: 'sql',
    markdown: 'md', md: 'md', dockerfile: 'dockerfile',
  }
  const ext = (extMap[lang.toLowerCase()] ?? lang.toLowerCase()) || 'txt'
  const filename = `code.${ext}`
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function CodeBlockView({ lang, code }: CodeBlock) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="my-2 overflow-hidden rounded border border-white/10 bg-black/40">
      {/* 헤더 바 */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5">
        <span className="text-[11px] font-mono text-office-active/80 uppercase tracking-wide">
          {lang || 'code'}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded px-2 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? '복사됨 ✓' : '복사'}
          </button>
          <button
            type="button"
            onClick={() => downloadCode(code, lang)}
            className="rounded px-2 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            저장
          </button>
        </div>
      </div>
      {/* 코드 본문 */}
      <pre className="max-h-80 overflow-auto p-3 text-xs leading-relaxed text-white/80">
        <code>{code}</code>
      </pre>
    </div>
  )
}

interface MessageContentProps {
  content: string
  className?: string
}

export default function MessageContent({ content, className }: MessageContentProps) {
  const parts = parseMessageParts(content)
  const hasCode = parts.some((p) => p.type === 'code')

  if (!hasCode) {
    return <p className={`whitespace-pre-wrap text-office-text ${className ?? ''}`}>{content}</p>
  }

  return (
    <div className={className}>
      {parts.map((part, i) =>
        part.type === 'code' ? (
          <CodeBlockView key={i} lang={part.lang} code={part.code} />
        ) : (
          <p key={i} className="whitespace-pre-wrap text-office-text">{part.value}</p>
        )
      )}
    </div>
  )
}
