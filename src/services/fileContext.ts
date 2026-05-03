import { unzipSync } from 'fflate'
import type { ArchiveEntry, UploadedFile } from '@/types'
import { MAX_SERVER_ZIP_BYTES, analyzeZipOnServer } from './zipAnalysisApi'

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

// 실행 가능 파일 차단 목록 — AI 컨텍스트에 올리지 않을 파일 유형
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'so', 'dylib', 'bin', 'com', 'msi', 'dmg', 'pkg', 'deb', 'rpm',
  'apk', 'ipa', 'jar', 'class', 'pyc', 'pyo', 'pyd', 'whl',
])

const MAX_DIRECT_TEXT_BYTES = 512 * 1024
const MAX_TEXT_EXCERPT_CHARS = 12_000
const MAX_TOTAL_ATTACHMENT_BYTES = 500 * 1024 * 1024  // 전체 첨부 합계 한도
const MAX_BINARY_PREVIEW_BYTES = 32
const MAX_CLIENT_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_ARCHIVE_ENTRY_LIST = 120
const MAX_ARCHIVE_TEXT_ENTRIES = 8
const MAX_ARCHIVE_TEXT_CHARS = 16_000
const MAX_COMBINED_ATTACHMENT_CHARS = 28_000

export async function prepareUploadedFiles(files: File[]): Promise<UploadedFile[]> {
  // 전체 합계 용량 검사
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(`첨부 파일 합계가 ${formatFileSize(MAX_TOTAL_ATTACHMENT_BYTES)}를 초과합니다. (현재: ${formatFileSize(totalBytes)})`)
  }
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

  // 실행 파일 차단: AI 컨텍스트에 올리면 안 되는 파일 유형
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return {
      ...base,
      kind: 'binary',
      summary: `실행 파일(${extension})은 보안상 첨부가 차단되었습니다.`,
      promptContext: `File: ${file.name}\nStatus: 차단됨 — 실행 파일은 분석 대상에서 제외됩니다.`,
      warnings: ['blocked-executable'],
    }
  }

  if (ZIP_EXTENSIONS.has(extension) || file.type.includes('zip')) {
    if (file.size > MAX_SERVER_ZIP_BYTES) {
      return {
        ...base,
        kind: 'archive',
        summary: `ZIP archive exceeds the upload limit of ${formatFileSize(MAX_SERVER_ZIP_BYTES)}.`,
        promptContext: [
          `File: ${file.name}`,
          'Type: ZIP archive',
          `Size: ${formatFileSize(file.size)}`,
          `Status: skipped because the ZIP file is larger than ${formatFileSize(MAX_SERVER_ZIP_BYTES)}.`,
        ].join('\n'),
        warnings: ['archive-too-large'],
      }
    }

    try {
      const analyzed = await analyzeZipOnServer(file)
      return {
        ...base,
        ...analyzed,
      }
    } catch (error) {
      if (file.size > MAX_CLIENT_ARCHIVE_BYTES) {
        return {
          ...base,
          kind: 'archive',
          summary: error instanceof Error
            ? error.message
            : 'ZIP analysis failed before the archive could be inspected.',
          promptContext: [
            `File: ${file.name}`,
            'Type: ZIP archive',
            `Size: ${formatFileSize(file.size)}`,
            'Status: server-side ZIP analysis failed, and the file is too large for the browser fallback path.',
          ].join('\n'),
          warnings: ['archive-analysis-failed'],
        }
      }

      const bytes = new Uint8Array(await file.arrayBuffer())
      return buildZipAttachment(base, bytes)
    }
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return {
      ...base,
      kind: 'archive',
      summary: `Archive file (${extension}) was attached, but only ZIP inspection is supported right now.`,
      promptContext: [
        `File: ${file.name}`,
        `Type: archive (${extension})`,
        `Size: ${formatFileSize(file.size)}`,
        'Status: attached successfully, but archive inspection is currently limited to ZIP files.',
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
          `Type: ${attachmentTypeLabel(attachment.kind)}`,
          `Size: ${formatFileSize(attachment.size)}`,
          `Summary: ${attachment.summary}`,
        ].join('\n')
      : attachment.promptContext

    if (used >= MAX_COMBINED_ATTACHMENT_CHARS) {
      sections.push(`Attachment details were truncated because the combined prompt limit was reached after ${attachments.length} file(s).`)
      break
    }

    const remaining = MAX_COMBINED_ATTACHMENT_CHARS - used
    const clipped = clipText(rawSection, remaining)
    sections.push(clipped)
    used += clipped.length

    if (clipped.length < rawSection.length) {
      sections.push('Attachment details were cut short to stay within the prompt size limit.')
      break
    }
  }

  return [
    '[Attached Files]',
    'The user attached file data. Prefer these details when they are relevant.',
    sections.join('\n\n'),
    '[End Attached Files]',
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
    ? 'Only a shortened text excerpt was captured to stay within the attachment limits.'
    : ''

  return {
    ...base,
    kind: 'text',
    summary: warning
      ? `Readable text file attached. ${warning}`
      : 'Readable text file attached.',
    promptContext: [
      `File: ${base.name}`,
      'Type: text file',
      `Size: ${formatFileSize(base.size)}`,
      `MIME type: ${base.mimeType}`,
      warning ? `Note: ${warning}` : '',
      'Excerpt:',
      excerpt || '[empty file]',
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
    summary: 'Binary file attached. Only metadata and a small byte preview were captured.',
    promptContext: [
      `File: ${base.name}`,
      'Type: binary file',
      `Size: ${formatFileSize(base.size)}`,
      `MIME type: ${base.mimeType}`,
      hexPreview ? `Leading bytes: ${hexPreview}` : 'Leading bytes: unavailable',
      'Note: this file could not be converted into readable text in the browser.',
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
            entry.truncated ? '[truncated]' : '',
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
      structureLines.push(`- ... omitted ${entries.length - listedEntries.length} more item(s)`)
    }

    const summary = readableEntryCount > 0
      ? `ZIP archive with ${entries.length} item(s) in ${directories.size} director${directories.size === 1 ? 'y' : 'ies'}. Extracted text from ${readableEntryCount} file(s).`
      : `ZIP archive with ${entries.length} item(s) in ${directories.size} director${directories.size === 1 ? 'y' : 'ies'}. No readable text excerpt was extracted.`

    return {
      ...base,
      kind: 'archive',
      summary,
      promptContext: [
        `File: ${base.name}`,
        'Type: ZIP archive',
        `Size: ${formatFileSize(base.size)}`,
        `Summary: ${summary}`,
        '',
        'Archive structure:',
        ...structureLines,
        '',
        excerptBlocks.length > 0 ? 'Extracted text excerpts:' : 'Extracted text excerpts: none',
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
      summary: 'ZIP archive was attached, but the browser fallback path could not open it.',
      promptContext: [
        `File: ${base.name}`,
        'Type: ZIP archive',
        `Size: ${formatFileSize(base.size)}`,
        'Status: the browser fallback path could not read this ZIP file.',
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
  return `${text.slice(0, Math.max(0, maxChars - 14)).trimEnd()}\n[truncated]`
}

function registerDirectories(entryPath: string, directories: Set<string>) {
  const parts = entryPath.split('/').filter(Boolean)
  for (let index = 0; index < parts.length - 1; index += 1) {
    directories.add(parts.slice(0, index + 1).join('/'))
  }
}

function attachmentTypeLabel(kind: UploadedFile['kind']): string {
  if (kind === 'archive') return 'archive'
  if (kind === 'binary') return 'binary'
  return 'text'
}
