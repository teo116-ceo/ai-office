import { useAgentStore } from '@/store/agentStore'
import { Agent, DepartmentId, DEPARTMENTS } from '@/types'
import { AGENT_GROUND_RULES, AGENT_PROMPTS, resolveAgentPersonaPrompt } from './taskExecutionPrompts'
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
import { formatAgentDisplayName, formatSystemDisplayName } from '@/utils/agentRoleMeta'

type Stance = '찬성' | '반대'

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


async function collectTeamOpinion(
  dept: DepartmentId,
  topic: string,
  round: '초기 의견' | '반론',
  counterOpinion?: Opinion,
  stance?: Stance,
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
      `${DEPARTMENTS[dept].name} 팀 ${round} 검토를 시작합니다.${stance ? `\n배정 입장: ${stance}측` : ''}`,
      `참여 인원: ${formatParticipantRoster(teamPlan.participants)}`,
      `조정 방식: ${getCoordinatorLabel(teamPlan)} (${teamPlan.coordinator.agent.name})`,
      '[결과 표시 순서]',
      '1. 아래 역할에 따라 담당자가 [개별 의견]을 올립니다.',
      '2. 팀원이 여러 명이면 [자동 조합]이 부서 공식 의견입니다.',
      '3. 모든 부서 검토 후 CEO 채널에 쟁점 정리와 부서 간 토론 결과가 표시됩니다.',
      '[역할 분업]',
      formatAssignmentRoster(teamPlan.assignments, teamPlan.mode),
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
      stance,
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
    stance,
  })

  return summary ?? toTeamOpinion(dept, successful[0])
}

