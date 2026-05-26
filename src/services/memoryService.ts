import { useAgentStore } from '@/store/agentStore'
import type { AgentMemory, DepartmentId, Task } from '@/types'
import { AGENT_GROUND_RULES } from './taskExecutionPrompts'
import { callLLM } from './multiProviderApi'
import { apiHeaders } from '@/utils/apiHeaders'

const MAX_MEMORY_CONTEXT_ITEMS = 6
// 부서 미일치 메모리 중 코사인 계산 대상 최대 수 (중요도 상위 순)
const MAX_NON_DEPT_CANDIDATES = 50
const MAX_MEMORY_SUMMARY_CHARS = 500
const EMBEDDING_API = '/api/embeddings'

// 메모리 중요도 계산 가중치
const IMPORTANCE_DEPT_MATCH = 0.08   // 부서 일치 가산
const IMPORTANCE_RECENCY_HALF_LIFE_DAYS = 30  // 30일마다 점수 절반으로 감소
const IMPORTANCE_ACCESS_BOOST = 0.02  // 참조 1회당 가산 (최대 10회까지)

// ─── 코사인 유사도 ────────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ─── 서버에서 임베딩 생성 ─────────────────────────────────────────────────────
async function fetchEmbeddings(texts: string[]): Promise<number[][] | null> {
  try {
    const res = await fetch(EMBEDDING_API, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ texts }),
    })
    if (!res.ok) return null
    const data = await res.json() as { embeddings: number[][] }
    return data.embeddings ?? null
  } catch {
    return null
  }
}

// ─── 경과 일수 계산 ───────────────────────────────────────────────────────────
function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
}

// ─── 최초 중요도 계산 (저장 시점) ─────────────────────────────────────────────
function computeInitialImportance(keyPoints: number, tags: number): number {
  // keyPoints 수와 tags 수를 기반으로 풍부도 점수 계산 (0.3~1.0)
  const richness = Math.min(1.0, 0.3 + (keyPoints / 7) * 0.4 + (tags / 8) * 0.3)
  return parseFloat(richness.toFixed(3))
}

// ─── 검색 시 실시간 점수 계산 ─────────────────────────────────────────────────
function computeRuntimeScore(
  baseScore: number,
  mem: AgentMemory,
  departments: DepartmentId[],
): number {
  let score = baseScore

  // 부서 일치 가산
  for (const dept of departments) {
    if (mem.departments.includes(dept)) score += IMPORTANCE_DEPT_MATCH
  }

  // 시간 감쇠 (오래된 메모리는 점수 감소)
  const ageDays = daysSince(mem.createdAt)
  const decayFactor = Math.pow(0.5, ageDays / IMPORTANCE_RECENCY_HALF_LIFE_DAYS)
  score *= (0.6 + 0.4 * decayFactor)  // 최소 60%는 유지

  // 자주 참조된 메모리 가산
  const accessBoost = Math.min(10, mem.accessCount ?? 0) * IMPORTANCE_ACCESS_BOOST
  score += accessBoost

  // 중요도 기반 가산 (저장 시 측정된 풍부도)
  score += (mem.importance ?? 0.5) * 0.05

  return score
}

// ─── 메모리 추출 (태스크 완료 시 호출) ───────────────────────────────────────
export async function extractAndSaveMemory(task: Task): Promise<void> {
  const store = useAgentStore.getState()
  if (!store.memoryEnabled || !task.result) return

  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')
  if (!ceoAgent) return

  // 중복 저장 방지 (같은 taskId로 이미 저장된 메모리가 있으면 스킵)
  if (store.memories.some((m) => m.taskId === task.id)) return

  try {
    const resultSnippet = task.result.slice(0, 3000)
    const deptNames = task.departmentResults
      ? task.departmentResults.map((r) => r.agentName).join(', ')
      : task.assignedTo.join(', ')

    const raw = await callLLM({
      model: ceoAgent.model,
      maxTokens: 600,
      system: [
        '당신은 업무 결과를 구조화된 메모리로 저장하는 비서입니다.',
        AGENT_GROUND_RULES,
        '다음 형식의 JSON만 반환하세요 (다른 텍스트 없이):',
        '{"summary":"2~3문장 핵심 요약","outcome":"한 문장 결론 또는 산출물","keyPoints":["핵심1","핵심2",...최대7개],"tags":["태그1",...최대8개]}',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: `업무 제목: ${task.title}\n담당: ${deptNames}\n\n업무 결과:\n${resultSnippet}`,
      }],
    })

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string
      outcome?: string
      keyPoints: string[]
      tags: string[]
    }

    const keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 7) : []
    const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : []

    // 임베딩 생성 (검색 시 사용) — 풍부한 텍스트로 생성
    const embeddingText = [
      task.title,
      parsed.summary ?? '',
      parsed.outcome ?? '',
      ...keyPoints,
      ...tags,
    ].filter(Boolean).join(' ')

    const embeddings = await fetchEmbeddings([embeddingText])
    const embedding = embeddings?.[0] ?? undefined

    const importance = computeInitialImportance(keyPoints.length, tags.length)

    const memory: Omit<AgentMemory, 'id' | 'createdAt'> = {
      taskId: task.id,
      title: task.title,
      summary: parsed.summary ?? '',
      outcome: parsed.outcome,
      keyPoints,
      departments: task.assignedTo,
      tags,
      embedding,
      importance,
      accessCount: 0,
    }

    store.addMemory(memory)
  } catch (err) {
    console.warn('[memoryService] 메모리 추출 실패:', err)
  }
}

