/**
 * 마크다운 텍스트 파서
 * 코드펜스, 표, 헤딩, 목록, 인용, 수평선, 단락을 블록 단위로 파싱합니다.
 */

export type MarkdownPart =
  | { type: 'code';          lang: string; code: string }
  | { type: 'table';         headers: string[]; rows: string[][] }
  | { type: 'heading';       level: 1 | 2 | 3; text: string }
  | { type: 'bullet-list';   items: string[] }
  | { type: 'ordered-list';  items: string[] }
  | { type: 'blockquote';    text: string }
  | { type: 'hr' }
  | { type: 'paragraph';     text: string }

export type InlineToken =
  | { kind: 'text';   value: string }
  | { kind: 'bold';   value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'code';   value: string }

// ── 코드 펜스 분리 ──────────────────────────────────────────────────────────

type RawSegment =
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'text'; value: string }

function splitCodeFences(content: string): RawSegment[] {
  const segments: RawSegment[] = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) {
      segments.push({ kind: 'text', value: content.slice(last, match.index) })
    }
    segments.push({ kind: 'code', lang: match[1] || 'text', code: match[2] })
    last = match.index + match[0].length
  }
  if (last < content.length) {
    segments.push({ kind: 'text', value: content.slice(last) })
  }
  return segments
}

// ── 표 파싱 헬퍼 ────────────────────────────────────────────────────────────

function isTableLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 1
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim())
}

function parseTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

// ── 블록 파싱 ───────────────────────────────────────────────────────────────

function parseTextBlocks(text: string): MarkdownPart[] {
  const parts: MarkdownPart[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trim()

    // 빈 줄
    if (line === '') { i++; continue }

    // 수평선
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      parts.push({ type: 'hr' })
      i++; continue
    }

    // 헤딩 (h1~h3)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3
      parts.push({ type: 'heading', level, text: headingMatch[2] })
      i++; continue
    }

    // 표: |로 시작하고 끝나는 연속 줄
    if (isTableLine(line)) {
      const tableLines: string[] = []
      while (i < lines.length && isTableLine(lines[i].trim())) {
        tableLines.push(lines[i])
        i++
      }
      // header | separator | ...rows 구조일 때만 표로 렌더링
      if (tableLines.length >= 2 && isTableSeparator(tableLines[1])) {
        const headers = parseTableRow(tableLines[0])
        const rows    = tableLines.slice(2).map(parseTableRow)
        parts.push({ type: 'table', headers, rows })
      } else {
        parts.push({ type: 'paragraph', text: tableLines.join('\n') })
      }
      continue
    }

    // 블록 인용
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2))
        i++
      }
      parts.push({ type: 'blockquote', text: quoteLines.join('\n') })
      continue
    }

    // 순서 없는 목록
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().slice(2))
        i++
      }
      parts.push({ type: 'bullet-list', items })
      continue
    }

    // 순서 있는 목록
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ''))
        i++
      }
      parts.push({ type: 'ordered-list', items })
      continue
    }

    // 일반 단락: 블록 요소가 아닌 연속 줄
    const paraLines: string[] = []
    while (i < lines.length) {
      const l = lines[i].trim()
      if (
        l === '' ||
        isTableLine(l) ||
        /^#{1,3}\s/.test(l) ||
        /^[-*+]\s/.test(l) ||
        /^\d+\.\s/.test(l) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(l) ||
        l.startsWith('> ')
      ) break
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      parts.push({ type: 'paragraph', text: paraLines.join('\n') })
    }
  }

  return parts
}

// ── 공개 API ────────────────────────────────────────────────────────────────

/** 전체 콘텐츠를 MarkdownPart[] 로 파싱 */
export function parseMarkdown(content: string): MarkdownPart[] {
  const result: MarkdownPart[] = []
  for (const seg of splitCodeFences(content)) {
    if (seg.kind === 'code') {
      result.push({ type: 'code', lang: seg.lang, code: seg.code })
    } else {
      result.push(...parseTextBlocks(seg.value))
    }
  }
  return result
}

/** **bold**, *italic*, `inline-code` 인라인 파싱 */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  // bold 먼저 (** > *)
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) tokens.push({ kind: 'text', value: text.slice(last, match.index) })
    if (match[1] !== undefined)      tokens.push({ kind: 'bold',   value: match[1] })
    else if (match[2] !== undefined) tokens.push({ kind: 'italic', value: match[2] })
    else if (match[3] !== undefined) tokens.push({ kind: 'code',   value: match[3] })
    last = match.index + match[0].length
  }
  if (last < text.length) tokens.push({ kind: 'text', value: text.slice(last) })
  return tokens
}
