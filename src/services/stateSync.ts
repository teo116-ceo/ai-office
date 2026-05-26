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
 * VITE_SYNC_EMAIL이 있으면 x-sync-email 헤더로 사용자별 상태를 분리 저장.
 *
 * [메시지 백업]
 * ai-office-msg-backup 키에 전체 스토어 스냅샷을 별도 보관.
 * 서버 동기화·재설치 등으로 메인 스토어가 비워지면 자동 복구.
 */

import { getSessionToken } from './sessionService'
import { useAgentStore } from '@/store/agentStore'

const STORAGE_KEY = 'ai-office-store'
const MSG_BACKUP_KEY = 'ai-office-msg-backup'
const DEBOUNCE_MS = 2000
const POLL_INTERVAL_MS = 30_000

// 클라우드 서버 URL (미설정 시 로컬 상대경로)
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
// Render 동기화 비밀번호 — 서버의 x-sync-password 우회 경로 사용 (세션 불필요)
const SYNC_PASSWORD = (import.meta.env.VITE_SYNC_PASSWORD as string | undefined) ?? ''
// 사용자 이메일 — 이메일별 상태 분리 저장 (다수 사용자·기업 지원)
const SYNC_EMAIL = (import.meta.env.VITE_SYNC_EMAIL as string | undefined) ?? ''

let pushTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let isPushing = false
let lastPushAt = 0
let _beforeUnloadHandler: (() => void) | null = null

// ─── 동기화 상태 공개 API ───────────────────────────────────────────────────
export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

interface SyncState {
  status: SyncStatus
  errorMsg?: string
  lastSyncAt?: number
}

let _syncState: SyncState = { status: 'idle' }
const _syncListeners = new Set<(s: SyncState) => void>()

function setSyncState(next: SyncState): void {
  _syncState = next
  _syncListeners.forEach((cb) => cb(next))
}

export function getSyncState(): SyncState {
  return _syncState
}

export function subscribeSyncState(cb: (s: SyncState) => void): () => void {
  _syncListeners.add(cb)
  return () => _syncListeners.delete(cb)
}

const SYNC_TS_KEY = 'ai-office-sync-ts'

function localSyncedAt(): number {
  return Number(localStorage.getItem(SYNC_TS_KEY) ?? '0')
}

function setLocalSyncedAt(ts: number): void {
  localStorage.setItem(SYNC_TS_KEY, String(ts))
}

// ─── 메시지 백업/복구 ──────────────────────────────────────────────────────

type StateShape = { state?: { messages?: { timestamp?: string }[]; tasks?: unknown[] }; version?: number }

/** 메인 스토어 스냅샷에 메시지가 있으면 백업 키에 별도 저장 */
function saveMessageBackup(raw: string): void {
  try {
    const parsed = JSON.parse(raw) as StateShape
    const msgCount = parsed?.state?.messages?.length ?? 0
    if (msgCount > 0) {
      localStorage.setItem(MSG_BACKUP_KEY, raw)
    }
  } catch { /* 파싱 실패 시 무시 */ }
}

/**
 * 메인 스토어가 비어 있을 때 백업으로부터 복구
 * 서버 동기화·스토어 초기화 등으로 메시지가 사라졌을 때 자동으로 되돌림
 */
async function restoreFromBackupIfNeeded(): Promise<boolean> {
  try {
    // 메인 스토어에 메시지가 있으면 복구 불필요
    const mainRaw = localStorage.getItem(STORAGE_KEY)
    if (mainRaw) {
      const mainParsed = JSON.parse(mainRaw) as StateShape
      if ((mainParsed?.state?.messages?.length ?? 0) > 0) return false
    }

    // 백업에 메시지가 있으면 복구
    const backupRaw = localStorage.getItem(MSG_BACKUP_KEY)
    if (!backupRaw) return false
    const backupParsed = JSON.parse(backupRaw) as StateShape
    if ((backupParsed?.state?.messages?.length ?? 0) === 0) return false

    console.info('[stateSync] 메인 스토어 비어있음 — 백업으로 복구합니다.')
    localStorage.setItem(STORAGE_KEY, backupRaw)
    await useAgentStore.persist.rehydrate()
    return true
  } catch {
    return false
  }
}

/** 백업에서 강제 복구 (설정화면 "복구" 버튼용) */
export async function forceRestoreFromBackup(): Promise<boolean> {
  try {
    const backupRaw = localStorage.getItem(MSG_BACKUP_KEY)
    if (!backupRaw) return false
    const backupParsed = JSON.parse(backupRaw) as StateShape
    if ((backupParsed?.state?.messages?.length ?? 0) === 0) return false
    localStorage.setItem(STORAGE_KEY, backupRaw)
    await useAgentStore.persist.rehydrate()
    return true
  } catch {
    return false
  }
}

