import { notifySessionExpired } from '@/services/sessionService'
import { apiHeaders } from '@/utils/apiHeaders'

const STORE_KEY = 'ai-office-store'
const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000
const AUTO_BACKUP_FIRST_RUN_DELAY_MS = 5 * 60 * 1000

let autoBackupTimer: ReturnType<typeof setInterval> | null = null
let autoBackupFirstRunTimer: ReturnType<typeof setTimeout> | null = null

export function exportBackup(): void {
  const raw = localStorage.getItem(STORE_KEY)
  if (!raw) {
    throw new Error('백업할 데이터가 없습니다.')
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `ai-office-backup-${dateStr}.json`

  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function importBackup(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const text = event.target?.result
        if (typeof text !== 'string') {
          reject(new Error('파일 내용을 읽을 수 없습니다.'))
          return
        }

        const parsed = JSON.parse(text) as unknown
        if (typeof parsed !== 'object' || parsed === null) {
          reject(new Error('올바른 백업 파일 형식이 아닙니다.'))
          return
        }

        // 백업 파일 최소 구조 검증 (state 키 및 필수 필드 확인)
        const obj = parsed as Record<string, unknown>
        const state = obj.state as Record<string, unknown> | undefined
        if (!state || typeof state !== 'object') {
          reject(new Error('백업 파일에 state 필드가 없습니다. AI 오피스에서 내보낸 파일을 사용하세요.'))
          return
        }
        if (!Array.isArray(state.tasks) || !Array.isArray(state.agents)) {
          reject(new Error('백업 파일 구조가 올바르지 않습니다. 손상된 파일일 수 있습니다.'))
          return
        }

        localStorage.setItem(STORE_KEY, text)
        resolve()
      } catch {
        reject(new Error('백업 파일 파싱에 실패했습니다.'))
      }
    }

    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'))
    reader.readAsText(file)
  })
}

export async function sendBackupToServer(): Promise<{ ok: boolean; error?: string }> {
  const raw = localStorage.getItem(STORE_KEY)
  if (!raw) return { ok: true }

  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: raw,
    })

    if (res.status === 401) {
      notifySessionExpired()
      return { ok: false, error: '세션이 만료되었습니다.' }
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: '백업 저장에 실패했습니다.' })) as { error?: string }
      return { ok: false, error: data.error ?? '서버 백업에 실패했습니다.' }
    }

    return { ok: true }
  } catch {
    return { ok: false, error: '서버에 연결할 수 없습니다.' }
  }
}

export function startAutoBackup(): void {
  if (autoBackupTimer !== null || autoBackupFirstRunTimer !== null) return

  autoBackupFirstRunTimer = setTimeout(() => {
    autoBackupFirstRunTimer = null
    void sendBackupToServer()
  }, AUTO_BACKUP_FIRST_RUN_DELAY_MS)

  autoBackupTimer = setInterval(() => {
    void sendBackupToServer()
  }, AUTO_BACKUP_INTERVAL_MS)
}

export function stopAutoBackup(): void {
  if (autoBackupFirstRunTimer !== null) {
    clearTimeout(autoBackupFirstRunTimer)
    autoBackupFirstRunTimer = null
  }

  if (autoBackupTimer !== null) {
    clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }
}

export async function listServerBackups(): Promise<string[]> {
  try {
    const res = await fetch('/api/backup/list', { headers: apiHeaders() })
    if (!res.ok) return []

    const data = await res.json() as { files: string[] }
    return data.files ?? []
  } catch {
    return []
  }
}
