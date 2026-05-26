import { checkRateLimit } from './rateLimiter'
import type { Request } from 'express'
import type { LLMApiMessage, LLMApiRequest } from '../src/types/llmApi'
import { ALLOWED_MODEL_IDS } from '../src/config/models'

// 서버 내부에서는 공유 타입을 그대로 사용
export type LLMMessage = LLMApiMessage
export type LLMRequest = LLMApiRequest

// src/config/models.ts의 MODEL_REGISTRY에서 파생 — 직접 편집 대신 models.ts를 수정
export const ALLOWED_MODELS: ReadonlySet<string> = ALLOWED_MODEL_IDS

const MAX_MESSAGES_PER_REQUEST = 50
const MAX_CONTENT_LENGTH_PER_MESSAGE = 1_000_000
const MAX_SYSTEM_LENGTH = 100_000
const LLM_RATE_LIMIT_MAX = 30
const LLM_RATE_LIMIT_WINDOW_MS = 60 * 1000
const MAX_TOKENS_LIMIT = 100000

export function getProvider(model: string): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-')) return 'openai'
  return 'gemini'
}

export function normalizeMaxTokens(model: string, requested: number): number {
  const safeRequested = Number.isFinite(requested) && requested > 0 ? requested : 8000
  return Math.min(safeRequested, MAX_TOKENS_LIMIT)
}

export function validateLLMRequest(
  model: string,
  system: string | undefined,
  messages: LLMMessage[],
  sessionToken: string | undefined,
  req: Request,
): string | null {
  if (!ALLOWED_MODELS.has(model)) return `허용되지 않은 모델입니다: ${model}`
  if (system && system.length > MAX_SYSTEM_LENGTH)
    return `system 프롬프트가 너무 깁니다 (최대 ${MAX_SYSTEM_LENGTH.toLocaleString()}자)`
  if (messages.length > MAX_MESSAGES_PER_REQUEST)
    return `메시지가 너무 많습니다 (최대 ${MAX_MESSAGES_PER_REQUEST}개)`

  for (const msg of messages) {
    if (typeof msg.content !== 'string') return '메시지 content는 문자열이어야 합니다.'
    if (!['user', 'assistant'].includes(msg.role)) return `허용되지 않은 role: ${msg.role}`
    if (msg.content.length > MAX_CONTENT_LENGTH_PER_MESSAGE)
      return `메시지 내용이 너무 깁니다 (최대 ${MAX_CONTENT_LENGTH_PER_MESSAGE.toLocaleString()}자)`
  }

  const rateLimitKey = sessionToken
    ? `llm:session:${sessionToken.slice(0, 8)}`
    : `llm:ip:${req.socket.remoteAddress}`
  if (!checkRateLimit(rateLimitKey, LLM_RATE_LIMIT_MAX, LLM_RATE_LIMIT_WINDOW_MS))
    return `LLM 호출이 너무 빈번합니다. 잠시 후 다시 시도하세요. (분당 ${LLM_RATE_LIMIT_MAX}회 제한)`

  return null
}
