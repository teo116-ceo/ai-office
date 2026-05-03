import { unzipSync } from 'fflate'
import type { ArchiveEntry, UploadedFile } from '@/types'

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'xml', 'html', 'htm',
  'css', 'scss', 'sass', 'less', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'php', 'java', 'kt', 'kts', 'go', 'rs', 'c', 'cc', 'cpp', 'cxx',
  'h', 'hpp', 'cs', 'swift', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'log',
  'dockerfile', 'gitignore', 'npmrc', 'editorconfig',
])

const ZIP_EXTENSIONS = new Set(['zip'])
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'])

const MAX_DIRECT_TEXT_BYTES = 512 * 1024
const MAX_TEXT_EXCERPT_CHARS = 12_000
const MAX_BINARY_PREVIEW_BYTES = 32
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024
const MAX_ARCHIVE_ENTRY_LIST = 120
const MAX_ARCHIVE_TEXT_ENTRIES = 8
const MAX_ARCHIVE_TEXT_CHARS = 16_000
const MAX_COMBINED_ATTACHMENT_CHARS = 28_000

export async function prepareUploadedFiles(files: File[]): Promise<UploadedFile[]> {
  return Promise.all(files.map((file) => readUploadedFile(file)))
}

export async function readUploadedFile(file: File): Promise<UploadedFile> {
  const base = {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
  }
  const extension = getExtension(file.name)

  if (ZIP_EXTENSIONS.has(extension) || file.type.includes('zip')) {
    if (file.size > MAX_ARCHIVE_BYTES) {
      return {
        ...base,
        kind: 'archive',
        summary: `ZIP 압축파일이 첨부되었습니다. ${formatFileSize(MAX_ARCHIVE_BYTES)}를 초과해 내부 분석은 건너뛰었습니다.`,
        promptContext: [
          `파일명: ${file.name}`,
          '유형: ZIP 압축파일',
          `크기: ${formatFileSize(file.size)}`,
          '상태: 첨부되었지만 브라우저에서 분석하기에는 너무 커서 내부 구조 분석을 생략했습니다.',
        ].join('\n'),
        warnings: ['archive-too-large'],
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    return buildZipAttachment(base, bytes)
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return {
      ...base,
      kind: 'archive',
      summary: `압축파일(${extension})이 첨부되었습니다. 현재 내부 분석은 ZIP 형식만 지원합니다.`,
      promptContext: [
        `파일명: ${file.name}`,
        `유형: 압축파일 (${extension})`,
        `크기: ${formatFileSize(file.size)}`,
        '상태: 첨부되었지만 현재는 ZIP 압축파일만 내부 구조와 읽을 수 있는 파일 내용을 분석합니다.',
      ].join('\n'),
      warnings: ['unsupported-archive-format'],
    }
  }

  const sampleBytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, MAX_DIRECT_TEXT_BYTES)).arrayBuffer(),
  )

  if (isProbablyText(file.name, file.type, sampleBytes)) {
    const text = await file.slice(0, Math.min(file.size, MAX_DIRECT_TEXT_BYTES)).text()
    return buildTextAttachment(base, text, file.size > MAX_DIRECT_TEXT_BYTES)
  }

  return buildBinaryAttachment(base, sampleBytes)
}

