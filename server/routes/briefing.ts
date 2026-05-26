import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { applyServerScheduler, registerBriefingCallback } from '../scheduler'
import { emitSSE } from '../sseEmitter'
import { getProvider, ALLOWED_MODELS } from '../llmUtils'
import { validateWebhookUrl } from '../../src/utils/webhookValidation'

const router = Router()

interface BriefingRequest {
  departments: Array<{ deptId: string; agentName: string; agentRole: string; model: string; prompt: string }>
  ceo: { id: string; name: string; role: string; model: string }
  webhookUrl?: string
  webhookEnabled?: boolean
}

function validateBriefingRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'body가 필요합니다.'
  const b = body as Record<string, unknown>

  if (!Array.isArray(b.departments) || b.departments.length === 0) return 'departments 배열이 필요합니다.'
  if (b.departments.length > 30) return 'departments는 최대 30개까지만 허용됩니다.'

  for (const dept of b.departments as unknown[]) {
    if (!dept || typeof dept !== 'object') return 'departments 항목이 잘못됐습니다.'
    const d = dept as Record<string, unknown>
    if (typeof d.deptId !== 'string' || typeof d.agentName !== 'string') return 'departments 항목에 deptId, agentName이 필요합니다.'
    if (typeof d.model !== 'string' || !ALLOWED_MODELS.has(d.model)) return `허용되지 않은 모델: ${String(d.model)}`
    if (typeof d.prompt !== 'string' || d.prompt.length > 4000) return 'prompt는 최대 4000자까지 허용됩니다.'
  }

  if (!b.ceo || typeof b.ceo !== 'object') return 'ceo 객체가 필요합니다.'
  const ceo = b.ceo as Record<string, unknown>
  if (typeof ceo.model !== 'string' || !ALLOWED_MODELS.has(ceo.model)) return `CEO 모델이 허용되지 않습니다: ${String(ceo.model)}`

  if (b.webhookUrl !== undefined && typeof b.webhookUrl !== 'string') return 'webhookUrl은 문자열이어야 합니다.'

  return null
}

let lastBriefingBody: BriefingRequest | null = null

async function runBriefing(body: BriefingRequest): Promise<string> {
  const parts: string[] = []

  for (const dept of body.departments) {
    try {
      const prov = getProvider(dept.model)
      let text = ''

      if (prov === 'anthropic') {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const res = await client.messages.create({
          model: dept.model, max_tokens: 400,
          system: `당신은 IT 보안 회사 ${dept.agentName}(${dept.agentRole})입니다. 오늘 점검 항목을 2~3문장으로 보고하세요. 확정 사실이 없으면 체크리스트 형태로만 작성하세요.`,
          messages: [{ role: 'user', content: dept.prompt }],
        })
        text = res.content[0].type === 'text' ? res.content[0].text : ''
      } else if (prov === 'openai') {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const res = await client.chat.completions.create({
          model: dept.model, max_tokens: 400,
          messages: [
            { role: 'system', content: `당신은 IT 보안 회사 ${dept.agentName}(${dept.agentRole})입니다.` },
            { role: 'user', content: dept.prompt },
          ],
        })
        text = res.choices[0]?.message?.content ?? ''
      } else {
        const geminiKey = process.env.GEMINI_API_KEY
        if (!geminiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')
        const genAI = new GoogleGenerativeAI(geminiKey)
        const model = genAI.getGenerativeModel({ model: dept.model })
        const res = await model.generateContent(dept.prompt)
        text = res.response.text()
      }

      parts.push(`[${dept.agentName}]\n${text}`)
    } catch (err) {
      console.error('[briefing] 부서 실패:', dept.deptId, err)
    }
  }

  if (parts.length === 0) return ''

  const ceoApiKey = process.env.ANTHROPIC_API_KEY
  if (!ceoApiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않아 CEO 브리핑 요약을 생성할 수 없습니다.')
  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const client = new Anthropic({ apiKey: ceoApiKey })
  const summaryRes = await client.messages.create({
    model: body.ceo.model, max_tokens: 800,
    system: '각 부서 점검 항목을 종합해 경영진 일일 브리핑 형태로 정리하세요. 우선순위 순으로 간결하게 작성하세요.',
    messages: [{ role: 'user', content: `${dateStr} 일일 브리핑\n\n${parts.join('\n\n')}` }],
  })
  const summary = summaryRes.content[0].type === 'text' ? summaryRes.content[0].text : ''
  const full = `📋 ${dateStr} 일일 브리핑\n\n${summary}\n\n[부서별 상세]\n${parts.join('\n\n')}`

  if (body.webhookEnabled && body.webhookUrl) {
    const validation = validateWebhookUrl(body.webhookUrl)
    if (validation.ok) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      fetch(validation.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🌅 *AI 오피스 일일 브리핑*\n${summary.slice(0, 500)}` }),
        signal: controller.signal,
      }).catch((err) => console.error('[briefing] 웹훅 실패:', err))
        .finally(() => clearTimeout(timer))
    } else {
      const failMsg = 'message' in validation ? (validation as { message: string }).message : '알 수 없는 검증 오류'
      console.warn('[briefing] 웹훅 URL 검증 실패:', failMsg)
    }
  }

  emitSSE('briefing', { result: full, triggeredAt: new Date().toISOString() })
  return full
}

registerBriefingCallback(async () => {
  if (!lastBriefingBody) return
  await runBriefing(lastBriefingBody)
})

router.post('/briefing/run', async (req, res) => {
  const validationError = validateBriefingRequest(req.body)
  if (validationError) { res.status(400).json({ error: validationError }); return }

  const body = req.body as BriefingRequest
  lastBriefingBody = body
  try {
    const result = await runBriefing(body)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '브리핑 실패' })
  }
})

router.post('/scheduler', (req, res) => {
  const { enabled, hour, minute } = req.body as { enabled: boolean; hour: number; minute: number }
  applyServerScheduler({ enabled, hour, minute })
  res.json({ ok: true })
})

export default router
