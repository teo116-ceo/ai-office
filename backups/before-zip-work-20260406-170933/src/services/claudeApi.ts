import { useAgentStore } from '@/store/agentStore'
import type { Agent, DepartmentId, FloorId, MeetingRoom, UploadedFile } from '@/types'
import { DEPARTMENTS, FLOORS } from '@/types'
import {
  applyDirective,
  buildDirectiveContext,
  buildDirectiveRegistrationMessage,
  clearDirectives,
  resolveDirectiveCommand,
  shouldInterruptAgentWork,
  syncDirectiveAgentMessages,
} from './directives'
import { buildAttachmentContext } from './fileContext'
import { callLLM } from './multiProviderApi'
import {
  buildWebhookSettings,
  buildTaskWebhookPayload,
  sendWebhook,
  sendBrowserNotification,
} from './webhookService'
import {
  buildTeamPlan,
  formatAssignmentRoster,
  getCoordinatorLabel,
  formatParticipantRoster,
  type TeamAssignment,
  type TeamPlan,
} from './teamCollaboration'

const DEBATE_TAG = '@\uD1A0\uB860'
const DEBATE_PREFIX = '\uD1A0\uB860:'
const MEETING_FLOOR_ID: FloorId = '2f'
const CORE_MEETING_DEPARTMENTS: DepartmentId[] = [
  'ceo',
  'executive',
  'planning',
  'development',
  'security',
  'qa',
  'devops',
  'compliance',
  'management',
]
export const AGENT_GROUND_RULES =
  '실제 고객, 계약, 거래, 문의, 미팅, 배포, 장애, 외부 연락이 이미 존재하거나 완료되었다고 지어내지 마세요. ' +
  '사용자가 명시한 사실과 첨부 파일에 근거해 답하고, 근거가 없으면 가정, 예시, 준비 필요사항, 제안 형태로만 표현하세요.'

export const AGENT_PROMPTS: Record<DepartmentId, string> = {
  ceo: '당신은 AI 오피스의 대표입니다. 요청을 분석하고 라우팅 및 최종 의사결정을 명확하고 간결하게 내립니다.',
  executive: '당신은 임원진입니다. 팀 간 의존성을 조율하고 요청을 실행 가능한 업무로 정리합니다.',
  planning: '당신은 기획 및 PM 리드입니다. 범위, 요구사항, 우선순위, 실행 계획을 정리합니다.',
  development: '당신은 소프트웨어 엔지니어입니다. 구현 방향, 코드 수준 판단, 구체적인 기술 변경안을 제시합니다.',
  security: '당신은 보안 전문가입니다. 위험, 공격면, 악용 가능성, 대응 방안을 분석합니다.',
  qa: '당신은 QA 엔지니어입니다. 검증 전략, 회귀 위험, 엣지 케이스, 테스트 범위를 중점적으로 봅니다.',
  devops: '당신은 DevOps 엔지니어입니다. 인프라, 배포, 운영 안정성, 런타임 관점에서 판단합니다.',
  support: '당신은 지원 담당자입니다. 사용자 영향, 장애 대응, 실무적인 다음 조치를 설명합니다.',
  sales: '당신은 영업 담당자입니다. 비즈니스 적합성, 가격 맥락, 고객 제안 관점에서 답합니다.',
  presales: '당신은 프리세일즈 엔지니어입니다. 데모, 솔루션 설계, 기술 적합성, 제안 구조를 다룹니다.',
  marketing: '당신은 마케팅 담당자입니다. 포지셔닝, 메시지, 대상 고객 적합성, 캠페인 아이디어를 정리합니다.',
  compliance: '당신은 컴플라이언스 담당자입니다. 정책, 감사 가능성, 거버넌스, 규제 요건을 검토합니다.',
  management: '당신은 경영지원 담당자입니다. 인사, 재무, 법무, 내부 운영 관점에서 조율합니다.',
}

