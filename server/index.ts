import 'dotenv/config'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { join as pathJoin, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { timingSafeEqual } from 'node:crypto'
import { checkRateLimit } from './rateLimiter'
import { createSession, validateSession } from './session'
import { stopServerScheduler } from './scheduler'
import { proxyWebhookRequest } from './webhookProxy'
import { getServerBudgetStatus } from './serverBudget'
import { logError } from './errorLogger'
import llmRoutes from './routes/llm'
import providerRoutes from './routes/providers'
import notionRoutes from './routes/notion'
import briefingRoutes from './routes/briefing'
import fileRoutes from './routes/files'
import stateRoutes from './routes/state'
import eventsRoutes from './routes/events'
import updatesRoutes from './routes/updates'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url))

// ─── 환경 변수 시작 시 검증 ───────────────────────────────────────────────────
// 최소 1개의 LLM API 키가 없으면 서버가 올라가도 모든 AI 호출이 실패함
function validateEnv(): void {
  const hasAnyKey = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY
  )
  if (!hasAnyKey) {
    console.warn(
      '[경고] ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 중 하나도 설정되지 않았습니다.\n' +
      '        AI 기능을 사용하려면 .env 파일에 최소 1개의 API 키를 설정하세요.',
    )
  }
}
validateEnv()

const APP_EMAIL = process.env.APP_EMAIL
const APP_PASSWORD = process.env.APP_PASSWORD

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null

const app = express()

// ─── 보안 헤더 ────────────────────────────────────────────────────────────────
// helmet을 설치하지 않고도 핵심 헤더를 직접 설정
app.use((_req: Request, res: Response, next: NextFunction) => {
  // MIME 스니핑 방지: 브라우저가 Content-Type을 무시하고 파일 타입을 추측하는 것을 차단
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // 클릭재킹 방지: 이 서버의 응답이 다른 사이트의 iframe에 삽입되지 못하게 함
  res.setHeader('X-Frame-Options', 'DENY')
  // 리퍼러 노출 최소화
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // 불필요한 브라우저 기능 비활성화
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // XSS/인젝션 방지 — API 서버이므로 script/style 허용 대상 최소화
  // connect-src: self + 모든 HTTPS 허용
  // (Electron 빌드 시 VITE_API_BASE 등이 번들에 포함되나 서버 env에 없어 직접 열거 불가)
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // Vite dev HMR 필요
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  next()
})

app.use(cors({
  origin: ALLOWED_ORIGINS
    ? (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true)
        else cb(new Error(`CORS: ${origin} not allowed`))
      }
    : true,
}))

app.use(express.json({ limit: '4mb' }))

// ─── 세션 ─────────────────────────────────────────────────────────────────────
// 로그인 필요 여부 확인 — 401 없이 200으로 응답
app.get('/api/session/required', (_req: Request, res: Response) => {
  res.json({ required: !!(APP_EMAIL || APP_PASSWORD) })
})

app.post('/api/session/start', (req: Request, res: Response) => {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket.remoteAddress ?? 'unknown'
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    res.status(429).json({ ok: false, error: '너무 많은 로그인 시도입니다. 15분 후 다시 시도하세요.' }); return
  }
  if (APP_EMAIL || APP_PASSWORD) {
    const { email, password } = req.body as { email?: string; password?: string }
    const emailOk = !APP_EMAIL || (email?.trim().toLowerCase() === APP_EMAIL.trim().toLowerCase())
    const passwordOk = !APP_PASSWORD || (
      typeof password === 'string' &&
      password.length === APP_PASSWORD.length &&
      timingSafeEqual(Buffer.from(password), Buffer.from(APP_PASSWORD))
    )
    if (!emailOk || !passwordOk) {
      res.status(401).json({ ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }); return
    }
  }
  res.json({ ok: true, token: createSession() })
})

// ─── 인증 미들웨어 ────────────────────────────────────────────────────────────
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/session/start' || req.method === 'OPTIONS') { next(); return }
  if (req.path === '/health') { next(); return }
  if (req.path === '/state' && APP_PASSWORD) {
    const syncPw = req.headers['x-sync-password'] as string | undefined
    if (syncPw === APP_PASSWORD) { next(); return }
  }
  const token = (req.headers['x-session-token'] as string | undefined)
    ?? (req.query.token as string | undefined)
  if (!validateSession(token)) {
    res.status(401).json({ error: '세션이 만료되었거나 인증되지 않았습니다. 새로고침 후 다시 시도하세요.' }); return
  }
  next()
})

app.get('/api/session/validate', (_req: Request, res: Response) => res.json({ ok: true }))

