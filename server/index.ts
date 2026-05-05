import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { handleZipAnalysisRequest } from './zipAnalysis'
import { applyServerScheduler, registerBriefingCallback, stopServerScheduler } from './scheduler'
import { runLLMWithTools, listOutputFiles, readOutputFile, deleteOutputFile } from './agentTools'
import { addSSEClient, removeSSEClient, emitSSE } from './sseEmitter'
import { checkRateLimit } from './rateLimiter'
import { checkServerBudget, recordServerUsage } from './serverBudget'
import {
  createNotionPage as createNotionPageProxy,
  testNotionConnection as testNotionConnectionProxy,
  type NotionPageRequest,
} from './notionProxy'
import { proxyWebhookRequest } from './webhookProxy'
import { validateWebhookUrl } from '../src/utils/webhookValidation'
import { createSession, validateSession } from './session'
import { writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname polyfill for ESM (esbuild CJS bundle defines __dirname natively)
const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url))

const app = express()

type RuntimeApiKeys = {
  anthropic?: string
  openai?: string
  gemini?: string
}

function hasAnyProviderKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
}

function updateEnvFile(keys: RuntimeApiKeys) {
  const envPath = join(process.cwd(), '.env')
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
  const lines = existing.split(/\r?\n/)
  // undefined = 변경 안 함, '' = 삭제(빈값으로 덮어쓰기), non-empty = 업데이트
  const updates: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: keys.anthropic?.trim(),
    OPENAI_API_KEY: keys.openai?.trim(),
    GEMINI_API_KEY: keys.gemini?.trim(),
  }
  const seen = new Set<string>()

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/)
    if (!match) return line

    const key = match[1]
    if (!(key in updates)) return line

    seen.add(key)
    const value = updates[key]
    return `${key}=${value ?? ''}`
  })

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value ?? ''}`)
    }
  }

  writeFileSync(envPath, nextLines.join('\n'), 'utf-8')
}

// CORS: 환경변수 ALLOWED_ORIGINS로 제한 가능 (쉼표 구분).
// 미설정 시 터널(cloudflared 등) 접근을 위해 전체 허용.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null

app.use(cors({
  origin: ALLOWED_ORIGINS
    ? (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true)
        else cb(new Error(`CORS: ${origin} not allowed`))
      }
    : true,
}))

// ─── 세션 기반 API 인증 미들웨어 ──────────────────────────────────────────────
// VITE_API_SECRET 방식 제거 → 런타임 세션 토큰 방식으로 교체
// 클라이언트는 /api/session/start로 토큰을 받아 sessionStorage에만 보관합니다.
// SSE는 EventSource가 커스텀 헤더 미지원이므로 query param도 허용합니다.
const APP_EMAIL = process.env.APP_EMAIL      // 선택적 이메일+비밀번호 보호
const APP_PASSWORD = process.env.APP_PASSWORD

// 세션 시작 (로그인) — 인증 미들웨어 적용 전에 등록
app.use(express.json({ limit: '4mb' }))

app.post('/api/session/start', (req, res) => {
  // 로그인 브루트포스 방어: IP당 15분에 10회 제한
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket.remoteAddress
    ?? 'unknown'
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: '너무 많은 로그인 시도입니다. 15분 후 다시 시도하세요.' })
    return
  }

  if (APP_EMAIL || APP_PASSWORD) {
    const { email, password } = req.body as { email?: string; password?: string }
    const emailOk = !APP_EMAIL || (email?.trim().toLowerCase() === APP_EMAIL.trim().toLowerCase())
    const passwordOk = !APP_PASSWORD || password === APP_PASSWORD
    if (!emailOk || !passwordOk) {
      res.status(401).json({ ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
      return
    }
  }
  const token = createSession()
  res.json({ ok: true, token })
})

app.use('/api', (req, res, next) => {
  // 세션 시작 엔드포인트와 OPTIONS는 인증 제외
  if (req.path === '/session/start' || req.method === 'OPTIONS') { next(); return }

  // health check는 인증 없이 항상 허용 (Electron waitForServer 용)
  if (req.path === '/health') { next(); return }

  // 디바이스 간 상태 동기화: x-sync-password 헤더로 세션 없이 접근 허용
  // (Electron 앱들이 Render 서버를 공유 상태 저장소로 사용)
  if (req.path === '/state' && APP_PASSWORD) {
    const syncPw = req.headers['x-sync-password'] as string | undefined
    if (syncPw === APP_PASSWORD) { next(); return }
  }

  const token = (req.headers['x-session-token'] as string | undefined)
    ?? (req.query.token as string | undefined)

  if (!validateSession(token)) {
    res.status(401).json({ error: '세션이 만료되었거나 인증되지 않았습니다. 새로고침 후 다시 시도하세요.' })
    return
  }
  next()
})

// 세션 유효성 확인 — 인증 미들웨어 통과 시 항상 200 반환
app.get('/api/session/validate', (_req, res) => {
  res.json({ ok: true })
})

// ─── Notion 자격증명 서버 캐시 ────────────────────────────────────────────────
// 클라이언트가 매 요청마다 토큰을 보내지 않아도 되도록 서버 메모리에 캐시
let notionConfig: { token: string; databaseId: string } | null = null

interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

interface LLMRequest {
  model: string
  system: string
  messages: LLMMessage[]
  maxTokens?: number
}

// 허용된 모델 목록 — 이 외의 모델 ID는 모두 거부
const ALLOWED_MODELS = new Set([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
])

// 요청 당 메시지 제한
const MAX_MESSAGES_PER_REQUEST = 50
const MAX_CONTENT_LENGTH_PER_MESSAGE = 100_000   // 약 25,000 토큰 상당
const MAX_SYSTEM_LENGTH = 20_000

// LLM 엔드포인트 Rate Limit: 세션당 분당 30회
const LLM_RATE_LIMIT_MAX = 30
const LLM_RATE_LIMIT_WINDOW_MS = 60 * 1000

function getProvider(model: string): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-')) return 'openai'
  return 'gemini'
}

const MAX_TOKENS_LIMIT = 16000

function validateLLMRequest(
  model: string,
  system: string | undefined,
  messages: LLMMessage[],
  sessionToken: string | undefined,
  req: express.Request,
): string | null {
  // 모델 allowlist
  if (!ALLOWED_MODELS.has(model)) {
    return `허용되지 않은 모델입니다: ${model}`
  }

  // system 프롬프트 길이
  if (system && system.length > MAX_SYSTEM_LENGTH) {
    return `system 프롬프트가 너무 깁니다 (최대 ${MAX_SYSTEM_LENGTH.toLocaleString()}자)`
  }

  // 메시지 개수
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return `메시지가 너무 많습니다 (최대 ${MAX_MESSAGES_PER_REQUEST}개)`
  }

  // 메시지 내용 길이
  for (const msg of messages) {
    if (typeof msg.content !== 'string') return '메시지 content는 문자열이어야 합니다.'
    if (!['user', 'assistant'].includes(msg.role)) return `허용되지 않은 role: ${msg.role}`
    if (msg.content.length > MAX_CONTENT_LENGTH_PER_MESSAGE) {
      return `메시지 내용이 너무 깁니다 (최대 ${MAX_CONTENT_LENGTH_PER_MESSAGE.toLocaleString()}자)`
    }
  }

  // 세션당 LLM 호출 Rate Limit
  const rateLimitKey = sessionToken
    ? `llm:session:${sessionToken.slice(0, 8)}`
    : `llm:ip:${req.socket.remoteAddress}`
  if (!checkRateLimit(rateLimitKey, LLM_RATE_LIMIT_MAX, LLM_RATE_LIMIT_WINDOW_MS)) {
    return `LLM 호출이 너무 빈번합니다. 잠시 후 다시 시도하세요. (분당 ${LLM_RATE_LIMIT_MAX}회 제한)`
  }

  return null // 검증 통과
}

app.post('/api/llm', async (req, res) => {
  const { model, system, messages, maxTokens: rawTokens = 1024 }: LLMRequest = req.body

  if (!model || typeof model !== 'string') { res.status(400).json({ error: 'model 필드가 필요합니다.' }); return }
  if (!Array.isArray(messages) || messages.length === 0) { res.status(400).json({ error: 'messages 배열이 필요합니다.' }); return }

  const sessionToken = req.headers['x-session-token'] as string | undefined
  const validationError = validateLLMRequest(model, system, messages, sessionToken, req)
  if (validationError) { res.status(400).json({ error: validationError }); return }

  // 서버 사이드 일별 토큰 예산 사전 체크 (예상 소비 토큰 = maxTokens)
  const maxTokens = Math.min(rawTokens, MAX_TOKENS_LIMIT)
  if (!checkServerBudget(maxTokens)) {
    res.status(429).json({ error: '서버 일별 토큰 예산이 소진되었습니다. 내일 다시 시도하거나 관리자에게 문의하세요.' })
    return
  }

  try {
    const prov = getProvider(model)

    if (prov === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }); return }
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({ model, max_tokens: maxTokens, system, messages })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const actualTokens = response.usage.input_tokens + response.usage.output_tokens
      recordServerUsage(actualTokens)
      res.json({
        text,
        usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      })

    } else if (prov === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }); return }
      const client = new OpenAI({ apiKey })
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      })
      const inputTok = response.usage?.prompt_tokens ?? 0
      const outputTok = response.usage?.completion_tokens ?? 0
      recordServerUsage(inputTok + outputTok)
      res.json({
        text: response.choices[0]?.message?.content ?? '',
        usage: { input_tokens: inputTok, output_tokens: outputTok },
      })

    } else {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }); return }
      const genAI = new GoogleGenerativeAI(apiKey)
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: system })
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))
      const last = messages[messages.length - 1]
      const chat = geminiModel.startChat({ history })
      const result = await chat.sendMessage(last.content)
      const usageMeta = result.response.usageMetadata
      recordServerUsage((usageMeta?.promptTokenCount ?? 0) + (usageMeta?.candidatesTokenCount ?? 0))
      res.json({
        text: result.response.text(),
        usage: {
          input_tokens: usageMeta?.promptTokenCount ?? 0,
          output_tokens: usageMeta?.candidatesTokenCount ?? 0,
        },
      })
    }
  } catch (err) {
    console.error('[LLM Proxy Error]', model, err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'LLM 호출 실패' })
  }
})

// ─── LLM 스트리밍 엔드포인트 ─────────────────────────────────────────────────
app.post('/api/llm/stream', async (req, res) => {
  const { model, system, messages, maxTokens: rawTokens = 1024 }: LLMRequest = req.body

  if (!model || typeof model !== 'string') { res.status(400).json({ error: 'model 필드가 필요합니다.' }); return }
  if (!Array.isArray(messages) || messages.length === 0) { res.status(400).json({ error: 'messages 배열이 필요합니다.' }); return }

  const sessionToken = req.headers['x-session-token'] as string | undefined
  const streamValidationError = validateLLMRequest(model, system, messages, sessionToken, req)
  if (streamValidationError) { res.status(400).json({ error: streamValidationError }); return }

  const maxTokens = Math.min(rawTokens, MAX_TOKENS_LIMIT)
  if (!checkServerBudget(maxTokens)) {
    res.status(429).json({ error: '서버 일별 토큰 예산이 소진되었습니다.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const write = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    const prov = getProvider(model)

    if (prov === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) { write('error', { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }); res.end(); return }
      const client = new Anthropic({ apiKey })
      const stream = client.messages.stream({ model, max_tokens: maxTokens, system, messages })
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          write('delta', { text: chunk.delta.text })
        }
      }
      const final = await stream.finalMessage()
      recordServerUsage(final.usage.input_tokens + final.usage.output_tokens)
      write('done', { usage: { input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens } })

    } else if (prov === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) { write('error', { error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }); res.end(); return }
      const client = new OpenAI({ apiKey })
      const stream = await client.chat.completions.create({
        model, max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
        stream: true,
      })
      let inputTokens = 0
      let outputTokens = 0
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) write('delta', { text: delta })
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0
          outputTokens = chunk.usage.completion_tokens ?? 0
        }
      }
      recordServerUsage(inputTokens + outputTokens)
      write('done', { usage: { input_tokens: inputTokens, output_tokens: outputTokens } })

    } else {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) { write('error', { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }); res.end(); return }
      const genAI = new GoogleGenerativeAI(apiKey)
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: system })
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))
      const last = messages[messages.length - 1]
      const chat = geminiModel.startChat({ history })
      const result = await chat.sendMessageStream(last.content)
      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) write('delta', { text })
      }
      const finalRes = await result.response
      const usageMeta = finalRes.usageMetadata
      recordServerUsage((usageMeta?.promptTokenCount ?? 0) + (usageMeta?.candidatesTokenCount ?? 0))
      write('done', { usage: { input_tokens: usageMeta?.promptTokenCount ?? 0, output_tokens: usageMeta?.candidatesTokenCount ?? 0 } })
    }
  } catch (err) {
    console.error('[LLM Stream Error]', model, err)
    write('error', { error: err instanceof Error ? err.message : 'LLM 스트리밍 실패' })
  } finally {
    res.end()
  }
})

app.post('/api/embeddings', async (req, res) => {
  const { texts } = req.body as { texts: string[] }
  if (!Array.isArray(texts) || texts.length === 0) {
    res.status(400).json({ error: '텍스트 배열이 필요합니다.' })
    return
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'OPENAI_API_KEY 미설정 — 시맨틱 검색 비활성화' })
    return
  }
  try {
    const client = new OpenAI({ apiKey })
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    })
    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding)
    res.json({ embeddings })
  } catch (err) {
    console.error('[Embeddings Error]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : '임베딩 생성 실패' })
  }
})

app.post('/api/analyze-zip', (req, res) => {
  void handleZipAnalysisRequest(req, res)
})

app.post('/api/webhook-proxy', async (req, res) => {
  const { url, payload } = req.body as { url: string; payload: object }
  if (!url || typeof url !== 'string' || !payload || typeof payload !== 'object') {
    res.status(400).json({ ok: false, error: 'URL과 payload 객체가 필요합니다.' })
    return
  }

  const result = await proxyWebhookRequest(url, payload)
  res.status(result.status).json(result.ok
    ? { ok: true, status: result.upstreamStatus ?? 200, message: result.message }
    : { ok: false, error: result.message })
})

app.get('/api/provider-status', (_req, res) => {
  res.json({
    providers: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    },
  })
})

app.delete('/api/provider-keys', (_req, res) => {
  process.env.ANTHROPIC_API_KEY = ''
  process.env.OPENAI_API_KEY = ''
  process.env.GEMINI_API_KEY = ''
  try {
    updateEnvFile({ anthropic: '', openai: '', gemini: '' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : '키 삭제 실패' })
  }
})

app.post('/api/provider-keys', (req, res) => {
  const { anthropic, openai, gemini } = req.body as RuntimeApiKeys
  const normalized = {
    anthropic: anthropic?.trim() ?? '',
    openai: openai?.trim() ?? '',
    gemini: gemini?.trim() ?? '',
  }

  if (!normalized.anthropic && !normalized.openai && !normalized.gemini && !hasAnyProviderKey()) {
    res.status(400).json({ ok: false, error: '최소 1개의 API 키를 입력하세요.' })
    return
  }

  if (normalized.anthropic) process.env.ANTHROPIC_API_KEY = normalized.anthropic
  if (normalized.openai) process.env.OPENAI_API_KEY = normalized.openai
  if (normalized.gemini) process.env.GEMINI_API_KEY = normalized.gemini

  try {
    updateEnvFile(normalized)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'API 키 저장 실패' })
  }
})

// 토큰을 서버 메모리에 저장 (이후 test/pages 호출 시 재전송 불필요)
app.post('/api/notion/configure', (req, res) => {
  const { token, databaseId } = req.body as { token?: string; databaseId?: string }
  if (!token?.trim() || !databaseId?.trim()) {
    res.status(400).json({ ok: false, message: '토큰과 데이터베이스 ID가 필요합니다.' })
    return
  }
  notionConfig = { token: token.trim(), databaseId: databaseId.trim() }
  res.json({ ok: true })
})

app.post('/api/notion/test', async (_req, res) => {
  if (!notionConfig) {
    res.status(400).json({ ok: false, message: 'Notion 설정을 먼저 저장하세요.' })
    return
  }
  try {
    const result = await testNotionConnectionProxy(notionConfig)
    res.status(result.status).json({ ok: result.ok, message: result.message })
  } catch (err) {
    res.status(502).json({ ok: false, message: err instanceof Error ? err.message : 'Notion 연결 테스트 실패' })
  }
})

app.post('/api/notion/pages', async (req, res) => {
  if (!notionConfig) {
    res.status(400).json({ ok: false, message: 'Notion 설정을 먼저 저장하세요.' })
    return
  }
  const { title, children } = req.body as Partial<Pick<NotionPageRequest, 'title' | 'children'>>
  if (!title?.trim() || !Array.isArray(children)) {
    res.status(400).json({ ok: false, message: '제목과 children 배열이 필요합니다.' })
    return
  }
  try {
    await createNotionPageProxy({ ...notionConfig, title, children })
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ ok: false, message: err instanceof Error ? err.message : 'Notion 페이지 생성 실패' })
  }
})

// ─── 서버사이드 스케줄러 ──────────────────────────────────────────────────────
interface BriefingRequest {
  departments: Array<{ deptId: string; agentName: string; agentRole: string; model: string; prompt: string }>
  ceo: { id: string; name: string; role: string; model: string }
  webhookUrl?: string
  webhookEnabled?: boolean
}

// 브리핑 실행 함수 (스케줄러와 즉시실행 공용)
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

  // CEO 종합
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

  // 웹훅 전송 (허용 도메인만 — SSRF 방지)
  if (body.webhookEnabled && body.webhookUrl) {
    const validation = validateWebhookUrl(body.webhookUrl)
    if (validation.ok) {
      const webhookController = new AbortController()
      const webhookTimer = setTimeout(() => webhookController.abort(), 10_000)
      fetch(validation.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🌅 *AI 오피스 일일 브리핑*\n${summary.slice(0, 500)}` }),
        signal: webhookController.signal,
      }).catch((err) => console.error('[briefing] 웹훅 실패:', err))
        .finally(() => clearTimeout(webhookTimer))
    } else {
      const failMsg = 'message' in validation ? (validation as { message: string }).message : '알 수 없는 검증 오류'
      console.warn('[briefing] 웹훅 URL 검증 실패:', failMsg)
    }
  }

  // SSE 이벤트 발송
  emitSSE('briefing', { result: full, triggeredAt: new Date().toISOString() })

  return full
}

