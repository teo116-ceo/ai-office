import { Router } from 'express'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Request } from 'express'

const router = Router()

// 이메일을 파일명으로 안전하게 변환 (특수문자 제거)
function emailToKey(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_')
}

// 요청에서 이메일 추출 — 없으면 'default'
function resolveStateKey(req: Request): string {
  const email = (req.headers['x-sync-email'] as string | undefined)?.trim()
  return email ? emailToKey(email) : 'default'
}

function stateFilePath(key: string) {
  return join(process.cwd(), `server-state-${key}.json`)
}

function stateMetaFilePath(key: string) {
  return join(process.cwd(), `server-state-${key}-meta.json`)
}

// 메모리 캐시: 이메일 키별로 관리
const memoryCache = new Map<string, { raw: string; syncedAt: number }>()

function loadMeta(key: string): number {
  try {
    const metaFile = stateMetaFilePath(key)
    if (existsSync(metaFile)) {
      const meta = JSON.parse(readFileSync(metaFile, 'utf-8')) as { syncedAt?: number }
      return meta.syncedAt ?? 0
    }
  } catch { /* 무시 */ }
  return 0
}

router.get('/state', (req, res) => {
  const key = resolveStateKey(req)
  try {
    const cached = memoryCache.get(key)
    if (cached) { res.json({ raw: cached.raw, syncedAt: cached.syncedAt }); return }

    const file = stateFilePath(key)
    if (!existsSync(file)) { res.json({ raw: null, syncedAt: 0 }); return }

    const raw = readFileSync(file, 'utf-8')
    const syncedAt = loadMeta(key)
    memoryCache.set(key, { raw, syncedAt })
    res.json({ raw, syncedAt })
  } catch {
    res.json({ raw: null, syncedAt: 0 })
  }
})

router.post('/state', (req, res) => {
  const key = resolveStateKey(req)
  try {
    const raw = typeof req.body === 'string' ? req.body : ''
    if (!raw) { res.status(400).json({ error: 'body required' }); return }

    const clientTs = Number(req.headers['x-synced-at'] ?? 0) || Date.now()
    const currentSyncedAt = memoryCache.get(key)?.syncedAt ?? loadMeta(key)

    if (currentSyncedAt > clientTs + 2000) {
      res.json({ ok: false, reason: 'stale', syncedAt: currentSyncedAt }); return
    }

    memoryCache.set(key, { raw, syncedAt: clientTs })
    try { writeFileSync(stateFilePath(key), raw, 'utf-8') } catch { /* 무시 */ }
    try { writeFileSync(stateMetaFilePath(key), JSON.stringify({ syncedAt: clientTs }), 'utf-8') } catch { /* 무시 */ }
    res.json({ ok: true, syncedAt: clientTs })
  } catch {
    res.status(500).json({ error: '상태 저장 실패' })
  }
})

export default router
