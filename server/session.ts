// ─── 서버 세션 관리 ───────────────────────────────────────────────────────────
// VITE_API_SECRET 대신 런타임 세션 토큰을 사용해 API Secret의 브라우저 노출을 방지합니다.
// 흐름: 클라이언트 시작 → /api/session/start 호출 (APP_PASSWORD 선택 검증)
//        → 서버가 랜덤 UUID 토큰 발급 → 클라이언트가 sessionStorage에 저장
//        → 이후 모든 요청에 x-session-token 헤더 포함

import { randomUUID } from 'node:crypto'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24시간

interface Session {
  token: string
  createdAt: number
}

const sessions = new Map<string, Session>()

// 만료 세션 정리 (1시간마다)
setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token)
    }
  }
}, 60 * 60 * 1000)

export function createSession(): string {
  const token = randomUUID()
  sessions.set(token, { token, createdAt: Date.now() })
  return token
}

export function validateSession(token: string | undefined): boolean {
  if (!token) return false
  const session = sessions.get(token)
  if (!session) return false
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token)
    return false
  }
  return true
}

export function revokeSession(token: string): void {
  sessions.delete(token)
}
