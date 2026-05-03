import { useAgentStore } from '@/store/agentStore'
import { Agent } from '@/types'
import { apiHeaders } from '@/utils/apiHeaders'
import { notifySessionExpired } from '@/services/sessionService'

type ModelId = Agent['model']

export type LLMMessage = { role: 'user' | 'assistant'; content: string }

export interface LLMRequest {
  model: ModelId
  system: string
  messages: LLMMessage[]
  maxTokens?: number
}

interface LLMResponse {
  text: string
  usage: { input_tokens: number; output_tokens: number }
}

function providerOf(model: ModelId): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-')) return 'openai'
  return 'gemini'
}

const LLM_TIMEOUT_MS = 120_000

// ─── 호출 전 예산 사전 검사 ───────────────────────────────────────────────────
function checkBudgetBeforeCall(): void {
  const store = useAgentStore.getState()
  const budget = store.dailyTokenBudget
  if (!budget.enabled || budget.limitTokens === 0) return

  // 날짜가 바뀌면 사용량 리셋
  const today = new Date().toISOString().slice(0, 10)
  if (budget.resetDate !== today) {
    store.setDailyTokenBudget({ usedToday: 0, resetDate: today })
    return
  }

  const usedPercent = budget.usedToday / budget.limitTokens

  // 이미 100% 초과 → 차단
  if (usedPercent >= 1) {
    const msg = `일별 토큰 예산 ${budget.limitTokens.toLocaleString()}을 이미 소진했습니다. 설정에서 한도를 늘리거나 내일 다시 시도하세요.`
    store.addToast('error', '토큰 예산 소진', msg, 10000)
    throw new Error(msg)
  }

  // 80~100% 구간 → 경고만 (차단하지 않음)
  if (usedPercent >= 0.8) {
    const remaining = budget.limitTokens - budget.usedToday
    store.addToast(
      'warn',
      '토큰 예산 경고',
      `오늘 예산의 ${Math.round(usedPercent * 100)}% 사용 중 — 잔여 ${remaining.toLocaleString()} 토큰`,
      6000,
    )
  }
}

function buildSystemWithLanguage(system: string): string {
  const lang = useAgentStore.getState().responseLanguage
  if (lang === 'ko') return `${system}\n\n[언어 지시] 반드시 한국어로만 응답하십시오.`
  if (lang === 'en') return `${system}\n\n[Language instruction] You MUST respond in English only.`
  return system // 'auto' — 별도 지시 없음
}

export async function callLLM(req: LLMRequest): Promise<string> {
  // 예산 사전 검사 (이미 소진 시 차단, 80% 이상 시 경고)
  checkBudgetBeforeCall()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('/api/llm', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: req.model,
        system: buildSystemWithLanguage(req.system),
        messages: req.messages,
        maxTokens: req.maxTokens,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error && err.name === 'AbortError'
      ? `LLM 응답 시간 초과 (${LLM_TIMEOUT_MS / 1000}초)`
      : 'LLM 서버 연결 실패'
    useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, msg)
    throw new Error(msg)
  }
  clearTimeout(timer)

  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired()
      throw new Error('세션이 만료되었습니다. 다시 로그인하세요.')
    }
    const err = await response.json().catch(() => ({ error: 'LLM 호출 실패' })) as { error: string }
    const msg = err.error ?? 'LLM 호출 실패'
    useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, msg)
    throw new Error(msg)
  }

  const data = await response.json() as LLMResponse
  const prov = providerOf(req.model)
  const total = data.usage.input_tokens + data.usage.output_tokens

  // 일별 토큰 사용량 기록 (사후 소비 기록)
  const store = useAgentStore.getState()
  store.checkAndConsumeTokenBudget(total)

  store.recordProviderUsage(prov, {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    totalTokens: total,
    model: req.model,
  })

  useAgentStore.getState().addExecutionLog(
    'llm',
    req.model,
    `in ${data.usage.input_tokens.toLocaleString()} / out ${data.usage.output_tokens.toLocaleString()} tokens`,
  )

  return data.text
}

// ─── 스트리밍 LLM 호출 ───────────────────────────────────────────────────────
export async function callLLMStream(
  req: LLMRequest,
  onDelta: (delta: string) => void,
): Promise<void> {
  checkBudgetBeforeCall()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('/api/llm/stream', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model: req.model, system: buildSystemWithLanguage(req.system), messages: req.messages, maxTokens: req.maxTokens }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = err instanceof Error && err.name === 'AbortError'
      ? `LLM 응답 시간 초과 (${LLM_TIMEOUT_MS / 1000}초)`
      : 'LLM 서버 연결 실패'
    useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, msg)
    throw new Error(msg)
  }
  clearTimeout(timer)

  if (!response.ok || !response.body) {
    const err = await response.json().catch(() => ({ error: 'LLM 스트리밍 실패' })) as { error: string }
    const msg = err.error ?? 'LLM 스트리밍 실패'
    useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, msg)
    throw new Error(msg)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let inputTokens = 0
  let outputTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    let currentEvent = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim()
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { text?: string; usage?: { input_tokens: number; output_tokens: number }; error?: string }
            if (currentEvent === 'delta' && parsed.text) {
              onDelta(parsed.text)
            } else if (currentEvent === 'done' && parsed.usage) {
              inputTokens = parsed.usage.input_tokens
              outputTokens = parsed.usage.output_tokens
            } else if (currentEvent === 'error' && parsed.error) {
              useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, parsed.error)
              throw new Error(parsed.error)
            }
          } catch (e) {
            // error 이벤트에서 throw된 건 다시 전파, JSON 파싱 실패는 해당 청크 스킵
            if (e instanceof Error && currentEvent === 'error') throw e
          }
        }
        currentEvent = ''
      }
    }
  }

  const total = inputTokens + outputTokens
  const store = useAgentStore.getState()
  store.checkAndConsumeTokenBudget(total)
  store.recordProviderUsage(providerOf(req.model), {
    inputTokens, outputTokens, totalTokens: total, model: req.model,
  })
  store.addExecutionLog('llm', req.model, `stream in ${inputTokens.toLocaleString()} / out ${outputTokens.toLocaleString()} tokens`)
}

// 모델 뱃지 표시용
export function modelLabel(model: ModelId): string {
  if (model.startsWith('claude-opus'))   return '🟣 Claude Opus'
  if (model.startsWith('claude-sonnet')) return '🟣 Claude Sonnet'
  if (model.startsWith('claude-haiku'))  return '🟣 Claude Haiku'
  if (model === 'gpt-4o')               return '🟢 GPT-4o'
  if (model === 'gpt-4o-mini')          return '🟢 GPT-4o mini'
  if (model === 'gemini-2.5-pro')        return '🔵 Gemini 2.5 Pro'
  if (model === 'gemini-2.5-flash')     return '🔵 Gemini 2.5 Flash'
  return model
}
