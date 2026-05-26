const SESSION_STORAGE_KEY = 'ai-office-session-token'
const REMEMBER_STORAGE_KEY = 'ai-office-remember'

type SessionExpiredHandler = () => void

let onSessionExpired: SessionExpiredHandler | null = null

export function registerSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler
}

export function notifySessionExpired(): void {
  clearSession()
  onSessionExpired?.()
}

export function getSessionToken(): string | null {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(REMEMBER_STORAGE_KEY)
  return sessionStorage.getItem(SESSION_STORAGE_KEY)
}

function setSessionToken(token: string): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, token)
  localStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(REMEMBER_STORAGE_KEY)
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(REMEMBER_STORAGE_KEY)
}

export function isRemembered(): boolean {
  return false
}

export async function startSession(
  email: string,
  password: string,
  remember = false,
): Promise<{ ok: boolean; error?: string }> {
  void remember
  try {
    const res = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json() as { ok: boolean; token?: string; error?: string }
    if (data.ok && data.token) {
      setSessionToken(data.token)
      return { ok: true }
    }
    return { ok: false, error: data.error ?? '세션 시작에 실패했습니다.' }
  } catch {
    return { ok: false, error: '서버에 연결할 수 없습니다.' }
  }
}

export async function validateExistingSession(): Promise<boolean> {
  const token = getSessionToken()
  if (!token) return false

  try {
    const res = await fetch('/api/session/validate', {
      headers: { 'x-session-token': token },
    })
    if (!res.ok) {
      clearSession()
      return false
    }
    return true
  } catch {
    return false
  }
}

export async function isLoginRequired(): Promise<boolean> {
  try {
    // GET /api/session/required — 401 없이 200으로 로그인 필요 여부만 확인
    const checkRes = await fetch('/api/session/required')
    if (checkRes.ok) {
      const data = await checkRes.json() as { required: boolean }
      if (!data.required) {
        // 비밀번호 미설정 환경 — 빈 자격증명으로 세션 발급
        const startRes = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (startRes.ok) {
          const startData = await startRes.json() as { ok: boolean; token?: string }
          if (startData.ok && startData.token) {
            setSessionToken(startData.token)
            return false
          }
        }
      }
      return data.required
    }
    return true
  } catch {
    return true
  }
}