// ─── 관련 메모리 검색 ─────────────────────────────────────────────────────────
// 임베딩이 있는 메모리는 코사인 유사도, 없으면 키워드 스코어링으로 폴백
export async function searchRelevantMemories(
  query: string,
  departments: DepartmentId[],
): Promise<AgentMemory[]> {
  const store = useAgentStore.getState()
  if (!store.memoryEnabled || store.memories.length === 0) return []

  // ── 부서 필터 선행: dept 일치 메모리는 전량 포함, 미일치는 중요도 상위만 ──
  const deptMatched = store.memories.filter((m) =>
    departments.some((d) => m.departments.includes(d))
  )
  const deptUnmatched = store.memories
    .filter((m) => !departments.some((d) => m.departments.includes(d)))
    .sort((a, b) => (b.importance ?? 0.5) - (a.importance ?? 0.5))
    .slice(0, MAX_NON_DEPT_CANDIDATES)
  const candidates = [...deptMatched, ...deptUnmatched]

  const candidatesWithEmbedding = candidates.filter((m) => m.embedding && m.embedding.length > 0)
  const candidatesWithoutEmbedding = candidates.filter((m) => !m.embedding || m.embedding.length === 0)

  const results: Array<{ mem: AgentMemory; score: number }> = []

  // ── 시맨틱 검색 (임베딩 있는 메모리) ──
  if (candidatesWithEmbedding.length > 0) {
    const queryEmbeddings = await fetchEmbeddings([query])
    const queryVec = queryEmbeddings?.[0]

    for (const mem of candidatesWithEmbedding) {
      const baseScore = queryVec
        ? cosineSimilarity(queryVec, mem.embedding ?? [])
        : keywordScore(query, mem)

      const score = computeRuntimeScore(baseScore, mem, departments)
      results.push({ mem, score })
    }
  }

  // ── 키워드 검색 (임베딩 없는 메모리) ──
  for (const mem of candidatesWithoutEmbedding) {
    const baseScore = keywordScore(query, mem)
    if (baseScore > 0) {
      const score = computeRuntimeScore(baseScore, mem, departments)
      results.push({ mem, score })
    }
  }

  // 시맨틱 0.13 이상, 키워드 > 0 유지
  const found = results
    .filter(({ mem, score }) =>
      mem.embedding ? score >= 0.13 : score > 0
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MEMORY_CONTEXT_ITEMS)
    .map(({ mem }) => mem)

  // 참조된 메모리의 accessCount / lastAccessedAt 업데이트 (비동기, 결과에 영향 없음)
  if (found.length > 0) {
    const now = new Date()
    for (const mem of found) {
      store.updateMemory(mem.id, {
        accessCount: (mem.accessCount ?? 0) + 1,
        lastAccessedAt: now,
      })
    }
  }

  const searchType = candidatesWithEmbedding.length > 0 ? '시맨틱' : '키워드'
  useAgentStore.getState().addExecutionLog(
    'memory',
    `메모리 검색 (${searchType})`,
    found.length > 0
      ? `${found.length}건 참고: ${found.map((m) => m.title).join(', ')}`
      : '관련 메모리 없음',
  )

  return found
}

function keywordScore(query: string, mem: AgentMemory): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  const searchText = [mem.title, mem.summary, mem.outcome ?? '', ...mem.keyPoints, ...mem.tags]
    .join(' ')
    .toLowerCase()
  return queryWords.reduce((acc, word) => acc + (searchText.includes(word) ? 1 : 0), 0)
}

// ─── 메모리를 시스템 프롬프트 컨텍스트로 변환 ────────────────────────────────
export function buildMemoryContext(memories: AgentMemory[]): string {
  if (memories.length === 0) return ''

  const lines = [
    '[과거 업무 참고]',
    '아래는 이번 요청과 관련 있을 수 있는 과거 업무 요약입니다. 참고만 하고 사실처럼 단정하지 마세요.',
  ]

  for (const mem of memories) {
    const ageDays = Math.round(daysSince(mem.createdAt))
    const ageLabel = ageDays === 0 ? '오늘' : ageDays < 7 ? `${ageDays}일 전` : ageDays < 30 ? `${Math.round(ageDays / 7)}주 전` : `${Math.round(ageDays / 30)}개월 전`

    lines.push('', `▪ ${mem.title} (${ageLabel})`)
    lines.push(`  ${mem.summary.slice(0, MAX_MEMORY_SUMMARY_CHARS)}`)

    if (mem.outcome) {
      lines.push(`  → 결과: ${mem.outcome}`)
    }

    if (mem.keyPoints.length > 0) {
      for (const point of mem.keyPoints) {
        lines.push(`  - ${point}`)
      }
    }
  }

  lines.push('[과거 업무 참고 끝]')
  return lines.filter((l) => l !== '').join('\n')
}
