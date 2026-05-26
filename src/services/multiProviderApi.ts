import { useAgentStore } from '@/store/agentStore'
import type { Agent } from '@/types'
import type { LLMApiMessage, LLMApiRequest, LLMApiResponse } from '@/types/llmApi'
import { MODEL_PRICING } from '@/config/models'
import { apiHeaders } from '@/utils/apiHeaders'
import { notifySessionExpired } from '@/services/sessionService'
import { recordError } from '@/services/errorLog'

type ModelId = Agent['model']

// 공유 타입 re-export (기존 코드 호환성 유지)
export type LLMMessage = LLMApiMessage
export interface LLMRequest extends LLMApiRequest {
  model: ModelId  // 클라이언트에서는 ModelId union으로 더 좁게 타입 지정
}

type LLMResponse = LLMApiResponse

export interface LLMStreamResult {
  usage: { input_tokens: number; output_tokens: number }
  stopReason?: string | null
}

function providerOf(model: ModelId): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-')) return 'openai'
  return 'gemini'
}

const LLM_TIMEOUT_MS = 120_000

const HTTP_ERROR_MSGS: Record<number, string> = {
  429: 'API 요청 한도 초과 — 잠시 후 다시 시도하세요',
  500: 'AI 서버 내부 오류 — 잠시 후 다시 시도하세요',
  502: 'AI 서버 일시 불안정 — 잠시 후 다시 시도하세요',
  503: 'AI 서비스 점검 중 — 잠시 후 다시 시도하세요',
  413: '요청 내용이 너무 큽니다 — 메시지를 줄여 다시 시도하세요',
}

// ─── 태스크별 토큰 누적 추적 ─────────────────────────────────────────────────
// taskId를 Map 키로 관리 — 전역 activeTaskId 없이 동시 태스크 안전하게 처리
const _taskTokens = new Map<string, { inputTokens: number; outputTokens: number; estimatedCostUsd: number }>()

export function beginTaskTokenTracking(taskId: string): void {
  _taskTokens.set(taskId, { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 })
}

export function finishTaskTokenTracking(taskId: string): { inputTokens: number; outputTokens: number; estimatedCostUsd: number } | null {
  const usage = _taskTokens.get(taskId) ?? null
  _taskTokens.delete(taskId)
  return usage
}

function _accumulateTaskTokens(taskId: string | undefined, model: string, inputTokens: number, outputTokens: number): void {
  if (!taskId) return
  const cur = _taskTokens.get(taskId)
  if (cur) {
    cur.inputTokens += inputTokens
    cur.outputTokens += outputTokens
    cur.estimatedCostUsd += estimateCostUsd(model, inputTokens, outputTokens)
  }
}

// MODEL_PRICING은 src/config/models.ts에서 import — 이 파일에서 중복 정의 없음

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model] ?? { in: 3, out: 15 }
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000
}

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

// ─── 공통 fetch/timeout/에러 처리 헬퍼 ──────────────────────────────────────
async function _fetchLLM(endpoint: string, req: LLMRequest): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(endpoint, {
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
    recordError({ source: 'LLM', model: req.model, message: msg })
    throw new Error(msg, { cause: err })
  }
  clearTimeout(timer)

  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired()
      throw new Error('세션이 만료되었습니다. 다시 로그인하세요.')
    }
    const httpFallback = HTTP_ERROR_MSGS[response.status] ?? `서버 오류 (HTTP ${response.status})`
    const err = await response.json().catch(() => ({ error: httpFallback })) as { error: string }
    const msg = err.error ?? httpFallback
    useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, msg)
    recordError({ source: 'LLM', model: req.model, message: msg, status: response.status })
    throw new Error(msg, { cause: err })
  }

  return response
}

export async function callLLM(req: LLMRequest, taskId?: string): Promise<string> {
  checkBudgetBeforeCall()

  const response = await _fetchLLM('/api/llm', req)

  const data = await response.json() as LLMResponse
  const prov = providerOf(req.model)
  const { input_tokens, output_tokens } = data.usage
  const total = input_tokens + output_tokens

  const store = useAgentStore.getState()
  store.checkAndConsumeTokenBudget(total)
  store.recordProviderUsage(prov, { inputTokens: input_tokens, outputTokens: output_tokens, totalTokens: total, model: req.model })
  _accumulateTaskTokens(taskId, req.model, input_tokens, output_tokens)
  store.addExecutionLog('llm', req.model, `in ${input_tokens.toLocaleString()} / out ${output_tokens.toLocaleString()} tokens`)

  return data.text
}

// ─── 스트리밍 LLM 호출 ───────────────────────────────────────────────────────
export async function callLLMStream(
  req: LLMRequest,
  onDelta: (delta: string) => void,
  taskId?: string,
): Promise<LLMStreamResult> {
  checkBudgetBeforeCall()

  const response = await _fetchLLM('/api/llm/stream', req)

  if (!response.body) {
    const msg = 'LLM 스트리밍 실패'
    useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, msg)
    throw new Error(msg)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let inputTokens = 0
  let outputTokens = 0
  let stopReason: string | null = null

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
            const parsed = JSON.parse(raw) as {
              text?: string
              usage?: { input_tokens: number; output_tokens: number }
              stopReason?: string | null
              error?: string
            }
            if (currentEvent === 'delta' && parsed.text) {
              onDelta(parsed.text)
            } else if (currentEvent === 'done' && parsed.usage) {
              inputTokens = parsed.usage.input_tokens
              outputTokens = parsed.usage.output_tokens
              stopReason = parsed.stopReason ?? null
            } else if (currentEvent === 'error' && parsed.error) {
              useAgentStore.getState().addToast('error', `LLM 오류 (${req.model})`, parsed.error)
              recordError({ source: 'LLM 스트리밍', model: req.model, message: parsed.error })
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
  store.recordProviderUsage(providerOf(req.model), { inputTokens, outputTokens, totalTokens: total, model: req.model })
  _accumulateTaskTokens(taskId, req.model, inputTokens, outputTokens)
  store.addExecutionLog('llm', req.model, `stream in ${inputTokens.toLocaleString()} / out ${outputTokens.toLocaleString()} tokens`)

  return {
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    stopReason,
  }
}
