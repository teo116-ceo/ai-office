import { appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url))

const LOG_FILE = join(_dirname, '..', 'error.log')
const MAX_STACK_LINES = 8

let _writeTimer: ReturnType<typeof setTimeout> | null = null
const _pendingLines: string[] = []

function flushLogs(): void {
  if (_pendingLines.length === 0) return
  const batch = _pendingLines.splice(0)
  try {
    appendFileSync(LOG_FILE, batch.join(''), 'utf8')
  } catch {
    // 로그 파일 쓰기 실패는 무시 — 서버 가용성에 영향 주지 않음
  }
}

function scheduledFlush(): void {
  _writeTimer = null
  flushLogs()
}

function enqueue(line: string): void {
  _pendingLines.push(line)
  if (_writeTimer) return
  _writeTimer = setTimeout(scheduledFlush, 500)
}

// 프로세스 종료 직전 동기 flush — 모듈 로드 시 딱 1회만 등록
// (logError 호출마다 등록하면 오류 100회 시 리스너 100개 누적됨)
process.once('beforeExit', flushLogs)

export function logError(context: string, message: string, stack?: string): void {
  const ts = new Date().toISOString()
  const stackLines = stack
    ? stack.split('\n').slice(0, MAX_STACK_LINES).join('\n    ')
    : ''
  const entry = `[${ts}] [ERROR] [${context}] ${message}${stackLines ? `\n    ${stackLines}` : ''}\n`
  enqueue(entry)
}
