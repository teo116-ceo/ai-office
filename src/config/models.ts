// 단일 모델 레지스트리 — 가격·표시명·허용 여부를 여기서만 관리
// 새 모델 추가 시 이 파일만 수정하면 됨 (types/index.ts, multiProviderApi.ts 연동)
// 마지막 가격 확인: 2026-05-11

export const MODEL_REGISTRY = [
  { id: 'claude-opus-4-6',          provider: 'anthropic', label: '🟣 Claude Opus 4',     priceIn: 15,   priceOut: 75   },
  { id: 'claude-sonnet-4-6',         provider: 'anthropic', label: '🟣 Claude Sonnet 4',   priceIn: 3,    priceOut: 15   },
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic', label: '🟣 Claude Haiku 4.5',  priceIn: 0.8,  priceOut: 4    },
  { id: 'gpt-4o',                    provider: 'openai',    label: '🟢 GPT-4o',             priceIn: 5,    priceOut: 15   },
  { id: 'gpt-4o-mini',               provider: 'openai',    label: '🟢 GPT-4o mini',        priceIn: 0.15, priceOut: 0.6  },
  { id: 'gemini-2.5-pro',            provider: 'gemini',    label: '🔵 Gemini 2.5 Pro',     priceIn: 1.25, priceOut: 10   },
  { id: 'gemini-2.5-flash',          provider: 'gemini',    label: '🔵 Gemini 2.5 Flash',   priceIn: 0.15, priceOut: 0.6  },
] as const

// 타입 추론: MODEL_REGISTRY에서 자동 생성
export type ModelId = typeof MODEL_REGISTRY[number]['id']

// 서버 허용 목록 (server/llmUtils.ts의 ALLOWED_MODELS와 동기)
export const ALLOWED_MODEL_IDS: ReadonlySet<string> = new Set(MODEL_REGISTRY.map((m) => m.id))

// 모델 ID → 가격 맵 ($/1M tokens)
export const MODEL_PRICING: Record<string, { in: number; out: number }> = Object.fromEntries(
  MODEL_REGISTRY.map((m) => [m.id, { in: m.priceIn, out: m.priceOut }])
)

// 모델 ID → 표시명 맵
export const MODEL_LABELS: Record<string, string> = Object.fromEntries(
  MODEL_REGISTRY.map((m) => [m.id, m.label])
)
