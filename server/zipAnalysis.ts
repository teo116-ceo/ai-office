import type { Request, Response } from 'express'
import { Unzip, UnzipInflate } from 'fflate'

type ArchiveEntry = {
  path: string
  size: number
  kind: 'text' | 'binary'
  excerpt?: string
  truncated?: boolean
}

type ZipAnalysisResponse = {
  kind: 'archive'
  summary: string
  promptContext: string
  warnings?: string[]
  archive: {
    format: 'zip'
    entryCount: number
    directoryCount: number
    entries: ArchiveEntry[]
  }
}

class ZipAnalysisError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MAX_COMPRESSED_BYTES = 500 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024
const MAX_ENTRY_COUNT = 5_000
const MAX_ENTRY_LIST = 120
const MAX_TEXT_ENTRIES = 8
const MAX_TEXT_EXCERPT_CHARS = 12_000
const MAX_TOTAL_TEXT_CHARS = 16_000
const MAX_TEXT_ENTRY_BYTES = 2 * 1024 * 1024

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'xml', 'html', 'htm',
  'css', 'scss', 'sass', 'less', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'php', 'java', 'kt', 'kts', 'go', 'rs', 'c', 'cc', 'cpp', 'cxx',
  'h', 'hpp', 'cs', 'swift', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'log',
  'dockerfile', 'gitignore', 'npmrc', 'editorconfig',
])

export async function handleZipAnalysisRequest(req: Request, res: Response) {
  try {
    const contentType = req.header('content-type') ?? ''
    if (!contentType.includes('application/zip')) {
      throw new ZipAnalysisError(415, 'Only application/zip uploads are supported.')
    }

    const declaredSize = parseIntegerHeader(req.header('x-file-size'))
    if (declaredSize !== null && declaredSize > MAX_COMPRESSED_BYTES) {
      throw new ZipAnalysisError(
        413,
        `ZIP file is too large. The limit is ${formatFileSize(MAX_COMPRESSED_BYTES)}.`,
      )
    }

    const fileName = decodeHeaderValue(req.header('x-file-name')) || 'archive.zip'
    const analysis = await analyzeZipStream(req, fileName)
    res.json(analysis)
  } catch (error) {
    const status = error instanceof ZipAnalysisError ? error.status : 500
    const message = error instanceof Error ? error.message : 'ZIP analysis failed.'
    if (!res.headersSent) {
      res.status(status).json({ error: message })
    }
  }
}

