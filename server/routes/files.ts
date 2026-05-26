import { Router } from 'express'
import { writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { listOutputFiles, readOutputFile, deleteOutputFile } from '../agentTools'
import { handleZipAnalysisRequest } from '../zipAnalysis'

const router = Router()

const BACKUP_DIR = join(process.cwd(), 'agent-output', 'backups')
const MAX_BACKUP_FILES = 30

function ensureBackupDir() {
  mkdirSync(BACKUP_DIR, { recursive: true })
}

function pruneOldBackups() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
    if (files.length > MAX_BACKUP_FILES) {
      const toDelete = files.slice(0, files.length - MAX_BACKUP_FILES)
      for (const f of toDelete) {
        try { unlinkSync(join(BACKUP_DIR, f)) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

router.post('/analyze-zip', (req, res) => {
  void handleZipAnalysisRequest(req, res)
})

router.get('/files', (_req, res) => {
  res.json({ files: listOutputFiles() })
})

router.get('/files/:filename', (req, res) => {
  const content = readOutputFile(req.params.filename)
  if (content === null) { res.status(404).json({ error: '파일 없음' }); return }
  res.type('text/plain; charset=utf-8').send(content)
})

router.delete('/files/:filename', (req, res) => {
  const ok = deleteOutputFile(req.params.filename)
  if (!ok) { res.status(404).json({ error: '파일 없음' }); return }
  res.json({ ok: true })
})

router.post('/backup', (req, res) => {
  try {
    ensureBackupDir()
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `backup-${dateStr}.json`
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    writeFileSync(join(BACKUP_DIR, filename), body, 'utf-8')
    pruneOldBackups()
    res.json({ ok: true, filename })
  } catch (err) {
    console.error('[Backup] 저장 실패:', err)
    res.status(500).json({ error: '백업 저장 실패' })
  }
})

router.get('/backup/list', (_req, res) => {
  try {
    ensureBackupDir()
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10)
    res.json({ files })
  } catch {
    res.json({ files: [] })
  }
})

export default router
