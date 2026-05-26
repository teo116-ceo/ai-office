import { Router } from 'express'
import {
  createNotionPage as createNotionPageProxy,
  testNotionConnection as testNotionConnectionProxy,
  type NotionPageRequest,
} from '../notionProxy'

const router = Router()

let notionConfig: { token: string; databaseId: string } | null = null

router.post('/notion/configure', (req, res) => {
  const { token, databaseId } = req.body as { token?: string; databaseId?: string }
  if (!token?.trim() || !databaseId?.trim()) {
    res.status(400).json({ ok: false, message: '토큰과 데이터베이스 ID가 필요합니다.' }); return
  }
  notionConfig = { token: token.trim(), databaseId: databaseId.trim() }
  res.json({ ok: true })
})

router.post('/notion/test', async (_req, res) => {
  if (!notionConfig) { res.status(400).json({ ok: false, message: 'Notion 설정을 먼저 저장하세요.' }); return }
  try {
    const result = await testNotionConnectionProxy(notionConfig)
    res.status(result.status).json({ ok: result.ok, message: result.message })
  } catch (err) {
    res.status(502).json({ ok: false, message: err instanceof Error ? err.message : 'Notion 연결 테스트 실패' })
  }
})

router.post('/notion/pages', async (req, res) => {
  if (!notionConfig) { res.status(400).json({ ok: false, message: 'Notion 설정을 먼저 저장하세요.' }); return }
  const { title, children } = req.body as Partial<Pick<NotionPageRequest, 'title' | 'children'>>
  if (!title?.trim() || !Array.isArray(children)) {
    res.status(400).json({ ok: false, message: '제목과 children 배열이 필요합니다.' }); return
  }
  try {
    await createNotionPageProxy({ ...notionConfig, title, children })
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ ok: false, message: err instanceof Error ? err.message : 'Notion 페이지 생성 실패' })
  }
})

export default router
