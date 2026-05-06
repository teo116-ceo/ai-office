import { useAgentStore } from '@/store/agentStore'
import { Agent, DepartmentId, DEPARTMENTS, UploadedFile } from '@/types'
import { AGENT_GROUND_RULES, AGENT_PROMPTS, resolveAgentPersonaPrompt } from './taskExecutionPrompts'
import { buildDirectiveContext, shouldInterruptAgentWork, syncDirectiveAgentMessages } from './directives'
import { callLLM } from './multiProviderApi'
import { resolveByKeyword } from './taskRouting'
import {
  buildTeamPlan,
  formatAssignmentRoster,
  formatParticipantRoster,
  getCoordinatorLabel,
  type TeamAssignment,
  type TeamPlan,
} from './teamCollaboration'
import { formatAgentDisplayName, formatSystemDisplayName } from '@/utils/agentRoleMeta'

type DebateContribution = {
  agent: Agent
  content: string
}

type Opinion = {
  dept: DepartmentId
  agentId: string
  agentName: string
  agentRole: string
  content: string
}

function resolveDebateDepts(message: string): [DepartmentId, DepartmentId] {
  const topic = message.replace('@토론', '').replace(/^토론:/i, '').trim()
  const depts = resolveByKeyword(topic)
  const a = depts[0] ?? 'planning'
  const b = depts[1] ?? (a === 'security' ? 'development' : 'security')
  return [a, b]
}

async function collectTeamOpinion(
  dept: DepartmentId,
  topic: string,
  round: '초기 의견' | '반론',
  counterOpinion?: Opinion,
): Promise<Opinion | null> {
  const store = useAgentStore.getState()
  const teamPlan = buildTeamPlan(store.agents, dept, 'debate')
  if (teamPlan.participants.length === 0) {
    return null
  }

  store.addMessage({
    sender: teamPlan.coordinator.agent.id,
    senderName: formatAgentDisplayName(teamPlan.coordinator.agent),
    content: [
      `${DEPARTMENTS[dept].name} 팀 ${round} 검토를 시작합니다.`,
      `참여 인원: ${formatParticipantRoster(teamPlan.participants)}`,
      `조정 방식: ${getCoordinatorLabel(teamPlan)} (${teamPlan.coordinator.agent.name})`,
      '[역할 분업]',
      formatAssignmentRoster(teamPlan.assignments),
    ].join('\n'),
    type: 'system',
    departmentIds: [dept],
  })

  const contributionResults = await Promise.all(
    teamPlan.assignments.map((assignment) => collectIndividualOpinion({
      assignment,
      topic,
      round,
      counterOpinion,
      teamPlan,
    })),
  )

  const successful = contributionResults
    .map((result) => result.contribution)
    .filter(Boolean) as DebateContribution[]
  const interrupted = contributionResults.some((result) => result.interrupted)

  if (interrupted || successful.length === 0) {
    return null
  }

  if (teamPlan.participants.length === 1) {
    return toTeamOpinion(dept, successful[0])
  }

  const summary = await synthesizeTeamOpinion({
    teamPlan,
    topic,
    round,
    counterOpinion,
    contributions: successful,
  })

  return summary ?? toTeamOpinion(dept, successful[0])
}

async function collectIndividualOpinion({
  assignment,
  topic,
  round,
  counterOpinion,
  teamPlan,
}: {
  assignment: TeamAssignment
  topic: string
  round: '초기 의견' | '반론'
  counterOpinion?: Opinion
  teamPlan: TeamPlan
}) {
  const { agent } = assignment
  const store = useAgentStore.getState()
  store.updateAgentStatus(agent.id, 'debating', round === '초기 의견' ? '분담 의견 정리 중...' : '분담 반론 정리 중...')

  // 지시 변경 감지를 위해 작업 시작 시점의 revision을 1회만 캡처
  const directiveRevisionAtStart = useAgentStore.getState().directiveRevision

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await callLLM({
        model: agent.model,
        maxTokens: 1024,
        system: buildDebateSystemPrompt(agent, teamPlan, assignment, round, 'individual'),
        messages: [{
          role: 'user',
          content: buildIndividualDebatePrompt(topic, round, counterOpinion, assignment),
        }],
      })

      if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
        syncDirectiveAgentMessages()
        return { contribution: null as DebateContribution | null, interrupted: true }
      }

      const contribution = { agent, content }
      useAgentStore.getState().addMessage({
        sender: agent.id,
        senderName: formatAgentDisplayName(agent),
        content: `[개별 의견 - ${round}]\n${content}`,
        type: 'debate',
        departmentIds: [agent.departmentId],
      })
      useAgentStore.getState().updateAgentStatus(agent.id, 'idle')
      return { contribution, interrupted: false }
    } catch {
      if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
        syncDirectiveAgentMessages()
        return { contribution: null, interrupted: true }
      }

      if (attempt === 1) {
        useAgentStore.getState().updateAgentStatus(agent.id, 'idle')
      }
    }
  }

  return { contribution: null as DebateContribution | null, interrupted: false }
}