// ─── 라우트 마운트 ────────────────────────────────────────────────────────────
app.use('/api', llmRoutes)
app.use('/api', providerRoutes)
app.use('/api', notionRoutes)
app.use('/api', briefingRoutes)
app.use('/api', express.text({ type: ['application/json', '*/*'], limit: '50mb' }), fileRoutes)
app.use('/api', express.text({ type: '*/*', limit: '50mb' }), stateRoutes)
app.use('/api', eventsRoutes)
// 자동 업데이트 프록시 — 인증 불필요 (앱이 토큰 없이 접근)
app.use('/api/updates', updatesRoutes)

// ─── 웹훅 프록시 ─────────────────────────────────────────────────────────────
app.post('/api/webhook-proxy', async (req: Request, res: Response) => {
  const { url, payload } = req.body as { url: string; payload: object }
  if (!url || typeof url !== 'string' || !payload || typeof payload !== 'object') {
    res.status(400).json({ ok: false, error: 'URL과 payload 객체가 필요합니다.' }); return
  }
  const result = await proxyWebhookRequest(url, payload)
  res.status(result.status).json(result.ok
    ? { ok: true, status: result.upstreamStatus ?? 200, message: result.message }
    : { ok: false, error: result.message })
})

// ─── Health check (강화) ──────────────────────────────────────────────────────
// 단순 'ok' 대신 실제 서버 상태를 반환해 로드밸런서/모니터링이 활용할 수 있게 함
app.get('/api/health', (_req: Request, res: Response) => {
  const budget = getServerBudgetStatus()
  const budgetExhausted = budget.limit > 0 && budget.used >= budget.limit

  res.status(budgetExhausted ? 503 : 200).json({
    status: budgetExhausted ? 'degraded' : 'ok',
    uptime: Math.floor(process.uptime()),
    providers: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
    },
    budget: {
      used: budget.used,
      limit: budget.limit,
      date: budget.date,
    },
  })
})

// ─── 진단 (개발 환경 전용) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug-env', (_req: Request, res: Response) => {
    const candidates = [
      process.env.ELECTRON_DIST_PATH,
      pathJoin(_dirname, '..', 'dist'),
      pathJoin(_dirname, 'dist'),
    ].filter(Boolean) as string[]
    res.json({
      ELECTRON_SERVE: process.env.ELECTRON_SERVE,
      ELECTRON_DIST_PATH: process.env.ELECTRON_DIST_PATH,
      __dirname: _dirname,
      candidates,
      exists: candidates.map(p => ({ path: p, ok: existsSync(pathJoin(p, 'index.html')) })),
    })
  })
}

// ─── 프론트엔드 정적 서빙 ────────────────────────────────────────────────────
{
  const candidates = [
    process.env.ELECTRON_DIST_PATH,
    pathJoin(_dirname, '..', 'dist'),
    pathJoin(_dirname, 'dist'),
  ].filter(Boolean) as string[]

  const distPath = candidates.find(p => existsSync(pathJoin(p, 'index.html')))

  if (distPath) {
    const indexHtml = pathJoin(distPath, 'index.html')
    console.log(`[server] static: ${distPath}`)
    app.use(express.static(distPath))
    app.use((_req: Request, res: Response) => res.sendFile(indexHtml))
  } else {
    console.warn(`[server] dist not found — tried: ${candidates.join(', ')}`)
  }
}

// ─── 전역 에러 핸들러 ─────────────────────────────────────────────────────────
// Express 4에서 async route가 throw하면 여기서 잡힘 (Express 5는 자동 처리)
// 이 핸들러가 없으면 UnhandledPromiseRejection으로 서버 프로세스가 종료될 수 있음
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const context = `${req.method} ${req.path}`
  console.error('[서버 오류]', context, err.message, err.stack)
  logError(context, err.message, err.stack)
  if (!res.headersSent) {
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' })
  }
})

// ─── 서버 시작 및 Graceful Shutdown ─────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001
const server = app.listen(PORT, () => console.log(`[AI 오피스 서버] http://localhost:${PORT}`))

// 진행 중인 HTTP 요청을 모두 완료한 뒤 종료 — 갑작스러운 연결 끊김 방지
function gracefulShutdown(signal: string): void {
  console.log(`[서버] ${signal} 수신 — 종료 중...`)
  stopServerScheduler()
  server.close((err) => {
    if (err) {
      console.error('[서버] 종료 중 오류:', err)
      process.exit(1)
    }
    console.log('[서버] 정상 종료')
    process.exit(0)
  })
  // 10초 안에 연결이 닫히지 않으면 강제 종료 (무한 대기 방지)
  setTimeout(() => {
    console.warn('[서버] 타임아웃 — 강제 종료')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  logError('uncaughtException', err.message, err.stack)
  console.error('[서버] 미처리 예외:', err)
})

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason))
  logError('unhandledRejection', err.message, err.stack)
  console.error('[서버] 미처리 Promise 거부:', reason)
})
