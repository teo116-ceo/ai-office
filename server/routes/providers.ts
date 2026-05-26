import { Router } from 'express'
import {
  clearRuntimeApiKeys,
  getRuntimeApiKeyStatus,
  hasAnyProviderKey,
  loadRuntimeApiKeys,
  saveRuntimeApiKeys,
  type RuntimeApiKeys,
} from '../runtimeApiKeys'

const router = Router()

loadRuntimeApiKeys()

router.get('/provider-status', (_req, res) => {
  res.json({ providers: getRuntimeApiKeyStatus() })
})

router.post('/provider-keys', (req, res) => {
  const { anthropic, openai, gemini } = req.body as RuntimeApiKeys
  const normalized = {
    anthropic: anthropic?.trim() ?? '',
    openai: openai?.trim() ?? '',
    gemini: gemini?.trim() ?? '',
  }

  if (!normalized.anthropic && !normalized.openai && !normalized.gemini && !hasAnyProviderKey()) {
    res.status(400).json({ ok: false, error: '최소 1개의 API 키를 입력하세요.' }); return
  }

  try {
    saveRuntimeApiKeys(normalized)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'API 키 저장 실패' })
  }
})

router.delete('/provider-keys', (_req, res) => {
  try {
    clearRuntimeApiKeys()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : '키 삭제 실패' })
  }
})

export default router
