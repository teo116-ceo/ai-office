/**
 * 서버 상태 동기화 서비스
 * localStorage ↔ Express 서버(/api/state) 양방향 동기화
 * - 앱 시작 시: 서버 상태를 pull하여 덮어씀
 * - 상태 변경 시: 2초 디바운스 후 서버에 push
 * - 30초마다 폴링: 다른 기기의 변경사항을 자동 반영
 *
 * [멀티디바이스 동기화]
 * VITE_API_BASE가 설정된 경우 Render 클라우드 서버를 공유 저장소로 사용.
 * Render는 별도 세션이 필요하므로 VITE_SYNC_EMAIL/VITE_SYNC_PASSWORD로 자동 로그인.
 */

import { getSessionToken } from './sessionService'
import { useAgentStore } from '@/store/agentStore'

const STORAGE_KEY = 'ai-office-store'
const DEBOUNCE_MS = 2000
const POLL_INTERVAL_MS = 30_000

// 클라우드 서버 URL (미설정 시 로컬 상대경로)
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
// Render 자동 로그인 자격증명
const SYNC_EMAIL    = (import.meta.env.VITE_SYNC_EMAIL    as string | undefined) ?? ''
const SYNC_PASSWORD = (import.meta.env.VITE_SYNC_PASSWORD as string | undefined) ?? ''

let pushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let isPushing = false
let lastPushAt = 0

// Render 전용 세션 토큰 (로컬 서버 토큰과 별개)
let renderToken: string | null = null

/** Render 서버에 자동 로그인해서 세션 토큰 획득 */
async function ensureRenderToken(): Promise<string | null> {
  if (renderToken) return renderToken
  if (!API_BASE || !SYNC_PASSWORD) return null
  try {
    const res = await fetch(`${API_BASE}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SYNC_EMAIL, password: SYNC_PASSWORD }),
    })
    if (!res.ok) return null
    const data = await res.json() as { ok: boolean; token?: string }
    if (data.ok && data.token) {
      renderToken = data.token
      return renderToken
    }
  } catch { /* 네트워크 오류 무시 */ }
  return null
}

/** 요청 대상에 맞는 인증 헤더 반환 */
async function authHeaders(): Promise<Record<string, string>> {
  if (API_BASE) {
    // Render 모드: Render 전용 세션 토큰 사용
    const token = await ensureRenderToken()
    // 토큰이 만료됐을 수 있으면 재시도
    if (!token) {
      renderToken = null
      const retried = await ensureRenderToken()
      return retried ? { 'x-session-token': retried } : {}
    }
    return { 'x-session-token': token }
  }
  // 로컬 모드: 로컬 세션 토큰 사용
  const token = getSessionToken()
  return token ? { 'x-session-token': token } : {}
}

/** 서버에서 상태를 가져와 localStorage에 적용하고 스토어를 재수화 */
export async function pullAndApplyServerState(): Promise<boolean> {
  try {
    const headers = await authHeaders()
    const res = await fetch(`${API_BASE}/api/state`, { headers })
    if (!res.ok) {
      // 401이면 토큰 만료 — 다음 시도에서 재로그인
      if (res.status === 401) renderToken = null
      return false
    }

    const data = await res.json() as { raw: string | null }
    if (!data.raw) return false

    localStorage.setItem(STORAGE_KEY, data.raw)
    await useAgentStore.persist.rehydrate()
    return true
  } catch {
    return false
  }
}

/** 현재 localStorage 상태를 서버에 저장 */
export async function pushStateToServer(): Promise<void> {
  if (isPushing) return
  isPushing = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const headers = await authHeaders()
    const res = await fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', ...headers },
      body: raw,
    })
    if (res.status === 401) renderToken = null  // 만료 시 다음 push에서 재로그인
    lastPushAt = Date.now()
  } catch {
    // 네트워크 오류 시 로컬 상태 그대로 유지
  } finally {
    isPushing = false
  }
}

/** 상태 변경 시 디바운스 push 예약 */
export function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushStateToServer(), DEBOUNCE_MS)
}

/** 주기적 폴링 — 다른 기기 변경사항 반영 (push 직후엔 스킵) */
async function pollServerState(): Promise<void> {
  // 최근 5초 이내에 push한 경우 스킵 (내 변경사항을 덮어쓰지 않도록)
  if (Date.now() - lastPushAt < 5000) return
  await pullAndApplyServerState()
}

/**
 * 앱 시작 시 호출 — 세션이 준비된 후에 호출할 것
 * 1. 서버 상태 pull → 있으면 덮어쓰기, 없으면 현재 상태를 서버에 초기 업로드
 * 2. 이후 상태 변경 시 자동 push 구독
 * 3. 30초마다 폴링하여 다른 기기 변경사항 반영
 */
export async function initServerSync(): Promise<void> {
  const applied = await pullAndApplyServerState()

  // 서버에 상태가 없으면 현재 로컬 상태를 초기 씨드로 업로드
  if (!applied) {
    await pushStateToServer()
  }

  // 이후 변경 사항 자동 push
  useAgentStore.subscribe(() => schedulePush())

  // 30초마다 다른 기기 변경사항 폴링
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => void pollServerState(), POLL_INTERVAL_MS)
}