// 마지막 브리핑 요청 저장 (스케줄러 재실행 시 사용)
let lastBriefingBody: BriefingRequest | null = null

registerBriefingCallback(async () => {
  if (!lastBriefingBody) return
  await runBriefing(lastBriefingBody)
})

app.post('/api/briefing/run', async (req, res) => {
  const body = req.body as BriefingRequest
  lastBriefingBody = body
  try {
    const result = await runBriefing(body)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '브리핑 실패' })
  }
})

app.post('/api/scheduler', (req, res) => {
  const { enabled, hour, minute } = req.body as { enabled: boolean; hour: number; minute: number }
  applyServerScheduler({ enabled, hour, minute })
  res.json({ ok: true })
})

// ─── Tool Use ─────────────────────────────────────────────────────────────────
interface LLMToolsRequest {
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}

app.post('/api/llm-tools', async (req, res) => {
  const { model, system, messages, maxTokens: rawToolTokens = 2048 }: LLMToolsRequest = req.body
  const maxTokens = Math.min(rawToolTokens, MAX_TOKENS_LIMIT)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY 미설정' }); return }
  if (!model.startsWith('claude-')) {
    res.status(400).json({ error: 'Tool Use는 Claude 모델에서만 지원됩니다.' }); return
  }
  try {
    const result = await runLLMWithTools({ apiKey, model, system, messages, maxTokens })
    res.json(result)
  } catch (err) {
    console.error('[Tool Use Error]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Tool Use 실패' })
  }
})