export function buildAttachmentContext(attachments: UploadedFile[], mode: 'summary' | 'full' = 'full'): string {
  if (attachments.length === 0) return ''

  let used = 0
  const sections: string[] = []

  for (const [index, attachment] of attachments.entries()) {
    const rawSection = mode === 'summary'
      ? [
          `${index + 1}. ${attachment.name}`,
          `유형: ${attachmentTypeLabel(attachment.kind)}`,
          `크기: ${formatFileSize(attachment.size)}`,
          `요약: ${attachment.summary}`,
        ].join('\n')
      : attachment.promptContext

    if (used >= MAX_COMBINED_ATTACHMENT_CHARS) {
      sections.push(`프롬프트 길이 제한으로 인해 첨부 파일 ${attachments.length}개 중 일부는 생략했습니다.`)
      break
    }

    const remaining = MAX_COMBINED_ATTACHMENT_CHARS - used
    const clipped = clipText(rawSection, remaining)
    sections.push(clipped)
    used += clipped.length

    if (clipped.length < rawSection.length) {
      sections.push('프롬프트 길이 제한에 맞추기 위해 첨부 파일 내용 일부를 잘랐습니다.')
      break
    }
  }

  return [
    '[첨부 파일]',
    '사용자가 파일을 첨부했습니다. 답변 시 이 정보를 우선적으로 참고하세요.',
    sections.join('\n\n'),
    '[첨부 파일 끝]',
  ].join('\n\n')
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`

  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

function buildTextAttachment(
  base: Pick<UploadedFile, 'id' | 'name' | 'size' | 'mimeType'>,
  rawText: string,
  truncatedByByteLimit: boolean,
): UploadedFile {
  const text = normalizeText(rawText)
  const excerpt = clipText(text, MAX_TEXT_EXCERPT_CHARS)
  const warning = truncatedByByteLimit || excerpt.length < text.length
    ? '프롬프트 길이를 고려해 텍스트 일부만 추출했습니다.'
    : ''

  return {
    ...base,
    kind: 'text',
    summary: warning
      ? `읽을 수 있는 텍스트 파일이 첨부되었습니다. ${warning}`
      : '읽을 수 있는 텍스트 파일이 첨부되었습니다.',
    promptContext: [
      `파일명: ${base.name}`,
      '유형: 텍스트 파일',
      `크기: ${formatFileSize(base.size)}`,
      `MIME 타입: ${base.mimeType}`,
      warning ? `참고: ${warning}` : '',
      '내용 일부:',
      excerpt || '[빈 파일]',
    ].filter(Boolean).join('\n'),
    warnings: warning ? ['text-truncated'] : undefined,
  }
}

function buildBinaryAttachment(
  base: Pick<UploadedFile, 'id' | 'name' | 'size' | 'mimeType'>,
  sampleBytes: Uint8Array,
): UploadedFile {
  const hexPreview = Array.from(sampleBytes.slice(0, MAX_BINARY_PREVIEW_BYTES))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ')

  return {
    ...base,
    kind: 'binary',
    summary: '바이너리 파일이 첨부되었습니다. 메타데이터만 확인할 수 있고, 본문 텍스트 추출은 지원하지 않습니다.',
    promptContext: [
      `파일명: ${base.name}`,
      '유형: 바이너리 파일',
      `크기: ${formatFileSize(base.size)}`,
      `MIME 타입: ${base.mimeType}`,
      hexPreview ? `헤더 바이트: ${hexPreview}` : '헤더 바이트: 확인 불가',
      '참고: 이 파일은 브라우저에서 읽을 수 있는 텍스트로 변환하지 못했습니다.',
    ].join('\n'),
    warnings: ['binary-metadata-only'],
  }
}

function buildZipAttachment(
  base: Pick<UploadedFile, 'id' | 'name' | 'size' | 'mimeType'>,
  bytes: Uint8Array,
): UploadedFile {
  try {
    const extracted = unzipSync(bytes)
    const entryNames = Object.keys(extracted).sort((left, right) => left.localeCompare(right))
    const entries: ArchiveEntry[] = []
    const directories = new Set<string>()
    const excerptBlocks: string[] = []
    const warnings: string[] = []
    let remainingTextChars = MAX_ARCHIVE_TEXT_CHARS
    let readableEntryCount = 0

    for (const entryName of entryNames) {
      registerDirectories(entryName, directories)
      if (entryName.endsWith('/')) continue

      const entryBytes = extracted[entryName]
      const textLike = isProbablyText(entryName, '', entryBytes)
      const entry: ArchiveEntry = {
        path: entryName,
        size: entryBytes.byteLength,
        kind: textLike ? 'text' : 'binary',
      }

      if (textLike && readableEntryCount < MAX_ARCHIVE_TEXT_ENTRIES && remainingTextChars > 0) {
        const decoded = decodeExcerpt(entryBytes)
        if (decoded.length > 0) {
          const excerpt = clipText(decoded, Math.min(MAX_TEXT_EXCERPT_CHARS, remainingTextChars))
          entry.excerpt = excerpt
          entry.truncated = excerpt.length < decoded.length || entryBytes.byteLength > MAX_DIRECT_TEXT_BYTES
          excerptBlocks.push([
            `[${entryName}]`,
            excerpt,
            entry.truncated ? '[잘림]' : '',
          ].filter(Boolean).join('\n'))
          remainingTextChars -= excerpt.length
          readableEntryCount += 1
        }
      }

      entries.push(entry)
    }

    if (entries.length > MAX_ARCHIVE_ENTRY_LIST) {
      warnings.push('archive-entry-list-truncated')
    }

    const listedEntries = entries.slice(0, MAX_ARCHIVE_ENTRY_LIST)
    const structureLines = listedEntries.map((entry) =>
      `- ${entry.path} (${formatFileSize(entry.size)}, ${entry.kind})`,
    )

    if (entries.length > listedEntries.length) {
      structureLines.push(`- ... 나머지 ${entries.length - listedEntries.length}개 항목은 생략`)
    }

    const summary = readableEntryCount > 0
      ? `ZIP 압축파일에 항목 ${entries.length}개, 폴더 ${directories.size}개가 있으며 읽을 수 있는 파일 ${readableEntryCount}개를 추출했습니다.`
      : `ZIP 압축파일에 항목 ${entries.length}개, 폴더 ${directories.size}개가 있으며 읽을 수 있는 텍스트 파일은 추출하지 못했습니다.`

    return {
      ...base,
      kind: 'archive',
      summary,
      promptContext: [
        `파일명: ${base.name}`,
        '유형: ZIP 압축파일',
        `크기: ${formatFileSize(base.size)}`,
        `요약: ${summary}`,
        '',
        '내부 구조:',
        ...structureLines,
        '',
        excerptBlocks.length > 0 ? '읽을 수 있는 파일 내용 일부:' : '읽을 수 있는 파일 내용 일부: 없음',
        ...(excerptBlocks.length > 0 ? excerptBlocks : []),
      ].join('\n'),
      archive: {
        format: 'zip',
        entryCount: entries.length,
        directoryCount: directories.size,
        entries: listedEntries,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  } catch {
    return {
      ...base,
      kind: 'archive',
      summary: 'ZIP 압축파일이 첨부되었지만 브라우저에서 압축을 풀지 못했습니다.',
      promptContext: [
        `파일명: ${base.name}`,
        '유형: ZIP 압축파일',
        `크기: ${formatFileSize(base.size)}`,
        '상태: 압축파일을 읽지 못했습니다. 암호화되었거나 손상되었을 수 있습니다.',
      ].join('\n'),
      warnings: ['archive-read-failed'],
    }
  }
}

function getExtension(fileName: string): string {
  const cleanName = fileName.toLowerCase().trim()
  if (cleanName === 'dockerfile') return 'dockerfile'
  if (cleanName === '.gitignore') return 'gitignore'
  if (cleanName === '.npmrc') return 'npmrc'
  if (cleanName === '.editorconfig') return 'editorconfig'
  const parts = cleanName.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

function isProbablyText(fileName: string, mimeType: string, bytes: Uint8Array): boolean {
  const extension = getExtension(fileName)
  if (TEXT_EXTENSIONS.has(extension)) return true

  const normalizedMime = mimeType.toLowerCase()
  if (
    normalizedMime.startsWith('text/') ||
    normalizedMime.includes('json') ||
    normalizedMime.includes('xml') ||
    normalizedMime.includes('javascript') ||
    normalizedMime.includes('typescript') ||
    normalizedMime.includes('svg')
  ) {
    return true
  }

  if (bytes.length === 0) return true

  let suspicious = 0
  const limit = Math.min(bytes.length, 2048)

  for (let index = 0; index < limit; index += 1) {
    const value = bytes[index]
    if (value === 0) return false
    const isControl = value < 7 || (value > 13 && value < 32)
    if (isControl) suspicious += 1
  }

  return suspicious / limit < 0.03
}

function decodeExcerpt(bytes: Uint8Array): string {
  const sliced = bytes.slice(0, Math.min(bytes.byteLength, MAX_DIRECT_TEXT_BYTES))
  try {
    return normalizeText(new TextDecoder().decode(sliced))
  } catch {
    return ''
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
}

function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 18)).trimEnd()}\n[잘림]`
}

function registerDirectories(entryPath: string, directories: Set<string>) {
  const parts = entryPath.split('/').filter(Boolean)
  for (let index = 0; index < parts.length - 1; index += 1) {
    directories.add(parts.slice(0, index + 1).join('/'))
  }
}

function attachmentTypeLabel(kind: UploadedFile['kind']): string {
  if (kind === 'archive') return '압축파일'
  if (kind === 'binary') return '바이너리'
  return '텍스트'
}