const DEPARTMENT_KEYWORDS: Record<DepartmentId, string[]> = {
  ceo: ['@ceo', '@\uB300\uD45C', 'ceo', '\uB300\uD45C'],
  executive: ['@exec', '@executive', '@\uC784\uC6D0', 'executive', 'cto', 'coo', '\uC784\uC6D0'],
  planning: ['@plan', '@planning', '@\uAE30\uD68D', 'plan', 'planning', 'requirement', 'roadmap', 'prd', '\uAE30\uD68D', '\uC694\uAD6C\uC0AC\uD56D'],
  development: ['@dev', '@development', '@\uAC1C\uBC1C', 'code', 'coding', 'implement', 'implementation', 'feature', 'refactor', '\uAC1C\uBC1C', '\uCF54\uB4DC', '\uAD6C\uD604'],
  security: ['@security', '@\uBCF4\uC548', 'security', 'vulnerability', 'threat', 'risk', '\uBCF4\uC548', '\uCDE8\uC57D\uC810'],
  qa: ['@qa', 'qa', 'test', 'testing', 'verify', 'regression', 'bug', '\uD14C\uC2A4\uD2B8', '\uAC80\uC99D', '\uBC84\uADF8'],
  devops: ['@devops', '@ops', '@\uC778\uD504\uB77C', 'deploy', 'deployment', 'infra', 'server', 'ci/cd', 'pipeline', '\uBC30\uD3EC', '\uC778\uD504\uB77C', '\uC11C\uBC84'],
  support: ['@support', '@\uC9C0\uC6D0', 'support', 'ticket', 'customer issue', 'incident', 'helpdesk', '\uC9C0\uC6D0', '\uACE0\uAC1D', '\uC7A5\uC560'],
  sales: ['@sales', '@\uC601\uC5C5', 'sales', 'quote', 'pricing', 'contract', 'deal', '\uC601\uC5C5', '\uACC4\uC57D', '\uACAC\uC801'],
  presales: ['@pre', '@presales', '@\uD504\uB9AC\uC138\uC77C\uC988', 'presales', 'rfp', 'demo', 'solution design', '\uD504\uB9AC\uC138\uC77C\uC988', '\uC81C\uC548'],
  marketing: ['@mkt', '@marketing', '@\uB9C8\uCF00\uD305', 'marketing', 'campaign', 'brand', 'content', '\uB9C8\uCF00\uD305', '\uCF58\uD150\uCE20', '\uBE0C\uB79C\uB4DC'],
  compliance: ['@compliance', '@\uCEF4\uD50C\uB77C\uC774\uC5B8\uC2A4', 'compliance', 'audit', 'policy', 'regulation', '\uCEF4\uD50C\uB77C\uC774\uC5B8\uC2A4', '\uAC10\uC0AC', '\uADDC\uC81C'],
  management: ['@mgmt', '@management', '@\uACBD\uC601', 'management', 'hr', 'finance', 'legal', 'operations', '\uACBD\uC601', '\uC778\uC0AC', '\uBC95\uBB34', '\uD68C\uACC4'],
}

type ChainResult = {
  dept: DepartmentId
  agentName: string
  content: string
}

type TeamContribution = {
  agent: Agent
  content: string
}

type MeetingPlan = {
  room: MeetingRoom
  roomLabel: string
  participantLabel: string
  departmentIds: DepartmentId[]
  channelFloorId: FloorId
}

export async function getAnthropicClient() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY가 설정되지 않았습니다.')
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