app.get('/api/files', (_req, res) => {
  res.json({ files: listOutputFiles() })
})

// ─── 데이터 백업 ──────────────────────────────────────────────────────────────
const BACKUP_DIR = join(process.cwd(), 'agent-output', 'backups')
const MAX_BACKUP_FILES = 30  // 최대 30개 보관 (오래된 것부터 삭제)

function ensureBackupDir() {
  mkdirSync(BACKUP_DIR, { recursive: true })
}

function pruneOldBackups() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()  // 이름이 날짜 기반이므로 오름차순 = 오래된 순
    if (files.length > MAX_BACKUP_FILES) {
      const toDelete = files.slice(0, files.length - MAX_BACKUP_FILES)
      for (const f of toDelete) {
        try { unlinkSync(join(BACKUP_DIR, f)) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

app.post('/api/backup', express.text({ type: 'application/json', limit: '20mb' }), (req, res) => {
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

app.get('/api/backup/list', (_req, res) => {
  try {
    ensureBackupDir()
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse()  // 최신 순
      .slice(0, 10)  // 최근 10개만 반환
    res.json({ files })
  } catch {
    res.json({ files: [] })
  }
})

app.get('/api/files/:filename', (req, res) => {
  const content = readOutputFile(req.params.filename)
  if (content === null) { res.status(404).json({ error: '파일 없음' }); return }
  res.type('text/plain; charset=utf-8').send(content)
})

app.delete('/api/files/:filename', (req, res) => {
  const ok = deleteOutputFile(req.params.filename)
  if (!ok) { res.status(404).json({ error: '파일 없음' }); return }
  res.json({ ok: true })
})

// ─── SSE 실시간 이벤트 ────────────────────────────────────────────────────────
// EventSource API는 커스텀 헤더를 지원하지 않으므로 query param 인증을 사용한다.
// 인증 미들웨어에서 이미 검증하므로 여기서는 연결 처리만 수행한다.
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // 연결 확인 메시지
  res.write('event: connected\ndata: {}\n\n')

  addSSEClient(res)
  req.on('close', () => removeSSEClient(res))

  // heartbeat (30초마다)
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch { clearInterval(hb) }
  }, 30_000)
  req.on('close', () => clearInterval(hb))
})

// ─── 상태 동기화 ─────────────────────────────────────────────────────────────
// 인메모리 캐시: 프로세스 재시작 전까지 유지 (Render 재배포 후에는 첫 접속 기기가 재업로드)
let stateMemoryCache: string | null = null
const STATE_FILE = join(process.cwd(), 'server-state.json')

app.get('/api/state', (_req, res) => {
  try {
    // 인메모리 캐시 우선 반환
    if (stateMemoryCache) { res.json({ raw: stateMemoryCache }); return }
    // 파일 폴백
    if (!existsSync(STATE_FILE)) { res.json({ raw: null }); return }
    const raw = readFileSync(STATE_FILE, 'utf-8')
    stateMemoryCache = raw
    res.json({ raw })
  } catch {
    res.json({ raw: null })
  }
})

app.post('/api/state', express.text({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const raw = typeof req.body === 'string' ? req.body : ''
    if (!raw) { res.status(400).json({ error: 'body required' }); return }
    stateMemoryCache = raw   // 인메모리 항상 업데이트
    try { writeFileSync(STATE_FILE, raw, 'utf-8') } catch { /* 파일 실패 시 무시 */ }
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: '상태 저장 실패' })
  }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// 진단용: 서버 환경 확인 (인증 없이 접근 가능)
app.get('/api/debug-env', (_req, res) => {
  const candidates = [
    process.env.ELECTRON_DIST_PATH,
    join(_dirname, '..', 'dist'),
    join(_dirname, 'dist'),
  ].filter(Boolean) as string[]
  res.json({
    ELECTRON_SERVE: process.env.ELECTRON_SERVE,
    ELECTRON_DIST_PATH: process.env.ELECTRON_DIST_PATH,
    __dirname: _dirname,
    candidates,
    exists: candidates.map(p => ({ path: p, ok: existsSync(join(p, 'index.html')) })),
  })
})

// 프론트엔드 정적 파일 서빙 — ELECTRON_DIST_PATH 또는 상대 경로 후보에서 dist를 탐색
{
  const candidates = [
    process.env.ELECTRON_DIST_PATH,
    join(_dirname, '..', 'dist'),
    join(_dirname, 'dist'),
  ].filter(Boolean) as string[]

  const distPath = candidates.find(p => existsSync(join(p, 'index.html')))

  if (distPath) {
    const indexHtml = join(distPath, 'index.html')
    console.log(`[server] static: ${distPath}`)
    app.use(express.static(distPath))
    // Express 5 호환 catch-all: app.get('*') 대신 app.use() 사용
    app.use((_req, res) => {
      res.sendFile(indexHtml)
    })
  } else {
    console.warn(`[server] dist not found — tried: ${candidates.join(', ')}`)
  }
}

const PORT = Number(process.env.PORT) || 3001
app.listen(PORT, () => {
  console.log(`[AI 오피스 서버] http://localhost:${PORT}`)
})

process.on('SIGTERM', stopServerScheduler)
process.on('SIGINT', stopServerScheduler)