async function collectIndividualOpinion({
  assignment,
  topic,
  round,
  counterOpinion,
  teamPlan,
  stance,
}: {
  assignment: TeamAssignment
  topic: string
  round: '초기 의견' | '반론'
  counterOpinion?: Opinion
  teamPlan: TeamPlan
  stance?: Stance
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
        system: buildDebateSystemPrompt(agent, teamPlan, assignment, round, 'individual', stance),
        messages: [{
          role: 'user',
          content: buildIndividualDebatePrompt(topic, round, counterOpinion, assignment, stance),
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
  stance,
}: {
  teamPlan: TeamPlan
  topic: string
  round: '초기 의견' | '반론'
  counterOpinion?: Opinion
  contributions: DebateContribution[]
  stance?: Stance
}) {
  const coordinator = teamPlan.coordinator.agent
  const store = useAgentStore.getState()
  store.updateAgentStatus(coordinator.id, 'debating', round === '초기 의견' ? '자동 조합 중...' : '반론 자동 조합 중...')
  const directiveRevisionAtStart = store.directiveRevision

  try {
    const content = await callLLM({
      model: coordinator.model,
      maxTokens: 1280,
      system: buildDebateSystemPrompt(coordinator, teamPlan, teamPlan.coordinator, round, 'summary', stance),
      messages: [{
        role: 'user',
        content: buildTeamDebatePrompt(topic, round, counterOpinion, teamPlan, contributions, stance),
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

async function synthesize(topic: string, opinions: Opinion[], stances?: Record<string, Stance>) {
  const store = useAgentStore.getState()
  const ceo = store.agents.find((agent) => agent.departmentId === 'ceo')

  // 부서별 최종 입장 정리 (반론이 있으면 반론이 최종 입장)
  const deptMap = new Map<DepartmentId, Opinion>()
  for (const opinion of opinions) {
    deptMap.set(opinion.dept, opinion)
  }

  const opinionBlocks = [...deptMap.entries()]
    .map(([dept, opinion]) => {
      const tag = stances?.[dept] ? ` [${stances[dept]}측]` : ''
      return `=== ${DEPARTMENTS[dept].name}${tag} 최종 입장 (${opinion.agentName}) ===\n${opinion.content}`
    })
    .join('\n\n')

  // LLM이 CEO 관점에서 쟁점·합의점·결정 사항을 정리
  const ceoSummary = await callLLM({
    model: ceo?.model ?? 'claude-sonnet-4-6',
    maxTokens: 1200,
    system: '당신은 CEO입니다. 부서 간 토론 결과를 보고 받아 의사결정에 필요한 핵심 정보를 정리합니다. 중립적이고 명확하게 작성하되, CEO가 즉시 판단할 수 있도록 구체적으로 제시하세요.',
    messages: [{
      role: 'user',
      content: [
        `주제: ${topic}`,
        '',
        opinionBlocks,
        '',
        '아래 형식으로 정리하라:',
        '',
        '📌 핵심 쟁점',
        '(각 부서 입장의 핵심 차이점을 2~3줄로)',
        '',
        '🟢 찬성측 최종 입장 요약',
        '(찬성측 부서명과 핵심 주장 2~3줄)',
        '',
        '🔴 반대측 최종 입장 요약',
        '(반대측 부서명과 핵심 주장 2~3줄)',
        '',
        '✅ 합의 가능한 부분',
        '(공통적으로 동의하는 사항, 없으면 "없음")',
        '',
        '⚠️ 충돌 지점',
        '(해결되지 않은 핵심 갈등 사항)',
        '',
        '📋 CEO 결정이 필요한 사항',
        '1. (첫 번째 결정 사항)',
        '2. (두 번째 결정 사항, 있으면)',
        '',
        '💡 판단 기준 제안',
        '(어떤 기준으로 결정하면 좋을지 1~2줄)',
      ].join('\n'),
    }],
  }).catch(() => null)

  const content = ceoSummary
    ? `📋 부서 간 토론 완료 — 주제: ${topic}\n\n${ceoSummary}`
    : [
        `📋 부서 간 토론 완료 — 주제: ${topic}`,
        '',
        opinionBlocks,
        '',
        '— CEO(사용자)의 최종 결정을 기다립니다.',
      ].join('\n')

  store.addMessage({
    sender: ceo?.id ?? 'ceo-01',
    senderName: formatSystemDisplayName('대표실', '토론 결과'),
    content,
    type: 'result',
    departmentIds: uniqueDepartments([...opinions.map((opinion) => opinion.dept)]),
  })
}

/**
 * 크로스-부서 토론: 각 부서 대표(팀장)가 다른 부서 의견에 반론하고 CEO가 최종 정리
 * modelDebate 대체 — 모델명 없이 실제 부원 이름으로 진행
 */
export async function runCrossDeptDebate(
  topic: string,
  deptOpinions: Array<{ dept: DepartmentId; content: string }>,
  taskId: string,
): Promise<string | null> {
  if (deptOpinions.length === 0) return null

  // 부서가 1개면 반론 없이 해당 부서 의견이 최종 결과
  if (deptOpinions.length === 1) return deptOpinions[0].content

  const store = useAgentStore.getState()
  const ceo = store.agents.find((a) => a.departmentId === 'ceo')
  const scopeDepts = uniqueDepartments(['ceo', ...deptOpinions.map((d) => d.dept)])

  store.addMessage({
    sender: ceo?.id ?? 'ceo-01',
    senderName: ceo ? formatAgentDisplayName(ceo) : '대표 (CEO)',
    content: [
      '부서 간 상호 검토를 시작합니다.',
      `참여 부서: ${deptOpinions.map((d) => DEPARTMENTS[d.dept].name).join(' · ')}`,
      '각 부서 대표가 다른 부서 입장을 검토하고 반론합니다.',
    ].join('\n'),
    type: 'system',
    departmentIds: scopeDepts,
    taskId,
  })

  // 각 부서가 다른 모든 부서 의견을 보고 반론
  const rebuttalResults = await Promise.all(
    deptOpinions.map(async ({ dept }) => {
      const otherDepts = deptOpinions.filter((d) => d.dept !== dept)
      if (otherDepts.length === 0) return null

      const combinedContent = otherDepts
        .map((d) => `[${DEPARTMENTS[d.dept].name}]\n${d.content.slice(0, 500)}`)
        .join('\n\n')

      const counterOpinion: Opinion = {
        dept: otherDepts[0].dept,
        agentId: '',
        agentName: otherDepts.map((d) => DEPARTMENTS[d.dept].name).join(' · '),
        agentRole: '타 부서',
        content: combinedContent,
      }

      return collectTeamOpinion(dept, topic, '반론', counterOpinion)
    }),
  )

  const validRebuttals = rebuttalResults.filter(Boolean) as Opinion[]

  // 반론이 있으면 반론 기준으로, 없으면 초기 의견 기준으로 최종 정리
  if (validRebuttals.length > 0) {
    await synthesize(topic, validRebuttals)
    return validRebuttals.map((r) => r.content).join('\n\n')
  }

  const initialOpinions: Opinion[] = deptOpinions.map((d) => ({
    dept: d.dept,
    agentId: '',
    agentName: DEPARTMENTS[d.dept].name,
    agentRole: '부서 대표',
    content: d.content,
  }))
  await synthesize(topic, initialOpinions)
  return deptOpinions.map((d) => d.content).join('\n\n')
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


const INDIVIDUAL_OUTPUT_FORMAT = `아래 형식 그대로 작성하라 (빈 항목 없이):

[입장] 찬성 / 반대 / 조건부 찬성 중 하나만 명시
[핵심 근거]
- 근거 1: (1~2문장)
- 근거 2: (1~2문장)
- 근거 3 (있으면): (1~2문장)
[전제 조건] 이 입장을 유지하기 위해 반드시 충족되어야 하는 조건 1가지
[한줄 결론] 행동 권고를 1문장으로`

const REBUTTAL_OUTPUT_FORMAT = `아래 형식 그대로 작성하라 (빈 항목 없이):

[입장 유지 여부] 기존 입장 유지 / 일부 수정 / 전환 중 하나
[반론 포인트]
- 상대 주장 약점 1: (구체적으로)
- 상대 주장 약점 2 (있으면):
[재확인 근거] 우리 입장이 옳은 이유 (1~2문장)
[양보 가능 범위] 수용할 수 있는 조건이 있다면 명시, 없으면 "없음"
[한줄 결론] 행동 권고를 1문장으로`

function buildIndividualDebatePrompt(
  topic: string,
  round: '초기 의견' | '반론',
  counterOpinion: Opinion | undefined,
  assignment: TeamAssignment,
  stance?: Stance,
) {
  if (round === '초기 의견') {
    const outputFormat = stance
      ? `배정 입장: ${stance} ← 반드시 이 입장을 유지하라\n\n아래 형식으로 작성하라:\n\n[입장] ${stance} (배정)\n[핵심 근거]\n- 근거 1: ${stance} 입장을 뒷받침하는 구체적 이유 (1~2문장)\n- 근거 2: (1~2문장)\n- 근거 3 (있으면):\n[예상 반론 대비] 상대측이 제기할 반론 1가지와 재반론\n[한줄 결론] 행동 권고 1문장`
      : INDIVIDUAL_OUTPUT_FORMAT
    return [
      `토론 주제: ${topic}`,
      '[담당 영역]',
      assignment.workstream,
      outputFormat,
    ].join('\n\n')
  }

  if (!counterOpinion) {
    const outputFormat = stance
      ? `배정 입장: ${stance} ← 반드시 이 입장을 유지하라\n\n아래 형식으로 작성하라:\n\n[입장] ${stance} (배정)\n[핵심 근거]\n- 근거 1: ${stance} 입장을 뒷받침하는 구체적 이유 (1~2문장)\n- 근거 2: (1~2문장)\n- 근거 3 (있으면):\n[예상 반론 대비] 상대측이 제기할 반론 1가지와 재반론\n[한줄 결론] 행동 권고 1문장`
      : INDIVIDUAL_OUTPUT_FORMAT
    return [
      `토론 주제: ${topic}`,
      '[담당 영역]',
      assignment.workstream,
      outputFormat,
    ].join('\n\n')
  }

  const rebuttalFormat = stance
    ? `배정 입장: ${stance} (유지) ← 이 입장에서 후퇴하지 마라\n\n아래 형식으로 작성하라:\n\n[입장 재확인] ${stance} (유지)\n[상대 주장 핵심 약점]\n- 약점 1: (구체적으로)\n- 약점 2 (있으면):\n[추가 강화 근거] 우리 ${stance} 입장을 더욱 강화하는 근거 (1~2문장)\n[양보 불가 조건] 절대 양보할 수 없는 전제 1가지\n[한줄 결론] 행동 권고 1문장`
    : REBUTTAL_OUTPUT_FORMAT
  return [
    `토론 주제: ${topic}`,
    '[담당 영역]',
    assignment.workstream,
    `[상대 부서 입장] ${DEPARTMENTS[counterOpinion.dept].name} / ${counterOpinion.agentName}`,
    counterOpinion.content,
    rebuttalFormat,
  ].join('\n\n')
}

function buildTeamDebatePrompt(
  topic: string,
  round: '초기 의견' | '반론',
  counterOpinion: Opinion | undefined,
  teamPlan: TeamPlan,
  contributions: DebateContribution[],
  stance?: Stance,
) {
  let requestSection: string
  if (stance) {
    requestSection = round === '반론'
      ? `[${DEPARTMENTS[teamPlan.departmentId].name} 팀 공식 반론 정리]\n${DEPARTMENTS[teamPlan.departmentId].name} 팀은 ${stance}측입니다. 팀원 반론을 바탕으로 ${stance} 입장을 더욱 강화하는 공식 반론을 완성하라. 상대 약점 공격, 우리 입장 강화 근거, 양보 불가 조건을 포함하라.`
      : `[${DEPARTMENTS[teamPlan.departmentId].name} 팀 공식 입장 정리]\n${DEPARTMENTS[teamPlan.departmentId].name} 팀은 ${stance}측으로 배정되었습니다. 팀원 의견을 바탕으로 ${stance} 입장의 공식 논거를 완성하라. 핵심 주장, 판단 근거, 상대방 예상 반론 대비를 포함하라.`
  } else {
    requestSection = `[${DEPARTMENTS[teamPlan.departmentId].name} 팀 공식 입장 정리]\n${round === '반론' ? REBUTTAL_OUTPUT_FORMAT : INDIVIDUAL_OUTPUT_FORMAT}`
  }

  return [
    `토론 주제: ${topic}`,
    round === '반론' && counterOpinion
      ? `[상대 부서 입장]\n${DEPARTMENTS[counterOpinion.dept].name} / ${counterOpinion.agentName}\n${counterOpinion.content}`
      : '',
    '[참여 인원]',
    formatParticipantRoster(teamPlan.participants),
    '[역할 분업]',
    formatAssignmentRoster(teamPlan.assignments, teamPlan.mode),
    '[팀원별 개별 의견]',
    ...contributions.map((item, index) => `${index + 1}. ${item.agent.name} (${item.agent.role})\n${item.content}`),
    requestSection,
  ].filter(Boolean).join('\n\n')
}

function buildDebateSystemPrompt(
  agent: Agent,
  teamPlan: TeamPlan,
  assignment: TeamAssignment,
  round: '초기 의견' | '반론',
  mode: 'individual' | 'summary',
  stance?: Stance,
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
    stance ? `⚖️ 배정 입장: ${stance}측 — 이 입장을 논리적으로 최대한 강력하게 옹호하라. 개인적 견해가 달라도 배정된 역할에 충실하라.` : '',
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
