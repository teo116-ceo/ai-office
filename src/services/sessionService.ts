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
  return localStorage.getItem(SESSION_STORAGE_KEY)
    ?? sessionStorage.getItem(SESSION_STORAGE_KEY)
}

function setSessionToken(token: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(SESSION_STORAGE_KEY, token)
    localStorage.setItem(REMEMBER_STORAGE_KEY, '1')
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } else {
    sessionStorage.setItem(SESSION_STORAGE_KEY, token)
    localStorage.removeItem(SESSION_STORAGE_KEY)
    localStorage.removeItem(REMEMBER_STORAGE_KEY)
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(SESSION_STORAGE_KEY)
  localStorage.removeItem(REMEMBER_STORAGE_KEY)
}

export function isRemembered(): boolean {
  return localStorage.getItem(REMEMBER_STORAGE_KEY) === '1'
}

export async function startSession(
  email: string,
  password: string,
  remember = false,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json() as { ok: boolean; token?: string; error?: string }
    if (data.ok && data.token) {
      setSessionToken(data.token, remember)
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
    const res = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    if (res.ok) {
      const data = await res.json() as { ok: boolean; token?: string }
      if (data.ok && data.token) {
        setSessionToken(data.token, false)
        return false
      }
    }

    return true
  } catch {
    return false
  }
}