async function routeByLLM(message: string): Promise<DepartmentId[]> {
  const store = useAgentStore.getState()
  const ceoAgent = store.agents.find((agent) => agent.departmentId === 'ceo')

  if (ceoAgent) {
    store.updateAgentStatus(ceoAgent.id, 'thinking', '요청을 분석해 담당 부서를 정하는 중...')
  }

  try {
    const departmentIds = Object.keys(DEPARTMENTS).join(', ')
    const raw = await callLLM({
      model: ceoAgent?.model ?? 'claude-opus-4-6',
      maxTokens: 128,
      system: [
        '당신은 AI 오피스의 업무 라우팅 담당입니다.',
        '사용자 요청을 처리할 부서 ID만 JSON 배열 형태로 반환하세요.',
        `사용 가능한 부서 ID: ${departmentIds}`,
      ].join(' '),
      messages: [{
        role: 'user',
        content: `다음 요청을 처리할 부서를 선택하세요.\n\n${message}`,
      }],
    })

    const match = raw.match(/\[[\s\S]*?\]/)
    if (match) {
      const parsed = JSON.parse(match[0]) as DepartmentId[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // 아래 키워드 라우팅으로 대체
  }

  return resolveByKeyword(message)
}

export function resolveByKeyword(message: string): DepartmentId[] {
  const { explicitlyMentioned, inferred } = resolveKeywordRouting(message)
  if (explicitlyMentioned.length > 0) return explicitlyMentioned
  if (inferred.length > 0) return inferred

  return ['planning', 'development']
}

export async function runTask(userMessage: string, attachments: UploadedFile[] = []) {
  const trimmedMessage = userMessage.trim()
  if (trimmedMessage.length === 0 && attachments.length === 0) return

  if (trimmedMessage.includes(DEBATE_TAG) || trimmedMessage.toLowerCase().startsWith(DEBATE_PREFIX.toLowerCase())) {
    const { runDebate } = await import('./debateService')
    return runDebate(trimmedMessage, attachments)
  }

  const store = useAgentStore.getState()
  const meetingPlan = resolveMeetingPlan(trimmedMessage)
  const directiveCommand = resolveDirectiveCommand(trimmedMessage, attachments, meetingPlan)
  const taskId = crypto.randomUUID()
  const submittedContent = trimmedMessage || '분석할 파일을 업로드했습니다.'
  const ceoAgent = store.agents.find((agent) => agent.departmentId === 'ceo')

  if (directiveCommand?.action === 'set' && directiveCommand.directive.channelFloorId) {
    store.setCurrentFloor(directiveCommand.directive.channelFloorId)
  } else if (meetingPlan) {
    store.setCurrentFloor(meetingPlan.channelFloorId)
  }

  const userMessageId = store.addMessage({
    sender: 'user',
    senderName: '사용자',
    content: submittedContent,
    type: 'task',
    attachments,
    taskId,
    channelFloorId: directiveCommand?.action === 'clear'
      ? directiveCommand.channelFloorId
      : directiveCommand?.action === 'set'
        ? directiveCommand.directive.channelFloorId
        : meetingPlan?.channelFloorId,
  })

  if (directiveCommand?.action === 'clear') {
    store.updateMessage(userMessageId, {
      departmentIds: directiveCommand.departmentIds,
      channelFloorId: directiveCommand.channelFloorId,
    })

    clearDirectives(directiveCommand.kind)

    store.addMessage({
      sender: ceoAgent?.id ?? 'ceo-01',
      senderName: `${ceoAgent?.name ?? '대표'} (${ceoAgent?.role ?? '대표'})`,
      content: directiveCommand.feedback,
      type: 'system',
      departmentIds: directiveCommand.departmentIds,
      channelFloorId: directiveCommand.channelFloorId,
    })
    return
  }

  if (directiveCommand?.action === 'set') {
    applyDirective(directiveCommand.directive)

    store.updateMessage(userMessageId, {
      departmentIds: directiveCommand.directive.departmentIds,
      channelFloorId: directiveCommand.directive.channelFloorId,
    })

    store.addMessage({
      sender: ceoAgent?.id ?? 'ceo-01',
      senderName: `${ceoAgent?.name ?? '대표'} (${ceoAgent?.role ?? '대표'})`,
      content: buildDirectiveRegistrationMessage(directiveCommand.directive),
      type: 'system',
      departmentIds: directiveCommand.directive.departmentIds,
      channelFloorId: directiveCommand.directive.channelFloorId,
    })

    if (directiveCommand.skipExecution) {
      return
    }
  }

  const routingPrompt = buildTaskPrompt(trimmedMessage, attachments, 'summary')
  const executionPrompt = buildTaskPrompt(trimmedMessage, attachments, 'full')

  store.addTask({
    id: taskId,
    title: buildTaskTitle(trimmedMessage, attachments),
    description: executionPrompt,
    attachments,
    assignedTo: [],
    status: 'pending',
  })

  const assignedDepts = meetingPlan?.departmentIds ?? await routeByLLM(routingPrompt)
  const scopedDepartments = uniqueDepartments(['ceo', ...assignedDepts])

  store.updateMessage(userMessageId, {
    departmentIds: scopedDepartments,
    channelFloorId: meetingPlan?.channelFloorId,
  })

  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '대표'} (${ceoAgent?.role ?? '대표'})`,
    content: buildCoordinatorMessage(assignedDepts, attachments.length, meetingPlan),
    type: 'system',
    taskId,
    departmentIds: scopedDepartments,
    channelFloorId: meetingPlan?.channelFloorId,
  })

  if (ceoAgent) {
    store.updateAgentStatus(ceoAgent.id, 'idle')
  }
  store.updateTask(taskId, { assignedTo: assignedDepts, status: 'in_progress' })

  const chain: ChainResult[] = []
  let interruptedByDirective = false

  for (const deptId of assignedDepts) {
    const chainContext = buildChainContext(chain)
    const teamResult = await executeDepartmentTeam({
      deptId,
      executionPrompt,
      chainContext,
      taskId,
      channelFloorId: meetingPlan?.channelFloorId,
      hasAttachments: attachments.length > 0,
    })

    if (teamResult.interrupted) {
      interruptedByDirective = true
    }

    if (teamResult.summary) {
      chain.push({
        dept: deptId,
        agentName: `${teamResult.summary.agent.name} / 팀 종합`,
        content: teamResult.summary.content,
      })
    }
  }

  const finalStatus = chain.length > 0 ? 'completed' : 'failed'
  const finalResult = chain.length > 0
    ? chain.map((item) => item.content).join('\n\n---\n\n')
    : interruptedByDirective
      ? '회의 지시가 우선 적용되어 기존 작업이 중단되었습니다.'
      : undefined

  store.updateTask(taskId, { status: finalStatus, result: finalResult })
  syncDirectiveAgentMessages()

  // 웹훅 + 브라우저 알림
  const finalTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
  if (finalTask) {
    const ws = buildWebhookSettings(useAgentStore.getState())
    const shouldNotify = finalStatus === 'completed' ? ws.onTaskComplete : ws.onTaskFail
    if (shouldNotify) {
      sendWebhook(ws, buildTaskWebhookPayload(finalTask)).catch((err) => console.error('[claudeApi] 웹훅 전송 실패:', err))
      sendBrowserNotification(
        finalStatus === 'completed' ? `✅ 완료: ${finalTask.title}` : `❌ 실패: ${finalTask.title}`,
        finalTask.result?.slice(0, 80) ?? '',
      )
    }
  }
}

async function executeDepartmentTeam({
  deptId,
  executionPrompt,
  chainContext,
  taskId,
  channelFloorId,
  hasAttachments,
}: {
  deptId: DepartmentId
  executionPrompt: string
  chainContext: string
  taskId: string
  channelFloorId?: FloorId
  hasAttachments: boolean
}) {
  const store = useAgentStore.getState()
  const teamPlan = buildTeamPlan(store.agents, deptId, 'task')
  if (teamPlan.participants.length === 0) {
    return { summary: null as TeamContribution | null, interrupted: false }
  }

  store.addMessage({
    sender: teamPlan.coordinator.agent.id,
    senderName: `${teamPlan.coordinator.agent.name} (${teamPlan.coordinator.agent.role})`,
    content: [
      `${DEPARTMENTS[deptId].name} 팀 검토를 시작합니다.`,
      `참여 인원: ${formatParticipantRoster(teamPlan.participants)}`,
      `조정 방식: ${getCoordinatorLabel(teamPlan)} (${teamPlan.coordinator.agent.name})`,
      '[역할 분업]',
      formatAssignmentRoster(teamPlan.assignments),
    ].join('\n'),
    type: 'system',
    taskId,
    departmentIds: [deptId],
    channelFloorId,
  })

  const contributionResults = await Promise.all(
    teamPlan.assignments.map((assignment) => collectDepartmentContribution({
      assignment,
      executionPrompt,
      chainContext,
      taskId,
      channelFloorId,
      hasAttachments,
      teamPlan,
    })),
  )

  const interrupted = contributionResults.some((result) => result.interrupted)
  const successful = contributionResults
    .map((result) => result.contribution)
    .filter(Boolean) as TeamContribution[]

  if (interrupted) {
    return { summary: null as TeamContribution | null, interrupted: true }
  }

  if (successful.length === 0) {
    return { summary: null, interrupted }
  }

  if (teamPlan.participants.length === 1) {
    return { summary: successful[0], interrupted }
  }

  const summary = await summarizeDepartmentTeam({
    teamPlan,
    executionPrompt,
    chainContext,
    contributions: successful,
    taskId,
    channelFloorId,
    hasAttachments,
  })

  return {
    summary: summary.interrupted ? null : (summary.summary ?? successful[0]),
    interrupted: summary.interrupted,
  }
}

async function collectDepartmentContribution({
  assignment,
  executionPrompt,
  chainContext,
  taskId,
  channelFloorId,
  hasAttachments,
  teamPlan,
}: {
  assignment: TeamAssignment
  executionPrompt: string
  chainContext: string
  taskId: string
  channelFloorId?: FloorId
  hasAttachments: boolean
  teamPlan: TeamPlan
}) {
  const { agent } = assignment
  const store = useAgentStore.getState()
  store.updateAgentStatus(agent.id, 'working', '분담 영역 검토 중...')

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const directiveRevisionAtStart = useAgentStore.getState().directiveRevision

    try {
      const content = await callLLM({
        model: agent.model,
        maxTokens: 768,
        system: buildAgentSystemPrompt(agent, hasAttachments, 'individual', teamPlan, assignment),
        messages: [{
          role: 'user',
          content: buildContributorTaskPrompt(assignment, executionPrompt, chainContext),
        }],
      })

      if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
        syncDirectiveAgentMessages()
        return { contribution: null as TeamContribution | null, interrupted: true }
      }

      const contribution = { agent, content }
      useAgentStore.getState().addMessage({
        sender: agent.id,
        senderName: `${agent.name} (${agent.role})`,
        content: `[개별 검토]\n${content}`,
        type: 'result',
        taskId,
        departmentIds: [agent.departmentId],
        channelFloorId,
      })
      useAgentStore.getState().updateAgentStatus(agent.id, 'idle')
      return { contribution, interrupted: false }
    } catch {
      if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
        syncDirectiveAgentMessages()
        return { contribution: null, interrupted: true }
      }

      if (attempt === 1) {
        useAgentStore.getState().addMessage({
          sender: agent.id,
          senderName: `${agent.name} (${agent.role})`,
          content: '두 번 시도했지만 개별 검토 의견을 정리하지 못했습니다.',
          type: 'result',
          taskId,
          departmentIds: [agent.departmentId],
          channelFloorId,
        })
        useAgentStore.getState().updateAgentStatus(agent.id, 'idle')
      }
    }
  }

  return { contribution: null as TeamContribution | null, interrupted: false }
}

async function summarizeDepartmentTeam({
  teamPlan,
  executionPrompt,
  chainContext,
  contributions,
  taskId,
  channelFloorId,
  hasAttachments,
}: {
  teamPlan: TeamPlan
  executionPrompt: string
  chainContext: string
  contributions: TeamContribution[]
  taskId: string
  channelFloorId?: FloorId
  hasAttachments: boolean
}) {
  const coordinator = teamPlan.coordinator.agent
  const store = useAgentStore.getState()
  store.updateAgentStatus(coordinator.id, 'thinking', '팀 의견 자동 조합 중...')
  const directiveRevisionAtStart = store.directiveRevision

  try {
    const content = await callLLM({
      model: coordinator.model,
      maxTokens: 1024,
      system: buildAgentSystemPrompt(coordinator, hasAttachments, 'lead-summary', teamPlan, teamPlan.coordinator),
      messages: [{
        role: 'user',
        content: buildTeamSummaryPrompt(executionPrompt, chainContext, teamPlan, contributions),
      }],
    })

    if (shouldInterruptAgentWork(coordinator.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return { summary: null as TeamContribution | null, interrupted: true }
    }

    const summary = { agent: coordinator, content }
    useAgentStore.getState().addMessage({
      sender: coordinator.id,
      senderName: `${coordinator.name} (${coordinator.role})`,
      content: `[자동 조합 결과]\n${content}`,
      type: 'result',
      taskId,
      departmentIds: [teamPlan.departmentId],
      channelFloorId,
    })
    useAgentStore.getState().updateAgentStatus(coordinator.id, 'idle')
    return { summary, interrupted: false }
  } catch {
    if (shouldInterruptAgentWork(coordinator.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return { summary: null, interrupted: true }
    }

    useAgentStore.getState().updateAgentStatus(coordinator.id, 'idle')
    return { summary: null, interrupted: false }
  }
}

function buildContributorTaskPrompt(
  assignment: TeamAssignment,
  executionPrompt: string,
  chainContext: string,
) {
  return [
    '[업무 요청]',
    `${executionPrompt}${chainContext}`,
    '[자동 분업 영역]',
    assignment.workstream,
    '[작성 방식]',
    `${assignment.agent.role} 관점에서 중복 없이 핵심 판단, 리스크, 다음 조치를 보고하세요.`,
  ].join('\n\n')
}

function buildTeamSummaryPrompt(
  executionPrompt: string,
  chainContext: string,
  teamPlan: TeamPlan,
  contributions: TeamContribution[],
) {
  return [
    '[업무 요청]',
    `${executionPrompt}${chainContext}`,
    '[참여 인원]',
    formatParticipantRoster(teamPlan.participants),
    '[역할 분업]',
    formatAssignmentRoster(teamPlan.assignments),
    '[팀원 개별 메모]',
    ...contributions.map((item, index) => `${index + 1}. ${item.agent.name} (${item.agent.role})\n${item.content}`),
    '[정리 요청]',
    `${DEPARTMENTS[teamPlan.departmentId].name} 팀의 공식 실행안으로 정리하세요. 중복을 제거하고, 우선순위, 핵심 리스크, 바로 실행할 다음 단계를 포함하세요.`,
  ].join('\n\n')
}

function buildAgentSystemPrompt(
  agent: Agent,
  hasAttachments: boolean,
  mode: 'individual' | 'lead-summary',
  teamPlan: TeamPlan,
  assignment: TeamAssignment,
): string {
  const deptId = agent.departmentId
  const directiveContext = buildDirectiveContext({ departmentId: deptId, mode: 'task' })
  const collaborationInstruction = mode === 'lead-summary'
    ? `당신은 ${DEPARTMENTS[deptId].name} 팀의 ${getCoordinatorLabel(teamPlan)} 담당입니다. 역할별 메모를 합쳐 부서 공식 답변을 자동 조합하세요.`
    : `당신은 ${DEPARTMENTS[deptId].name} 팀의 실무 참여자입니다. 역할 기반 자동 분업으로 '${assignment.workstream}' 영역을 담당합니다.`

  return [
    AGENT_PROMPTS[deptId],
    `현재 역할: ${agent.role}`,
    collaborationInstruction,
    AGENT_GROUND_RULES,
    directiveContext,
    hasAttachments
      ? '첨부 파일 정보가 있으면 그 내용을 우선 근거로 사용하세요. 파일이 바이너리이거나 일부만 추출된 경우에는 확인된 내용과 확인되지 않은 내용을 구분해서 설명하세요.'
      : '',
  ].filter(Boolean).join('\n\n')
}
function buildTaskPrompt(
  userMessage: string,
  attachments: UploadedFile[],
  mode: 'summary' | 'full',
): string {
  const attachmentContext = buildAttachmentContext(attachments, mode)
  const directiveContext = buildDirectiveContext({ mode: 'task' })

  return [directiveContext, userMessage, attachmentContext].filter(Boolean).join('\n\n')
}

function buildTaskTitle(userMessage: string, attachments: UploadedFile[]): string {
  if (userMessage.length > 0) {
    return userMessage.slice(0, 40)
  }

  if (attachments.length === 1) {
    return `${attachments[0].name} 분석`
  }

  return `업로드 파일 ${attachments.length}개 분석`
}

function buildChainContext(chain: ChainResult[]): string {
  if (chain.length === 0) return ''

  return [
    '',
    '[이전 부서 결과]',
    ...chain.map((result) => `[${DEPARTMENTS[result.dept].name} / ${result.agentName}]\n${result.content}`),
    '[이전 부서 결과 끝]',
    '이전 결과를 참고하되, 현재 부서의 관점에서 답변하세요.',
  ].join('\n\n')
}


function uniqueDepartments(departments: DepartmentId[]): DepartmentId[] {
  return Array.from(new Set(departments))
}

function resolveKeywordRouting(message: string) {
  const lower = message.toLowerCase()
  const explicitlyMentioned: DepartmentId[] = []
  const inferred: DepartmentId[] = []

  for (const deptId of Object.keys(DEPARTMENT_KEYWORDS) as DepartmentId[]) {
    const hasExplicitMention = DEPARTMENT_KEYWORDS[deptId].some((keyword) =>
      keyword.startsWith('@') && lower.includes(keyword.toLowerCase()),
    )
    if (hasExplicitMention) {
      explicitlyMentioned.push(deptId)
      continue
    }

    const hasKeyword = DEPARTMENT_KEYWORDS[deptId].some((keyword) =>
      !keyword.startsWith('@') && lower.includes(keyword.toLowerCase()),
    )
    if (hasKeyword) {
      inferred.push(deptId)
    }
  }

  return { explicitlyMentioned, inferred }
}

function resolveMeetingPlan(message: string): MeetingPlan | null {
  const compact = message.replace(/\s+/g, '')
  if (!looksLikeMeetingSummon(message)) {
    return null
  }

  if (compact.includes('대회의실')) {
    return {
      room: 'large',
      roomLabel: '대회의실',
      participantLabel: '전 직원 참여',
      departmentIds: Object.keys(DEPARTMENTS) as DepartmentId[],
      channelFloorId: MEETING_FLOOR_ID,
    }
  }

  if (compact.includes('중회의실')) {
    return {
      room: 'medium',
      roomLabel: '중회의실',
      participantLabel: '핵심 직원 참여',
      departmentIds: CORE_MEETING_DEPARTMENTS,
      channelFloorId: MEETING_FLOOR_ID,
    }
  }

  if (compact.includes('소회의실')) {
    return {
      room: 'small',
      roomLabel: '소회의실',
      participantLabel: '관련 부서 단위 참여',
      departmentIds: resolveSmallMeetingDepartments(message),
      channelFloorId: MEETING_FLOOR_ID,
    }
  }

  return null
}

function resolveSmallMeetingDepartments(message: string): DepartmentId[] {
  const { explicitlyMentioned, inferred } = resolveKeywordRouting(message)
  if (explicitlyMentioned.length > 0) return explicitlyMentioned
  if (inferred.length > 0) return inferred

  const currentFloor = useAgentStore.getState().currentFloor
  const floorDepartments = FLOORS[currentFloor].departments
  if (floorDepartments.length > 0) {
    return floorDepartments
  }

  return ['planning']
}

function buildCoordinatorMessage(
  assignedDepts: DepartmentId[],
  attachmentCount: number,
  meetingPlan: MeetingPlan | null,
) {
  if (meetingPlan) {
    return [
      `${meetingPlan.roomLabel} 소집`,
      `참여 범위: ${meetingPlan.participantLabel}`,
      `참여 부서: ${assignedDepts.map((deptId) => DEPARTMENTS[deptId].name).join(', ')}`,
      attachmentCount > 0 ? `첨부 파일: ${attachmentCount}개` : '',
    ].filter(Boolean).join('\n')
  }

  return [
    `배정된 부서: ${assignedDepts.map((deptId) => DEPARTMENTS[deptId].name).join(', ')}`,
    attachmentCount > 0 ? `첨부 파일: ${attachmentCount}개` : '',
  ].filter(Boolean).join('\n')
}

function looksLikeMeetingSummon(message: string) {
  const compact = message.replace(/\s+/g, '')
  const questionKeywords = ['어떻게', '뭐야', '무엇', '가능해', '되나', '맞아', '이해돼', '하면']
  if (compact.includes('?') || questionKeywords.some((keyword) => message.includes(keyword))) {
    return false
  }

  const summonKeywords = [
    '모이',
    '모입시다',
    '모여',
    '집합',
    '집결',
    '소집',
    '참석',
    '해주세요',
    '하세요',
    '합시다',
    '검토해',
    '논의해',
  ]

  return summonKeywords.some((keyword) => message.includes(keyword))
}
