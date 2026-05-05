// ─── 서버 세션 관리 ───────────────────────────────────────────────────────────
// VITE_API_SECRET 대신 런타임 세션 토큰을 사용해 API Secret의 브라우저 노출을 방지합니다.
// 흐름: 클라이언트 시작 → /api/session/start 호출 (APP_PASSWORD 선택 검증)
//        → 서버가 랜덤 UUID 토큰 발급 → 클라이언트가 localStorage에 저장
//        → 이후 모든 요청에 x-session-token 헤더 포함
//
// [세션 영속화]
// sessions.json 파일에 저장해 서버 재시작 후에도 로그인 상태를 유지합니다.
// Electron 모드에서는 userData 디렉토리(cwd)에 저장됩니다.

import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24시간
const SESSIONS_FILE = join(process.cwd(), 'sessions.json')

interface Session {
  token: string
  createdAt: number
}

const sessions = new Map<string, Session>()

function loadSessions(): void {
  try {
    if (!existsSync(SESSIONS_FILE)) return
    const data = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8')) as Session[]
    const now = Date.now()
    for (const session of data) {
      if (now - session.createdAt <= SESSION_TTL_MS) {
        sessions.set(session.token, session)
      }
    }
  } catch { /* 파일 손상 시 무시 */ }
}

function saveSessions(): void {
  try {
    writeFileSync(SESSIONS_FILE, JSON.stringify([...sessions.values()]), 'utf-8')
  } catch { /* 저장 실패 시 무시 */ }
}

// 앱 시작 시 기존 세션 복원
loadSessions()

// 만료 세션 정리 (1시간마다)
setInterval(() => {
  const now = Date.now()
  let changed = false
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token)
      changed = true
    }
  }
  if (changed) saveSessions()
}, 60 * 60 * 1000)

export function createSession(): string {
  const token = randomUUID()
  sessions.set(token, { token, createdAt: Date.now() })
  saveSessions()
  return token
}

export function validateSession(token: string | undefined): boolean {
  if (!token) return false
  const session = sessions.get(token)
  if (!session) return false
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token)
    saveSessions()
    return false
  }
  return true
}

export function revokeSession(token: string): void {
  sessions.delete(token)
  saveSessions()
}
