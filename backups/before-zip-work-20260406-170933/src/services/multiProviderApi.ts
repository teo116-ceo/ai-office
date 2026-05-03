import { useAgentStore } from '@/store/agentStore'
import { Agent } from '@/types'

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

export async function callLLM(req: LLMRequest): Promise<string> {
  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model,
      system: req.system,
      messages: req.messages,
      maxTokens: req.maxTokens,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'LLM 호출 실패' })) as { error: string }
    throw new Error(err.error ?? 'LLM 호출 실패')
  }

  const data = await response.json() as LLMResponse
  const prov = providerOf(req.model)

  useAgentStore.getState().recordProviderUsage(prov, {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    model: req.model,
  })

  return data.text
}

// 모델 뱃지 표시용
export function modelLabel(model: ModelId): string {
  if (model.startsWith('claude-opus'))   return '🟣 Claude Opus'
  if (model.startsWith('claude-sonnet')) return '🟣 Claude Sonnet'
  if (model.startsWith('claude-haiku'))  return '🟣 Claude Haiku'
  if (model === 'gpt-4o')               return '🟢 GPT-4o'
  if (model === 'gpt-4o-mini')          return '🟢 GPT-4o mini'
  if (model === 'gemini-1.5-pro')       return '🔵 Gemini 1.5 Pro'
  if (model === 'gemini-2.0-flash')     return '🔵 Gemini 2.0 Flash'
  return model
}
