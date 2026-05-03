import { useState } from 'react'
import { parseMarkdown, parseInline, type MarkdownPart, type InlineToken } from './markdownParser'

// ── 코드 블록 ───────────────────────────────────────────────────────────────

const EXT_MAP: Record<string, string> = {
  typescript: 'ts', javascript: 'js', python: 'py', go: 'go',
  rust: 'rs', java: 'java', bash: 'sh', shell: 'sh', sh: 'sh',
  css: 'css', html: 'html', json: 'json', yaml: 'yml', sql: 'sql',
  markdown: 'md', md: 'md', dockerfile: 'dockerfile',
}

function downloadCode(code: string, lang: string) {
  const ext      = (EXT_MAP[lang.toLowerCase()] ?? lang.toLowerCase()) || 'txt'
  const blob     = new Blob([code], { type: 'text/plain;charset=utf-8' })
  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  a.href = url; a.download = `code.${ext}`; a.click()
  URL.revokeObjectURL(url)
}

function CodeBlockView({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="my-2 overflow-hidden rounded border border-white/10 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wide text-office-active/80">
          {lang || 'code'}
        </span>
        <div className="flex gap-1.5">
          <button type="button" onClick={handleCopy}
            className="rounded px-2 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white">
            {copied ? '복사됨 ✓' : '복사'}
          </button>
          <button type="button" onClick={() => downloadCode(code, lang)}
            className="rounded px-2 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white">
            저장
          </button>
        </div>
      </div>
      <pre className="max-h-80 overflow-auto p-3 text-xs leading-relaxed text-white/80">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ── 인라인 마크다운 ─────────────────────────────────────────────────────────

function InlineContent({ text }: { text: string }) {
  const tokens: InlineToken[] = parseInline(text)
  return (
    <>
      {tokens.map((token, i) => {
        if (token.kind === 'bold')   return <strong key={i} className="font-semibold text-white">{token.value}</strong>
        if (token.kind === 'italic') return <em key={i} className="italic text-office-text/90">{token.value}</em>
        if (token.kind === 'code')   return <code key={i} className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px] text-office-active">{token.value}</code>
        return <span key={i}>{token.value}</span>
      })}
    </>
  )
}

// ── 표 ──────────────────────────────────────────────────────────────────────

function TableView({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/20 bg-white/5">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-white">
                <InlineContent text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={`border-b border-white/5 transition-colors hover:bg-white/5 ${ri % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
              {headers.map((_, ci) => (
                <td key={ci} className="px-3 py-2 text-xs text-office-text">
                  <InlineContent text={row[ci] ?? ''} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 스트리밍 커서 ───────────────────────────────────────────────────────────

const Cursor = () => (
  <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-office-active align-middle" />
)

// ── 블록별 렌더러 ───────────────────────────────────────────────────────────

function PartView({ part, streaming, isLast }: { part: MarkdownPart; streaming?: boolean; isLast: boolean }) {
  const cursor = streaming && isLast ? <Cursor /> : null

  switch (part.type) {
    case 'code':
      return <CodeBlockView lang={part.lang} code={part.code} />

    case 'table':
      return <TableView headers={part.headers} rows={part.rows} />

    case 'heading': {
      const cls =
        part.level === 1 ? 'mt-4 mb-2 text-base font-bold text-white' :
        part.level === 2 ? 'mt-3 mb-1.5 text-sm font-bold text-white' :
                           'mt-2 mb-1 text-sm font-semibold text-white/90'
      return <p className={cls}><InlineContent text={part.text} />{cursor}</p>
    }

    case 'bullet-list':
      return (
        <ul className="my-2 space-y-1 pl-1">
          {part.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-office-text">
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-office-active/50" />
              <span><InlineContent text={item} /></span>
            </li>
          ))}
          {cursor}
        </ul>
      )

    case 'ordered-list':
      return (
        <ol className="my-2 space-y-1 pl-1">
          {part.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-office-text">
              <span className="shrink-0 text-xs font-semibold text-office-active/60">{i + 1}.</span>
              <span><InlineContent text={item} /></span>
            </li>
          ))}
          {cursor}
        </ol>
      )

    case 'blockquote':
      return (
        <blockquote className="my-2 border-l-2 border-office-active/40 pl-3 text-sm italic text-office-text/70">
          <InlineContent text={part.text} />{cursor}
        </blockquote>
      )

    case 'hr':
      return <hr className="my-3 border-white/10" />

    case 'paragraph':
      return (
        <p className="whitespace-pre-wrap text-sm text-office-text">
          <InlineContent text={part.text} />{cursor}
        </p>
      )
  }
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface MessageContentProps {
  content: string
  className?: string
  streaming?: boolean
}

export default function MessageContent({ content, className, streaming }: MessageContentProps) {
  const parts = parseMarkdown(content)

  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      {parts.map((part, i) => (
        <PartView key={i} part={part} streaming={streaming} isLast={i === parts.length - 1} />
      ))}
    </div>
  )
}
