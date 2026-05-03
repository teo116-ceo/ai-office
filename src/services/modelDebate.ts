/**
 * 모델 토론 엔진
 * Claude vs GPT (medium) / Claude vs GPT vs Gemini (complex)
 * 각 모델이 독립적으로 의견을 낸 뒤 반론 → 시스템이 중립 정리 → 사용자 판정
 */

import { useAgentStore } from '@/store/agentStore'
import { formatSystemDisplayName } from '@/utils/agentRoleMeta'
import { callLLM } from './multiProviderApi'
import { buildTaskPrompt } from './taskExecutionPrompts'
import type { TaskComplexity } from './taskComplexity'
import type { UploadedFile } from '@/types'

type ModelId = 'claude-sonnet-4-6' | 'gpt-4o' | 'gemini-2.5-flash'

interface ModelTeam {
  id: string
  name: string
  model: ModelId
  perspective: string
}

interface ModelOpinion {
  team: ModelTeam
  content: string
}

const TEAMS: Record<string, ModelTeam> = {
  claude: {
    id: 'model-claude',
    name: 'Claude',
    model: 'claude-sonnet-4-6',
    perspective: '진단 연구·사업 전략·추론 관점에서 깊이 있는 판단을 내립니다.',
  },
  gpt: {
    id: 'model-gpt',
    name: 'GPT',
    model: 'gpt-4o',
    perspective: '구현·실행·효율 관점에서 실용적인 판단을 내립니다.',
  },
  gemini: {
    id: 'model-gemini',
    name: 'Gemini',
    model: 'gemini-2.5-flash',
    perspective: '데이터·구조·종합 관점에서 균형 잡힌 판단을 내립니다.',
  },
}

function teamsForComplexity(complexity: Exclude<TaskComplexity, 'simple'>): ModelTeam[] {
  if (complexity === 'complex') return [TEAMS.claude, TEAMS.gpt, TEAMS.gemini]
  return [TEAMS.claude, TEAMS.gpt]
}

async function collectOpinion(
  team: ModelTeam,
  topic: string,
  round: '초기 의견' | '반론',
  otherOpinions?: ModelOpinion[],
): Promise<ModelOpinion | null> {
  const store = useAgentStore.getState()

  const counterSection = otherOpinions && otherOpinions.length > 0
    ? otherOpinions
        .map((o) => `[${o.team.name}의 의견]\n${o.content}`)
        .join('\n\n')
    : null

  const userPrompt = round === '초기 의견'
    ? `다음 주제에 대해 ${team.perspective} 핵심 논거를 3~5가지로 정리하세요.\n\n주제: ${topic}`
    : [
        `다음 주제에 대해 다른 모델들의 의견을 검토한 뒤 반론 또는 보완 의견을 제시하세요.`,
        `주제: ${topic}`,
        counterSection ? `\n${counterSection}` : '',
        `\n당신의 관점(${team.perspective})에서 상대 의견의 약점을 지적하거나 놓친 부분을 보강하세요.`,
      ].filter(Boolean).join('\n')

  try {
    const content = await callLLM({
      model: team.model,
      maxTokens: 1024,
      system: [
        `당신은 ${team.name} 모델로서 AI 오피스 전략 토론에 참여하고 있습니다.`,
        team.perspective,
        '명확한 주장과 근거를 간결하게 작성하세요. 과장하지 말고 사실 기반으로 작성하세요.',
      ].join('\n'),
      messages: [{ role: 'user', content: userPrompt }],
    })

    store.addMessage({
      sender: team.id,
      senderName: `${team.name} (${round})`,
      content,
      type: 'debate',
      departmentIds: ['ceo'],
    })

    return { team, content }
  } catch {
    store.addMessage({
      sender: team.id,
      senderName: `${team.name} (오류)`,
      content: `${team.name} 모델 응답 실패 — API 키를 확인하세요.`,
      type: 'system',
      departmentIds: ['ceo'],
    })
    return null
  }
}

function postSummary(
  topic: string,
  opinions: ModelOpinion[],
  rebuttals: ModelOpinion[],
  taskId: string,
): string {
  const store = useAgentStore.getState()
  const lines: string[] = []

  lines.push(`📋 모델 토론 완료 — 주제: ${topic}`, '')

  // 최종 입장: 반론이 있으면 반론 우선, 없으면 초기 의견
  const allTeams = [...new Set([...opinions, ...rebuttals].map((o) => o.team.id))]
  for (const teamId of allTeams) {
    const rebuttal = rebuttals.find((r) => r.team.id === teamId)
    const initial = opinions.find((o) => o.team.id === teamId)
    const final = rebuttal ?? initial
    if (!final) continue
    lines.push(`▸ ${final.team.name} 최종 입장`)
    lines.push(final.content.split('\n').slice(0, 4).join('\n'))
    lines.push('')
  }

  lines.push('─────────────────────────')
  lines.push('CEO(사용자)의 최종 판단을 기다립니다.')

  const summary = lines.join('\n')

  store.addMessage({
    sender: 'system',
    senderName: formatSystemDisplayName('토론 시스템', '결과 정리'),
    content: summary,
    type: 'result',
    departmentIds: ['ceo'],
    taskId,
  })

  return summary
}

export async function runModelDebate(
  userMessage: string,
  attachments: UploadedFile[],
  complexity: Exclude<TaskComplexity, 'simple'>,
  taskId: string,
  deptContext?: string,
): Promise<string | undefined> {
  const store = useAgentStore.getState()
  const teams = teamsForComplexity(complexity)
  const baseTopic = buildTaskPrompt(userMessage, attachments, 'summary')
  // 부서 분석 결과가 있으면 토론 주제 컨텍스트로 포함
  const topic = deptContext
    ? `${baseTopic}\n\n[부서 사전 분석]\n${deptContext.slice(0, 1200)}${deptContext.length > 1200 ? '\n...(이하 생략)' : ''}`
    : baseTopic
  const tierLabel = complexity === 'complex'
    ? 'Claude · GPT · Gemini 3자 토론'
    : 'Claude · GPT 2자 토론'

  store.addMessage({
    sender: 'system',
    senderName: formatSystemDisplayName('토론 시스템', '진행 안내'),
    content: [
      `${tierLabel}을 시작합니다.`,
      `주제: ${userMessage.slice(0, 120)}${userMessage.length > 120 ? '…' : ''}`,
      `참여 모델: ${teams.map((t) => t.name).join(', ')}`,
      deptContext ? '📂 부서 사전 분석 결과를 컨텍스트로 반영합니다.' : '',
    ].filter(Boolean).join('\n'),
    type: 'system',
    departmentIds: ['ceo'],
    taskId,
  })

  // 1라운드: 초기 의견 (병렬)
  const initialResults = await Promise.all(
    teams.map((team) => collectOpinion(team, topic, '초기 의견')),
  )
  const initialOpinions = initialResults.filter(Boolean) as ModelOpinion[]
  if (initialOpinions.length === 0) return undefined

  // 2라운드: 반론 (병렬 — 각자 다른 팀 의견을 보고 반론)
  const rebuttalResults = await Promise.all(
    teams.map((team) => {
      const others = initialOpinions.filter((o) => o.team.id !== team.id)
      return collectOpinion(team, topic, '반론', others)
    }),
  )
  const rebuttals = rebuttalResults.filter(Boolean) as ModelOpinion[]

  return postSummary(topic, initialOpinions, rebuttals, taskId)
}