/** 백업에 저장된 메시지 수 반환 */
export function getBackupMessageCount(): number {
  try {
    const raw = localStorage.getItem(MSG_BACKUP_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as StateShape
    return parsed?.state?.messages?.length ?? 0
  } catch {
    return 0
  }
}

/**
 * 요청 대상에 맞는 인증 헤더 반환
 * Render 모드: x-sync-password 헤더로 세션 없이 /api/state 우회 (server/index.ts 참고)
 * 로컬 모드: 로컬 세션 토큰 사용
 */
function authHeaders(): Record<string, string> {
  const emailHeader: Record<string, string> = SYNC_EMAIL ? { 'x-sync-email': SYNC_EMAIL } : {}
  if (API_BASE && SYNC_PASSWORD) {
    return { 'x-sync-password': SYNC_PASSWORD, ...emailHeader }
  }
  const token = getSessionToken()
  return token ? { 'x-session-token': token, ...emailHeader } : emailHeader
}

/** 서버에서 상태를 가져와 localStorage에 적용하고 스토어를 재수화 */
export async function pullAndApplyServerState(): Promise<boolean> {
  try {
    const headers = authHeaders()
    const res = await fetch(`${API_BASE}/api/state`, { headers })
    if (!res.ok) return false

    const data = await res.json() as { raw: string | null; syncedAt?: number }
    if (!data.raw) return false

    // 로컬 상태가 서버보다 최신이거나 같으면 덮어쓰지 않음
    const serverTs = data.syncedAt ?? 0
    const localTs = localSyncedAt()
    if (localTs >= serverTs) return false

    // 로컬 데이터가 서버보다 풍부하거나 최신이면 덮어쓰지 않음
    try {
      const serverParsed = JSON.parse(data.raw) as StateShape
      const serverMsgs = serverParsed?.state?.messages ?? []
      const serverMsgCount = serverMsgs.length
      const serverTaskCount = serverParsed?.state?.tasks?.length ?? 0
      const localRaw = localStorage.getItem(STORAGE_KEY)
      if (localRaw) {
        const localParsed = JSON.parse(localRaw) as StateShape
        const localMsgs = localParsed?.state?.messages ?? []
        const localMsgCount = localMsgs.length
        const localTaskCount = localParsed?.state?.tasks?.length ?? 0
        // 메시지나 태스크 중 하나라도 로컬이 더 많으면 풀 차단
        if (serverMsgCount < localMsgCount || serverTaskCount < localTaskCount) return false
        // 메시지 수가 같을 때: 로컬 최신 메시지 타임스탬프 비교 — 로컬이 더 최신이면 풀 차단
        if (serverMsgCount === localMsgCount && localMsgCount > 0) {
          const localLastTs = new Date(localMsgs[localMsgCount - 1]?.timestamp ?? 0).getTime()
          const serverLastTs = new Date(serverMsgs[serverMsgCount - 1]?.timestamp ?? 0).getTime()
          if (localLastTs >= serverLastTs) return false
        }
      }
    } catch { /* 파싱 실패 시 안전하게 pull 허용 */ }

    // 서버 상태 적용 전 현재 로컬 상태를 백업으로 보존
    const currentRaw = localStorage.getItem(STORAGE_KEY)
    if (currentRaw) saveMessageBackup(currentRaw)

    localStorage.setItem(STORAGE_KEY, data.raw)
    // 서버에서 받은 데이터도 백업 갱신 (더 풍부한 쪽이 남도록)
    saveMessageBackup(data.raw)
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
  setSyncState({ status: 'syncing' })
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) { setSyncState({ status: 'idle' }); return }

    // push 전 백업 저장
    saveMessageBackup(raw)

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
        setSyncState({ status: 'ok', lastSyncAt: now })
      } else if (data.reason === 'stale') {
        // 서버가 더 최신 — pull로 로컬 갱신
        await pullAndApplyServerState()
        setSyncState({ status: 'ok', lastSyncAt: Date.now() })
      } else {
        setSyncState({ status: 'error', errorMsg: '서버가 저장을 거부했습니다.' })
      }
    } else {
      setSyncState({ status: 'error', errorMsg: `서버 응답 오류 (HTTP ${res.status})` })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '네트워크 오류'
    setSyncState({ status: 'error', errorMsg: msg })
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
 * 0. 메인 스토어 비어있으면 백업으로 자동 복구
 * 1. 서버 상태 pull → 있으면 덮어쓰기, 없으면 현재 상태를 서버에 초기 업로드
 * 2. 이후 상태 변경 시 자동 push 구독
 * 3. 30초마다 폴링하여 다른 기기 변경사항 반영
 */
export async function initServerSync(): Promise<void> {
  // [0] 메인 스토어가 비어있으면 백업으로 복구 (서버 동기화보다 먼저 실행)
  await restoreFromBackupIfNeeded()

  const applied = await pullAndApplyServerState()

  // 서버에 상태가 없으면 현재 로컬 상태를 초기 씨드로 업로드
  if (!applied) {
    await pushStateToServer()
  }

  // 이후 변경 사항 자동 push + 백업
  useAgentStore.subscribe((state) => {
    // 메시지가 있을 때만 백업 저장 (빈 상태로 덮어쓰기 방지)
    if (state.messages.length > 0) {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) saveMessageBackup(raw)
    }
    schedulePush()
  })

  // 30초마다 다른 기기 변경사항 폴링
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => void pollServerState(), POLL_INTERVAL_MS)

  // 창/탭 닫힐 때 디바운스 타이머를 취소하고 즉시 push
  // keepalive: true — 브라우저가 페이지를 언로드한 후에도 요청 완료를 보장
  if (_beforeUnloadHandler) {
    window.removeEventListener('beforeunload', _beforeUnloadHandler)
  }
  _beforeUnloadHandler = () => {
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    // 언로드 직전 백업 저장
    saveMessageBackup(raw)
    const now = Date.now()
    // 로컬 타임스탬프를 즉시 갱신 — 재시작 시 불필요한 pull 방지
    setLocalSyncedAt(now)
    void fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'x-synced-at': String(now), ...authHeaders() },
      body: raw,
      keepalive: true,
    })
  }
  window.addEventListener('beforeunload', _beforeUnloadHandler)
}
