/**
 * 서버 상태 동기화 서비스
 * localStorage ↔ Express 서버(/api/state) 양방향 동기화
 * - 앱 시작 시: 서버 상태를 pull하여 덮어씀
 * - 상태 변경 시: 2초 디바운스 후 서버에 push
 * - 30초마다 폴링: 다른 기기의 변경사항을 자동 반영
 *
 * [멀티디바이스 동기화]
 * VITE_API_BASE가 설정된 경우 Render 클라우드 서버를 공유 저장소로 사용.
 * VITE_SYNC_PASSWORD가 있으면 x-sync-password 헤더로 세션 없이 /api/state에 접근.
 */

import { getSessionToken } from './sessionService'
import { useAgentStore } from '@/store/agentStore'

const STORAGE_KEY = 'ai-office-store'
const DEBOUNCE_MS = 2000
const POLL_INTERVAL_MS = 30_000

// 클라우드 서버 URL (미설정 시 로컬 상대경로)
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
// Render 동기화 비밀번호 — 서버의 x-sync-password 우회 경로 사용 (세션 불필요)
const SYNC_PASSWORD = (import.meta.env.VITE_SYNC_PASSWORD as string | undefined) ?? ''

let pushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let isPushing = false
let lastPushAt = 0

const SYNC_TS_KEY = 'ai-office-sync-ts'

function localSyncedAt(): number {
  return Number(localStorage.getItem(SYNC_TS_KEY) ?? '0')
}

function setLocalSyncedAt(ts: number): void {
  localStorage.setItem(SYNC_TS_KEY, String(ts))
}

/**
 * 요청 대상에 맞는 인증 헤더 반환
 * Render 모드: x-sync-password 헤더로 세션 없이 /api/state 우회 (server/index.ts 참고)
 * 로컬 모드: 로컬 세션 토큰 사용
 */
function authHeaders(): Record<string, string> {
  if (API_BASE && SYNC_PASSWORD) {
    return { 'x-sync-password': SYNC_PASSWORD }
  }
  const token = getSessionToken()
  return token ? { 'x-session-token': token } : {}
}

/** 서버에서 상태를 가져와 localStorage에 적용하고 스토어를 재수화 */
export async function pullAndApplyServerState(): Promise<boolean> {
  try {
    const headers = authHeaders()
    const res = await fetch(`${API_BASE}/api/state`, { headers })
    if (!res.ok) return false

    const data = await res.json() as { raw: string | null; syncedAt?: number }
    if (!data.raw) return false

    // 로컬 상태가 서버보다 더 최신이면 덮어쓰지 않음
    const serverTs = data.syncedAt ?? 0
    const localTs = localSyncedAt()
    if (localTs > serverTs) return false

    localStorage.setItem(STORAGE_KEY, data.raw)
    setLocalSyncedAt(serverTs || Date.now())
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

    const now = Date.now()
    const headers = authHeaders()
    const res = await fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'x-synced-at': String(now), ...headers },
      body: raw,
    })
    if (res.ok) {
      const data = await res.json() as { ok: boolean; reason?: string; syncedAt?: number }
      if (data.ok) {
        lastPushAt = now
        setLocalSyncedAt(now)
      } else if (data.reason === 'stale') {
        // 서버가 더 최신 — pull로 로컬 갱신
        await pullAndApplyServerState()
      }
    }
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