async function synthesizeTeamOpinion({
  teamPlan,
  topic,
  round,
  counterOpinion,
  contributions,
}: {
  teamPlan: TeamPlan
  topic: string
  round: '초기 의견' | '반론'
  counterOpinion?: Opinion
  contributions: DebateContribution[]
}) {
  const coordinator = teamPlan.coordinator.agent
  const store = useAgentStore.getState()
  store.updateAgentStatus(coordinator.id, 'debating', round === '초기 의견' ? '자동 조합 중...' : '반론 자동 조합 중...')
  const directiveRevisionAtStart = store.directiveRevision

  try {
    const content = await callLLM({
      model: coordinator.model,
      maxTokens: 1280,
      system: buildDebateSystemPrompt(coordinator, teamPlan, teamPlan.coordinator, round, 'summary'),
      messages: [{
        role: 'user',
        content: buildTeamDebatePrompt(topic, round, counterOpinion, teamPlan, contributions),
      }],
    })

    if (shouldInterruptAgentWork(coordinator.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return null
    }

    const opinion = {
      dept: teamPlan.departmentId,
      agentId: coordinator.id,
      agentName: coordinator.name,
      agentRole: coordinator.role,
      content,
    }

    useAgentStore.getState().addMessage({
      sender: coordinator.id,
      senderName: formatAgentDisplayName(coordinator),
      content: `[자동 조합 - ${round}]\n${content}`,
      type: 'debate',
      departmentIds: [teamPlan.departmentId],
    })
    useAgentStore.getState().updateAgentStatus(coordinator.id, 'idle')
    syncDirectiveAgentMessages()
    return opinion
  } catch {
    useAgentStore.getState().updateAgentStatus(coordinator.id, 'idle')
    syncDirectiveAgentMessages()
    return null
  }
}

function synthesize(topic: string, opinions: Opinion[]) {
  const store = useAgentStore.getState()

  // 부서별 최종 입장 정리 (초기 의견 + 반론 중 마지막 것 우선)
  const deptMap = new Map<DepartmentId, Opinion>()
  for (const opinion of opinions) {
    deptMap.set(opinion.dept, opinion) // 나중 것(반론)이 덮어씀
  }

  const summaryLines: string[] = [`📋 토론 완료 — 주제: ${topic}`, '']
  for (const [dept, opinion] of deptMap.entries()) {
    summaryLines.push(`▸ ${DEPARTMENTS[dept].name} 최종 입장 (${opinion.agentName})`)
    // 핵심만 2~3줄로 잘라서 표시
    const preview = opinion.content.split('\n').slice(0, 3).join('\n')
    summaryLines.push(preview)
    summaryLines.push('')
  }
  summaryLines.push('— CEO(사용자)의 최종 결정을 기다립니다.')

  const ceo = store.agents.find((agent) => agent.departmentId === 'ceo')
  store.addMessage({
    sender: ceo?.id ?? 'ceo-01',
    senderName: formatSystemDisplayName('대표실', '토론 진행'),
    content: summaryLines.join('\n'),
    type: 'result',
    departmentIds: uniqueDepartments([...opinions.map((opinion) => opinion.dept)]),
  })
}

/**
 * 단일 부서 내부 토론 — 같은 부서 에이전트들이 각자 관점을 내고 코디네이터가 합산
 * medium/complex 태스크에서 각 부서별로 호출됨
 */
export async function runDeptInternalDebate(
  dept: DepartmentId,
  topic: string,
): Promise<string | null> {
  const opinion = await collectTeamOpinion(dept, topic, '초기 의견')
  return opinion?.content ?? null
}

/**
 * 여러 부서 의견을 비교·종합 (complex 태스크 전용)
 * 부서별 내부 토론 결과를 크로스-부서 관점에서 정리
 */
export async function synthesizeDeptOpinions(
  topic: string,
  deptOpinions: Array<{ dept: DepartmentId; content: string }>,
): Promise<string | null> {
  const store = useAgentStore.getState()
  const ceo = store.agents.find((a) => a.departmentId === 'ceo')

  const lines = deptOpinions.map(
    ({ dept, content }) =>
      `[${DEPARTMENTS[dept].name}]\n${content.slice(0, 600)}${content.length > 600 ? '\n...' : ''}`,
  )

  try {
    const synthesis = await callLLM({
      model: ceo?.model ?? 'claude-sonnet-4-6',
      maxTokens: 1200,
      system: '당신은 다수 부서의 의견을 종합하여 최종 결론을 내리는 역할입니다. 공통점·충돌 지점·핵심 쟁점을 분석하고 지금 바로 실행 가능한 결론과 다음 액션을 완성하여 제출하라.',
      messages: [{
        role: 'user',
        content: `주제: ${topic}\n\n${lines.join('\n\n')}\n\n위 부서별 의견을 분석하여 핵심 쟁점과 최종 결론을 지금 바로 완성하여 제출하라. 합의 방향과 실행 액션까지 확정하라.`,
      }],
    })

    store.addMessage({
      sender: ceo?.id ?? 'ceo-01',
      senderName: formatSystemDisplayName('대표실', '의견 종합'),
      content: `[부서 간 쟁점 정리]\n${synthesis}`,
      type: 'system',
      departmentIds: uniqueDepartments(deptOpinions.map((d) => d.dept)),
    })

    return synthesis
  } catch {
    return null
  }
}

export async function runDebate(message: string, _attachments: UploadedFile[] = []) {
  const topic = message.replace('@토론', '').replace(/^토론:/i, '').trim()
  const [deptA, deptB] = resolveDebateDepts(message)
  const scopeDepartments = uniqueDepartments(['ceo', deptA, deptB])

  const store = useAgentStore.getState()
  const ceo = store.agents.find((agent) => agent.departmentId === 'ceo')

  store.addMessage({
    sender: 'user',
    senderName: '사용자',
    content: message,
    type: 'task',
    departmentIds: scopeDepartments,
  })

  if (ceo) {
    store.addMessage({
      sender: ceo.id,
      senderName: formatAgentDisplayName(ceo),
      content: `토론을 시작합니다: ${DEPARTMENTS[deptA].name} vs ${DEPARTMENTS[deptB].name}\n주제: ${topic}`,
      type: 'system',
      departmentIds: scopeDepartments,
    })
  }

  const [opinionA, opinionB] = await Promise.all([
    collectTeamOpinion(deptA, topic, '초기 의견'),
    collectTeamOpinion(deptB, topic, '초기 의견'),
  ])
  if (!opinionA || !opinionB) return

  const [rebuttalA, rebuttalB] = await Promise.all([
    collectTeamOpinion(deptA, topic, '반론', opinionB),
    collectTeamOpinion(deptB, topic, '반론', opinionA),
  ])

  const allOpinions = [opinionA, opinionB, rebuttalA, rebuttalB].filter(Boolean) as Opinion[]
  synthesize(topic, allOpinions)
}

function buildIndividualDebatePrompt(
  topic: string,
  round: '초기 의견' | '반론',
  counterOpinion: Opinion | undefined,
  assignment: TeamAssignment,
) {
  if (round === '초기 의견') {
    return [
      `토론 주제: ${topic}`,
      '[자동 분업 영역]',
      assignment.workstream,
      '위 역할 기준으로 지금 바로 핵심 주장과 근거를 작성하여 제출하라. 방향 제시가 아닌 확정된 입장을 내놓아라.',
    ].join('\n\n')
  }

  if (!counterOpinion) {
    return [
      `토론 주제: ${topic}`,
      '[자동 분업 영역]',
      assignment.workstream,
      '위 역할 기준으로 지금 바로 핵심 주장과 근거를 작성하여 제출하라. 방향 제시가 아닌 확정된 입장을 내놓아라.',
    ].join('\n\n')
  }

  return [
    `토론 주제: ${topic}`,
    '[자동 분업 영역]',
    assignment.workstream,
    `상대 부서 요약 의견 (${DEPARTMENTS[counterOpinion.dept].name} / ${counterOpinion.agentName})`,
    counterOpinion.content,
    '위 의견의 약점을 짚고 자신의 역할 영역 기준으로 반론을 지금 바로 작성하여 제출하라. 모호한 표현 없이 확정된 반론을 내놓아라.',
  ].join('\n\n')
}

function buildTeamDebatePrompt(
  topic: string,
  round: '초기 의견' | '반론',
  counterOpinion: Opinion | undefined,
  teamPlan: TeamPlan,
  contributions: DebateContribution[],
) {
  return [
    `토론 주제: ${topic}`,
    round === '반론' && counterOpinion
      ? `상대 부서 요약 의견\n${DEPARTMENTS[counterOpinion.dept].name} / ${counterOpinion.agentName}\n${counterOpinion.content}`
      : '',
    '[참여 인원]',
    formatParticipantRoster(teamPlan.participants),
    '[역할 분업]',
    formatAssignmentRoster(teamPlan.assignments),
    '[팀원 메모]',
    ...contributions.map((item, index) => `${index + 1}. ${item.agent.name} (${item.agent.role})\n${item.content}`),
    '[정리 요청]',
    round === '반론'
      ? `${DEPARTMENTS[teamPlan.departmentId].name} 팀의 공식 반론을 지금 바로 완성하여 제출하라. 공격 포인트, 유지 입장, 양보 불가 조건을 포함한 확정 반론을 내놓아라.`
      : `${DEPARTMENTS[teamPlan.departmentId].name} 팀의 공식 초기 입장을 지금 바로 완성하여 제출하라. 핵심 주장, 판단 근거, 전제를 확정된 형태로 내놓아라.`,
  ].filter(Boolean).join('\n\n')
}

function buildDebateSystemPrompt(
  agent: Agent,
  teamPlan: TeamPlan,
  assignment: TeamAssignment,
  round: '초기 의견' | '반론',
  mode: 'individual' | 'summary',
) {
  const directiveContext = buildDirectiveContext({ departmentId: teamPlan.departmentId, mode: 'debate' })
  const collaborationInstruction = mode === 'summary'
    ? `당신은 ${DEPARTMENTS[teamPlan.departmentId].name} 팀의 ${getCoordinatorLabel(teamPlan)} 담당입니다. 역할별 메모를 합쳐 부서 공식 입장을 자동 조합하세요.`
    : `당신은 역할 기반 자동 분업으로 '${assignment.workstream}' 영역을 담당합니다.`

  return [
    AGENT_PROMPTS[teamPlan.departmentId],
    resolveAgentPersonaPrompt(agent),
    `현재 역할: ${agent.role}`,
    collaborationInstruction,
    AGENT_GROUND_RULES,
    directiveContext,
    round === '반론'
      ? '상대 부서 논리의 약점을 짚고 지금 바로 반론을 완성하여 제출하라. 조건과 근거를 포함한 확정 반론을 내놓아라.'
      : '명확한 주장과 근거를 지금 바로 작성하여 제출하라. 요약이 아닌 확정된 입장을 내놓아라.',
  ].filter(Boolean).join('\n\n')
}

function toTeamOpinion(dept: DepartmentId, contribution: DebateContribution): Opinion {
  return {
    dept,
    agentId: contribution.agent.id,
    agentName: contribution.agent.name,
    agentRole: contribution.agent.role,
    content: contribution.content,
  }
}

function uniqueDepartments(departments: DepartmentId[]) {
  return Array.from(new Set(departments))
}
