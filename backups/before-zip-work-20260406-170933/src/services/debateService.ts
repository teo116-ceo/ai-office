import { useAgentStore } from '@/store/agentStore'
import { Agent, DepartmentId, DEPARTMENTS, UploadedFile } from '@/types'
import { AGENT_GROUND_RULES, AGENT_PROMPTS, resolveByKeyword } from './claudeApi'
import { buildDirectiveContext, shouldInterruptAgentWork, syncDirectiveAgentMessages } from './directives'
import { callLLM } from './multiProviderApi'
import {
  buildTeamPlan,
  formatAssignmentRoster,
  formatParticipantRoster,
  getCoordinatorLabel,
  type TeamAssignment,
  type TeamPlan,
} from './teamCollaboration'

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
    senderName: `${teamPlan.coordinator.agent.name} (${teamPlan.coordinator.agent.role})`,
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

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const directiveRevisionAtStart = useAgentStore.getState().directiveRevision

    try {
      const content = await callLLM({
        model: agent.model,
        maxTokens: 512,
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
        senderName: `${agent.name} (${agent.role})`,
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
      maxTokens: 640,
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
      senderName: `${coordinator.name} (${coordinator.role})`,
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

async function synthesize(topic: string, opinions: Opinion[]) {
  const store = useAgentStore.getState()
  const ceo = store.agents.find((agent) => agent.departmentId === 'ceo')
  if (!ceo) return

  store.updateAgentStatus(ceo.id, 'thinking', '최종 결론 도출 중...')

  const opinionText = opinions
    .map((opinion) => `[${DEPARTMENTS[opinion.dept].name} / ${opinion.agentName}]\n${opinion.content}`)
    .join('\n\n')
  const directiveContext = buildDirectiveContext({ mode: 'debate' })
  const directiveRevisionAtStart = store.directiveRevision

  try {
    const content = await callLLM({
      model: ceo.model,
      maxTokens: 640,
      system: [
        '당신은 IT 보안 회사 대표입니다. 두 부서의 토론을 경청하고 각 의견의 장점을 통합하여 최적의 결론과 실행 방향을 제시하세요.',
        AGENT_GROUND_RULES,
        directiveContext,
        '토론에 나온 주장 중 확인되지 않은 내용은 사실처럼 단정하지 말고, 필요한 확인 사항이나 조건을 함께 적으세요.',
      ].filter(Boolean).join('\n\n'),
      messages: [{
        role: 'user',
        content: `토론 주제: ${topic}\n\n${opinionText}\n\n초기 의견과 반론을 모두 반영해 최종 결론을 내려주세요.`,
      }],
    })

    if (shouldInterruptAgentWork(ceo.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return
    }

    store.addMessage({
      sender: ceo.id,
      senderName: `${ceo.name} (${ceo.role})`,
      content: `[토론 최종 결론]\n${content}`,
      type: 'result',
      departmentIds: uniqueDepartments(['ceo', ...opinions.map((opinion) => opinion.dept)]),
    })
    store.updateAgentStatus(ceo.id, 'idle')
    syncDirectiveAgentMessages()
  } catch {
    store.updateAgentStatus(ceo.id, 'idle')
    syncDirectiveAgentMessages()
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
      senderName: `${ceo.name} (${ceo.role})`,
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
  await synthesize(topic, allOpinions)
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
      '위 역할 기준으로 부서 입장에 보탤 수 있는 핵심 논리를 정리하세요.',
    ].join('\n\n')
  }

  return [
    `토론 주제: ${topic}`,
    '[자동 분업 영역]',
    assignment.workstream,
    `상대 부서 요약 의견 (${DEPARTMENTS[counterOpinion!.dept].name} / ${counterOpinion!.agentName})`,
    counterOpinion!.content,
    '위 의견에 반론하고 자신의 역할 영역 기준으로 입장을 보강하세요.',
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
      ? `${DEPARTMENTS[teamPlan.departmentId].name} 팀의 공식 반론으로 정리하세요. 공격 포인트, 유지할 입장, 양보 불가 조건을 포함하세요.`
      : `${DEPARTMENTS[teamPlan.departmentId].name} 팀의 공식 초기 입장으로 정리하세요. 핵심 주장, 판단 근거, 전제를 분명히 드러내세요.`,
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
    `현재 역할: ${agent.role}`,
    collaborationInstruction,
    AGENT_GROUND_RULES,
    directiveContext,
    round === '반론'
      ? '상대 부서 논리의 약점을 짚되 과장하지 말고, 조건과 근거를 함께 적으세요.'
      : '명확한 주장과 근거를 짧고 밀도 있게 정리하세요.',
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
