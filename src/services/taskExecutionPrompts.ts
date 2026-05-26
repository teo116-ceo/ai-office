import type { Agent, DepartmentId, UploadedFile } from '@/types'
import { DEPARTMENTS } from '@/types'
import { buildDirectiveContext } from './directives'
import { buildAttachmentContext } from './fileContext'
import type { OutputFileInfo } from './agentTools'
import {
  formatAssignmentRoster,
  formatParticipantRoster,
  getCoordinatorLabel,
  type TeamAssignment,
  type TeamPlan,
} from './teamCollaboration'
import { buildTaskTitle as buildTaskTitleValue } from '@/utils/taskTitle'
import { AGENT_GROUND_RULES, AGENT_PROMPTS, AGENT_PERSONA_PROMPTS } from '@/config/prompts/agentPrompts'

export { AGENT_GROUND_RULES, AGENT_PROMPTS }

const MAX_CHAIN_CHARS = 1_200
const MAX_PRIOR_CHARS = 700
const MAX_CHAIN_ITEMS = 3

export interface ChainResultLike {
  dept: DepartmentId
  agentName: string
  content: string
}

export interface TeamContributionLike {
  agent: Pick<Agent, 'name' | 'role'>
  content: string
}

export function resolveAgentPersonaPrompt(agent: Pick<Agent, 'id'>): string {
  return AGENT_PERSONA_PROMPTS[agent.id] ?? ''
}

export function buildContributorTaskPrompt(
  assignment: TeamAssignment,
  executionPrompt: string,
  chainContext: string,
  priorContributions: TeamContributionLike[] = [],
  injectedFiles: string[] = [],
) {
  const priorContext = priorContributions.length > 0
    ? [
        '[앞선 실행 결과]',
        ...priorContributions.map((contribution) =>
          `${contribution.agent.name} (${contribution.agent.role}):\n${truncate(contribution.content, MAX_PRIOR_CHARS)}`),
        '위 내용을 반복하지 말고, 자신의 담당 영역에서 추가 가치가 있는 내용만 보강하세요.',
      ].join('\n\n')
    : ''

  const fileContext = injectedFiles.length > 0
    ? ['[이전 부서가 남긴 파일 내용]', ...injectedFiles].join('\n\n')
    : ''

  return [
    '[업무 요청]',
    `${executionPrompt}${chainContext}`,
    fileContext,
    priorContext,
    '[자동 분업 역할]',
    assignment.workstream,
    '[작성 방식]',
    `${assignment.agent.role} 관점에서 중복 없이 핵심 판단, 리스크, 다음 조치를 보고하세요.`,
  ].filter(Boolean).join('\n\n')
}

export function buildTeamSummaryPrompt(
  executionPrompt: string,
  chainContext: string,
  teamPlan: TeamPlan,
  contributions: TeamContributionLike[],
) {
  return [
    '[업무 요청]',
    `${executionPrompt}${chainContext}`,
    '[참여 인원]',
    formatParticipantRoster(teamPlan.participants),
    '[분업 내역]',
    formatAssignmentRoster(teamPlan.assignments, teamPlan.mode),
    '[개별 메모]',
    ...contributions.map((item, index) => `${index + 1}. ${item.agent.name} (${item.agent.role})\n${item.content}`),
    '[정리 요청]',
    `${DEPARTMENTS[teamPlan.departmentId].name} 팀장 보고처럼 정리하세요. 중복은 제거하고, 우선순위, 핵심 리스크, 바로 실행할 다음 단계까지 포함하세요.`,
  ].join('\n\n')
}

export function buildAgentSystemPrompt(
  agent: Agent,
  hasAttachments: boolean,
  mode: 'individual' | 'lead-summary',
  teamPlan: TeamPlan,
  assignment: TeamAssignment,
  availableFiles: OutputFileInfo[] = [],
  priorTaskFiles: string[] = [],
): string {
  const departmentId = agent.departmentId
  const directiveContext = buildDirectiveContext({ departmentId, mode: 'task' })
  const collaborationInstruction = mode === 'lead-summary'
    ? `당신은 ${DEPARTMENTS[departmentId].name} 팀의 ${getCoordinatorLabel(teamPlan)}입니다. 팀원 메모를 종합해 부서 공식 응답으로 정리하세요.`
    : `당신은 ${DEPARTMENTS[departmentId].name} 팀의 실행 담당자입니다. 분업 결과 '${assignment.workstream}' 영역을 맡고 있습니다.`

  const handoffContext = priorTaskFiles.length > 0
    ? [
        '[이전 부서가 만든 파일이 있습니다. 필요하면 read_file로 읽어 이어서 작업하세요.]',
        ...priorTaskFiles.map((file) => `- ${file}`),
      ].join('\n')
    : ''

  const filesContext = availableFiles.length > 0
    ? [
        '[워크스페이스 출력 파일]',
        '아래 파일은 다른 에이전트가 남긴 결과물입니다. 필요하면 read_file 도구로 내용을 확인할 수 있습니다.',
        ...availableFiles.map((file) =>
          `- ${file.name} (${(file.size / 1024).toFixed(1)}KB, ${new Date(file.modifiedAt).toLocaleTimeString('ko-KR')} 저장)`),
      ].join('\n')
    : ''

  return [
    AGENT_PROMPTS[departmentId],
    resolveAgentPersonaPrompt(agent),
    `현재 역할: ${agent.role}`,
    collaborationInstruction,
    AGENT_GROUND_RULES,
    directiveContext,
    handoffContext,
    filesContext,
    hasAttachments
      ? '첨부 파일이 있으면 그 내용을 최우선 근거로 사용하세요. 파일 내용이 불완전하거나 추출이 어렵다면 확인된 내용과 추정 내용을 분리해 설명하세요.'
      : '',
  ].filter(Boolean).join('\n\n')
}

export function buildTaskPrompt(
  userMessage: string,
  attachments: UploadedFile[],
  mode: 'summary' | 'full',
  sessionContext = '',
): string {
  const attachmentContext = buildAttachmentContext(attachments, mode)
  const directiveContext = buildDirectiveContext({ mode: 'task' })
  const sessionBlock = sessionContext
    ? `[직전 업무 맥락]\n${sessionContext}\n\n위 맥락은 참고만 하고, 현재 요청을 직접 처리하세요.`
    : ''

  return [directiveContext, sessionBlock, userMessage, attachmentContext].filter(Boolean).join('\n\n')
}

export function buildTaskTitle(userMessage: string, attachments: UploadedFile[]): string {
  return buildTaskTitleValue(userMessage, attachments)
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text
  }

  return `${text.slice(0, max)}\n...(이하 생략)`
}

export function buildChainContext(chain: ChainResultLike[]): string {
  if (chain.length === 0) {
    return ''
  }

  const recent = chain.slice(-MAX_CHAIN_ITEMS)
  return [
    '',
    '[이전 부서 결과]',
    ...recent.map((result) =>
      `[${DEPARTMENTS[result.dept].name} / ${result.agentName}]\n${truncate(result.content, MAX_CHAIN_CHARS)}`),
    '[이전 부서 결과 사용]',
    '이전 결과를 참고하되, 현재 부서의 관점에서 추가 판단과 실행안을 제시하세요.',
  ].join('\n\n')
}

export function uniqueDepartments(departments: DepartmentId[]): DepartmentId[] {
  return Array.from(new Set(departments))
}