function analyzeZipStream(req: Request, fileName: string): Promise<ZipAnalysisResponse> {
  return new Promise((resolve, reject) => {
    const unzip = new Unzip()
    unzip.register(UnzipInflate)

    const directories = new Set<string>()
    const listedEntries: ArchiveEntry[] = []
    const excerptBlocks: string[] = []
    const warnings = new Set<string>()

    let compressedBytes = 0
    let totalUncompressedBytes = 0
    let entryCount = 0
    let extractedTextCount = 0
    let remainingTextChars = MAX_TOTAL_TEXT_CHARS
    let pendingStreams = 0
    let sourceEnded = false
    let settled = false

    const finishIfReady = () => {
      if (settled || !sourceEnded || pendingStreams > 0) {
        return
      }

      const structureLines = listedEntries.map((entry) =>
        `- ${entry.path} (${formatFileSize(entry.size)}, ${entry.kind})`,
      )

      if (entryCount > listedEntries.length) {
        structureLines.push(`- ... omitted ${entryCount - listedEntries.length} more item(s)`)
      }

      const summary = extractedTextCount > 0
        ? `ZIP archive with ${entryCount} item(s) in ${directories.size} director${directories.size === 1 ? 'y' : 'ies'}. Extracted text from ${extractedTextCount} file(s).`
        : `ZIP archive with ${entryCount} item(s) in ${directories.size} director${directories.size === 1 ? 'y' : 'ies'}. No text excerpt was extracted.`

      const promptContext = [
        `File: ${fileName}`,
        'Type: ZIP archive',
        `Size: ${formatFileSize(compressedBytes)}`,
        `Summary: ${summary}`,
        `Total uncompressed size: ${formatFileSize(totalUncompressedBytes)}`,
        '',
        'Archive structure:',
        ...structureLines,
        '',
        excerptBlocks.length > 0 ? 'Extracted text excerpts:' : 'Extracted text excerpts: none',
        ...(excerptBlocks.length > 0 ? excerptBlocks : []),
      ].join('\n')

      settled = true
      resolve({
        kind: 'archive',
        summary,
        promptContext,
        warnings: warnings.size > 0 ? Array.from(warnings) : undefined,
        archive: {
          format: 'zip',
          entryCount,
          directoryCount: directories.size,
          entries: listedEntries,
        },
      })
    }

    const fail = (error: unknown) => {
      if (settled) {
        return
      }

      settled = true
      req.destroy()
      reject(error)
    }

    unzip.onfile = (file) => {
      entryCount += 1
      if (entryCount > MAX_ENTRY_COUNT) {
        throw new ZipAnalysisError(
          413,
          `ZIP contains too many items. The limit is ${MAX_ENTRY_COUNT.toLocaleString('en-US')}.`,
        )
      }

      registerDirectories(file.name, directories)

      const originalSize = normalizeSize(file.originalSize ?? file.size)
      totalUncompressedBytes += originalSize
      if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new ZipAnalysisError(
          413,
          `Expanded ZIP content is too large. The limit is ${formatFileSize(MAX_TOTAL_UNCOMPRESSED_BYTES)}.`,
        )
      }

      const entry: ArchiveEntry = {
        path: file.name,
        size: originalSize,
        kind: isProbablyTextPath(file.name) ? 'text' : 'binary',
      }

      if (listedEntries.length < MAX_ENTRY_LIST) {
        listedEntries.push(entry)
      } else {
        warnings.add('archive-entry-list-truncated')
      }

      const shouldExtractText =
        entry.kind === 'text' &&
        extractedTextCount < MAX_TEXT_ENTRIES &&
        remainingTextChars > 0 &&
        originalSize <= MAX_TEXT_ENTRY_BYTES &&
        (file.compression === 0 || file.compression === 8)

      if (!shouldExtractText) {
        if (entry.kind === 'text' && originalSize > MAX_TEXT_ENTRY_BYTES) {
          warnings.add('text-entry-skipped-large')
        }
        return
      }

      extractedTextCount += 1
      pendingStreams += 1

      const decoder = new TextDecoder()
      const maxCharsForEntry = Math.min(MAX_TEXT_EXCERPT_CHARS, remainingTextChars)
      let excerpt = ''
      let finalChunkReceived = false
      let terminated = false
      let invalidText = false
      let truncated = false
      let sampled = false

      const completeEntry = () => {
        if (terminated) {
          return
        }

        terminated = true
        pendingStreams -= 1

        if (invalidText) {
          entry.kind = 'binary'
          delete entry.excerpt
          delete entry.truncated
        } else {
          const finalized = finalizeExcerpt(excerpt)
          if (finalized.length > 0) {
            entry.excerpt = finalized
            entry.truncated = truncated
            remainingTextChars = Math.max(0, remainingTextChars - finalized.length)
            excerptBlocks.push([
              `[${file.name}]`,
              finalized,
              truncated ? '[truncated]' : '',
            ].filter(Boolean).join('\n'))
          } else {
            entry.kind = 'binary'
            delete entry.excerpt
            delete entry.truncated
          }
        }

        finishIfReady()
      }

      file.ondata = (error, chunk, final) => {
        if (error) {
          warnings.add('text-entry-read-failed')
          invalidText = true
          completeEntry()
          return
        }

        if (!sampled && chunk.length > 0) {
          sampled = true
          if (!isProbablyTextBytes(chunk)) {
            invalidText = true
            file.terminate()
            completeEntry()
            return
          }
        }

        if (!invalidText && excerpt.length < maxCharsForEntry) {
          const decoded = sanitizeTextFragment(decoder.decode(chunk, { stream: !final }))
          const remainingChars = maxCharsForEntry - excerpt.length
          if (decoded.length > remainingChars) {
            excerpt += decoded.slice(0, remainingChars)
            truncated = true
          } else {
            excerpt += decoded
          }
        } else if (chunk.length > 0) {
          truncated = true
        }

        if (final) {
          finalChunkReceived = true
        }

        if (finalChunkReceived) {
          if ((file.originalSize ?? 0) > maxCharsForEntry) {
            truncated = true
          }
          completeEntry()
        }
      }

      try {
        file.start()
      } catch {
        warnings.add('text-entry-read-failed')
        invalidText = true
        completeEntry()
      }
    }

    req.on('data', (chunk: Buffer) => {
      if (settled) {
        return
      }

      try {
        compressedBytes += chunk.length
        if (compressedBytes > MAX_COMPRESSED_BYTES) {
          throw new ZipAnalysisError(
            413,
            `ZIP file is too large. The limit is ${formatFileSize(MAX_COMPRESSED_BYTES)}.`,
          )
        }

        unzip.push(new Uint8Array(chunk), false)
      } catch (error) {
        fail(error)
      }
    })

    req.on('end', () => {
      if (settled) {
        return
      }

      try {
        sourceEnded = true
        unzip.push(new Uint8Array(0), true)
        finishIfReady()
      } catch (error) {
        fail(error)
      }
    })

    req.on('aborted', () => {
      fail(new ZipAnalysisError(499, 'Upload was aborted.'))
    })

    req.on('error', (error) => {
      fail(error)
    })
  })
}

function decodeHeaderValue(value: string | undefined) {
  if (!value) {
    return ''
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseIntegerHeader(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function normalizeSize(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function registerDirectories(entryPath: string, directories: Set<string>) {
  const parts = entryPath.split('/').filter(Boolean)
  for (let index = 0; index < parts.length - 1; index += 1) {
    directories.add(parts.slice(0, index + 1).join('/'))
  }
}

function getExtension(fileName: string) {
  const cleanName = fileName.toLowerCase().trim()
  if (cleanName === 'dockerfile') return 'dockerfile'
  if (cleanName === '.gitignore') return 'gitignore'
  if (cleanName === '.npmrc') return 'npmrc'
  if (cleanName === '.editorconfig') return 'editorconfig'
  const parts = cleanName.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

function isProbablyTextPath(fileName: string) {
  return TEXT_EXTENSIONS.has(getExtension(fileName))
}

function isProbablyTextBytes(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return true
  }

  let suspicious = 0
  const limit = Math.min(bytes.length, 2048)

  for (let index = 0; index < limit; index += 1) {
    const value = bytes[index]
    if (value === 0) {
      return false
    }

    const isControl = value < 7 || (value > 13 && value < 32)
    if (isControl) {
      suspicious += 1
    }
  }

  return suspicious / limit < 0.03
}

function sanitizeTextFragment(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

function finalizeExcerpt(text: string) {
  return text.trim()
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}
