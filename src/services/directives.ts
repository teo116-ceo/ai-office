import { useAgentStore } from '@/store/agentStore'
import {
  Agent,
  DEPARTMENTS,
  DEPT_FLOOR,
  DepartmentId,
  DirectiveKind,
  FloorId,
  MeetingRoom,
  OrganizationDirective,
  UploadedFile,
} from '@/types'
import { buildAttachmentContext } from './fileContext'

type MeetingPlan = {
  room: MeetingRoom
  roomLabel: string
  participantLabel: string
  departmentIds: DepartmentId[]
  channelFloorId: FloorId
}

type DirectiveCommand =
  | {
      action: 'set'
      directive: Omit<OrganizationDirective, 'id' | 'createdAt'>
      skipExecution: boolean
    }
  | {
      action: 'clear'
      kind?: DirectiveKind
      feedback: string
      departmentIds: DepartmentId[]
      channelFloorId?: FloorId
    }

type MeetingDismissalRoutine = {
  id: string
  timer: ReturnType<typeof setTimeout>
}

const ALL_DEPARTMENTS = Object.keys(DEPARTMENTS) as DepartmentId[]
const activeMeetingDismissals = new Map<string, MeetingDismissalRoutine>()
const MEETING_DISMISS_MESSAGE = '회의를 마치고 복귀 중'

const COMPANY_ANNOUNCEMENT_PREFIXES = [
  '전사 공지',
  '전직원 공지',
  '전 직원 공지',
  '전체 공지',
  '전사 지침',
  '전사 안내',
  '전직원 안내',
  '전 직원 안내',
]

const CLEAR_ALL_KEYWORDS = ['전사 공지 해제', '전사 지침 해제', '공지 해제', '지침 해제']
const CLEAR_MEETING_KEYWORDS = ['회의 종료', '회의 해산', '집합 해제', '해산하세요', '복귀하세요', '원위치 복귀']
const EXECUTION_KEYWORDS = ['분석', '검토', '정리', '작업', '토론', '보고', '작성', '설계', '대응', '계획', '요약', '도출', '제안']
const QUESTION_KEYWORDS = ['어떻게', '뭐야', '무엇', '가능해', '되나', '돼', '맞아', '이해돼', '알려줘']
const DIRECTIVE_TONE_KEYWORDS = [
  '하세요',
  '해주세요',
  '합시다',
  '하자',
  '시행',
  '적용',
  '준수',
  '공지합니다',
  '안내합니다',
  '지시합니다',
]
const MEETING_ACTION_KEYWORDS = [
  '모이',
  '모입시다',
  '모여',
  '집합',
  '집결',
  '소집',
  '참석',
  '들어와',
  '회의',
  '검토해',
  '논의해',
  '논의합시다',
]

const DIRECTIVE_MESSAGE_SET = new Set([
  '대회의실 집결 중',
  '중회의실 집결 중',
  '소회의실 협의 중',
  '공지 반영 중',
])



export function resolveDirectiveCommand(
  message: string,
  attachments: UploadedFile[],
  meetingPlan: MeetingPlan | null,
): DirectiveCommand | null {
  const trimmed = message.trim()
  if (!trimmed) return null

  if (matchesAny(trimmed, CLEAR_ALL_KEYWORDS)) {
    return {
      action: 'clear',
      feedback: '전사 공지와 행동 지침을 해제합니다.',
      departmentIds: ALL_DEPARTMENTS,
    }
  }

  if (looksLikeMeetingClearDirective(trimmed)) {
    return {
      action: 'clear',
      kind: 'meeting',
      feedback: '회의실 집결 지시를 해제하고 각 부서 기본 위치 기준으로 복귀합니다.',
      departmentIds: ALL_DEPARTMENTS,
      channelFloorId: '1f',
    }
  }

  if (meetingPlan && looksLikeMeetingDirective(trimmed)) {
    const content = stripDirectivePrefix(trimmed) || trimmed

    return {
      action: 'set',
      skipExecution: !hasExecutionIntent(trimmed, attachments),
      directive: {
        kind: 'meeting',
        title: `${meetingPlan.roomLabel} 집결 지시`,
        content,
        summary: content,
        behaviorInstruction:
          `${meetingPlan.participantLabel} 상태로 ${meetingPlan.roomLabel} 집결을 우선 반영하고, ` +
          '이후 응답과 자율 메모에서도 이동, 집결, 대기 또는 회의 준비 상태를 기준으로 판단하세요.',
        departmentIds: meetingPlan.departmentIds,
        channelFloorId: meetingPlan.channelFloorId,
        meetingRoom: meetingPlan.room,
      },
    }
  }

  if (looksLikeAnnouncementDirective(trimmed)) {
    const content = stripDirectivePrefix(trimmed) || trimmed
    const attachmentContext = attachments.length > 0
      ? buildAttachmentContext(attachments, 'full')
      : undefined

    return {
      action: 'set',
      skipExecution: !hasExecutionIntent(trimmed, attachments),
      directive: {
        kind: 'announcement',
        title: buildDirectiveTitle(content),
        content,
        summary: content,
        behaviorInstruction:
          '이 공지를 이후 업무 판단, 우선순위, 제약조건에 지속적으로 반영하세요. ' +
          '기존 계획과 충돌하면 별도 해제 지시가 없을 때는 최신 공지를 우선합니다.',
        departmentIds: ALL_DEPARTMENTS,
        attachmentContext,
      },
    }
  }

  return null
}

export function applyDirective(directive: Omit<OrganizationDirective, 'id' | 'createdAt'>) {
  const store = useAgentStore.getState()
  store.clearDirectives(directive.kind)
  const id = store.addDirective(directive)
  syncDirectiveAgentMessages()
  return id
}

export function clearDirectives(kind?: DirectiveKind) {
  const clearedMeeting = kind !== 'announcement' ? getLatestMeetingDirective() : undefined
  const store = useAgentStore.getState()
  store.clearDirectives(kind)
  syncDirectiveAgentMessages()

  if (clearedMeeting) {
    resetClearedMeetingParticipants(clearedMeeting)
  }
}

export function buildDirectiveContext(options?: {
  departmentId?: DepartmentId
  mode?: 'task' | 'behavior' | 'debate'
}) {
  const { departmentId, mode = 'task' } = options ?? {}
  const directives = getApplicableDirectives(departmentId)
  if (directives.length === 0) return ''

  const body = directives
    .map((directive, index) => {
      const lines = [
        `${index + 1}. ${directive.title}`,
        `요약: ${directive.summary}`,
        `행동 기준: ${directive.behaviorInstruction}`,
      ]
      if (directive.attachmentContext) {
        lines.push(directive.attachmentContext)
      }
      return lines.join('\n')
    })
    .join('\n\n')

  const modeInstruction = mode === 'behavior'
    ? '현재 자율 메모와 행동 판단에서도 위 공지와 지시를 우선 반영하세요.'
    : mode === 'debate'
      ? '현재 토론과 결론 도출에서도 위 공지와 지시를 운영 제약조건으로 반영하세요.'
      : '현재 업무 판단과 실행에도 위 공지와 지시를 우선 반영하세요.'

  return ['[현재 적용 중인 전사 공지/지시]', body, modeInstruction].join('\n\n')
}

export function buildDirectiveRegistrationMessage(
  directive: Omit<OrganizationDirective, 'id' | 'createdAt'>,
) {
  return [
    directive.kind === 'meeting' ? '회의 지시 등록' : '전사 공지 등록',
    `제목: ${directive.title}`,
    `적용 범위: ${directive.departmentIds.map((departmentId) => DEPARTMENTS[departmentId].name).join(', ')}`,
    `요약: ${directive.summary}`,
    '이후 업무, 토론, 자율 메모에 자동 반영되며 새로고침 후에도 유지됩니다.',
  ].join('\n')
}

export function syncDirectiveAgentMessages() {
  const store = useAgentStore.getState()

  for (const agent of store.agents) {
    const meetingDirective = getLatestMeetingDirective(agent.departmentId)

    if (meetingDirective) {
      cancelMeetingDismissal(agent.id)
      store.updateAgentStatus(agent.id, 'moving', deriveAgentDirectiveMessage(meetingDirective))
      continue
    }

    if (activeMeetingDismissals.has(agent.id)) {
      continue
    }

    if (agent.status === 'moving' || isDirectiveMessage(agent.message)) {
      store.updateAgentStatus(agent.id, 'idle', undefined)
    }
  }
}

export function hasActiveMeetingDirective(departmentId?: DepartmentId) {
  return Boolean(getLatestMeetingDirective(departmentId))
}

export function resolveDepartmentFloor(departmentId: DepartmentId) {
  const meetingDirective = getLatestMeetingDirective(departmentId)
  return meetingDirective?.channelFloorId ?? DEPT_FLOOR[departmentId]
}

export function resolveAgentFloor(agent: Pick<Agent, 'id' | 'departmentId'>) {
  const meetingDirective = getLatestMeetingDirective(agent.departmentId)
  if (meetingDirective?.channelFloorId) {
    return meetingDirective.channelFloorId
  }

  return resolveDepartmentFloor(agent.departmentId)
}

export function shouldInterruptAgentWork(agentId: string, startedDirectiveRevision: number) {
  const store = useAgentStore.getState()
  if (store.directiveRevision === startedDirectiveRevision) {
    return false
  }

  const agent = store.agents.find((candidate) => candidate.id === agentId)
  if (!agent) {
    return false
  }

  return hasActiveMeetingDirective(agent.departmentId)
}

function getApplicableDirectives(departmentId?: DepartmentId) {
  const directives = useAgentStore.getState().directives
  const scoped = departmentId
    ? directives.filter((directive) => directive.departmentIds.includes(departmentId))
    : directives

  const latestAnnouncement = [...scoped].reverse().find((directive) => directive.kind === 'announcement')
  const latestMeeting = [...scoped].reverse().find((directive) => directive.kind === 'meeting')

  return [latestAnnouncement, latestMeeting].filter(Boolean) as OrganizationDirective[]
}

function getLatestMeetingDirective(departmentId?: DepartmentId) {
  return [...useAgentStore.getState().directives].reverse().find((directive) => (
    directive.kind === 'meeting' &&
    (!departmentId || directive.departmentIds.includes(departmentId))
  ))
}

function getMeetingParticipants(directive: OrganizationDirective) {
  return useAgentStore.getState().agents.filter((agent) => directive.departmentIds.includes(agent.departmentId))
}

function deriveAgentDirectiveMessage(directive: OrganizationDirective) {
  if (directive.meetingRoom === 'large') return '대회의실 집결 중'
  if (directive.meetingRoom === 'medium') return '중회의실 집결 중'
  if (directive.meetingRoom === 'small') return '소회의실 협의 중'
  return '공지 반영 중'
}

function buildDirectiveTitle(content: string) {
  const collapsed = content.replace(/\s+/g, ' ').trim()
  return collapsed.length > 24 ? `${collapsed.slice(0, 24)}...` : collapsed
}

function stripDirectivePrefix(message: string) {
  return message
    .replace(/^전사\s*공지\s*[:：]?\s*/i, '')
    .replace(/^전직원\s*공지\s*[:：]?\s*/i, '')
    .replace(/^전\s*직원\s*공지\s*[:：]?\s*/i, '')
    .replace(/^전체\s*공지\s*[:：]?\s*/i, '')
    .replace(/^전사\s*지침\s*[:：]?\s*/i, '')
    .replace(/^전사\s*안내\s*[:：]?\s*/i, '')
    .trim()
}

function looksLikeAnnouncementDirective(message: string) {
  if (isQuestionLike(message)) {
    return false
  }

  return COMPANY_ANNOUNCEMENT_PREFIXES.some((prefix) => message.startsWith(prefix))
    || (
      COMPANY_ANNOUNCEMENT_PREFIXES.some((prefix) => message.includes(prefix))
      && hasDirectiveTone(message)
    )
}

function looksLikeMeetingDirective(message: string) {
  return !isQuestionLike(message) && (
    hasDirectiveTone(message)
    || MEETING_ACTION_KEYWORDS.some((keyword) => message.includes(keyword))
  )
}

function looksLikeMeetingClearDirective(message: string) {
  if (isQuestionLike(message)) {
    return false
  }

  if (matchesAny(message, CLEAR_MEETING_KEYWORDS)) {
    return true
  }

  const completionPatterns = [
    /회의(?:를|는|가)?마치(?!고)/,
    /회의(?:를|는|가)?마칠/,
    /회의(?:를|는|가)?마무리(?!하고)/,
    /회의(?:를|는|가)?끝내(?!고)/,
    /회의(?:를|는|가)?끝낼/,
    /회의(?:를|는|가)?종료(?!하고)/,
    /회의(?:를|는|가)?완료(?!하고)/,
    /회의(?:는)?여기까지/,
  ]
  const completionKeywords = [
    '회의를 마쳤',
    '회의 마쳤',
    '회의를 마무리',
    '회의 마무리',
    '회의를 끝냈',
    '회의 끝냈',
    '회의 완료',
    '회의를 종료',
    '회의 종료',
    '회의 끝',
    '회의가 끝',
    '회의가 끝났',
  ]
  const returnKeywords = [
    '복귀',
    '돌아가',
    '자리로',
    '부서로',
    '원위치',
    '업무 위치',
  ]
  const meetingKeywords = [
    '회의',
    '대회의실',
    '중회의실',
    '소회의실',
  ]

  return (
    includesNormalized(message, completionKeywords)
    || matchesNormalizedPattern(message, completionPatterns)
    || (
      includesNormalized(message, returnKeywords)
      && includesNormalized(message, meetingKeywords)
    )
  )
}

function hasExecutionIntent(message: string, attachments: UploadedFile[]) {
  if (attachments.length > 0) return true
  return EXECUTION_KEYWORDS.some((keyword) => message.includes(keyword))
}

function hasDirectiveTone(message: string) {
  return DIRECTIVE_TONE_KEYWORDS.some((keyword) => message.includes(keyword))
}

function isQuestionLike(message: string) {
  const compact = message.replace(/\s+/g, '')
  return compact.includes('?') || QUESTION_KEYWORDS.some((keyword) => message.includes(keyword))
}

function isDirectiveMessage(message?: string) {
  return Boolean(message && DIRECTIVE_MESSAGE_SET.has(message))
}

function matchesAny(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword))
}

function includesNormalized(message: string, keywords: string[]) {
  const compact = message.replace(/\s+/g, '')
  return keywords.some((keyword) => {
    const compactKeyword = keyword.replace(/\s+/g, '')
    return message.includes(keyword) || compact.includes(compactKeyword)
  })
}

function matchesNormalizedPattern(message: string, patterns: RegExp[]) {
  const compact = message.replace(/\s+/g, '')
  return patterns.some((pattern) => pattern.test(compact))
}

function cancelMeetingDismissal(agentId: string) {
  const routine = activeMeetingDismissals.get(agentId)
  if (!routine) {
    return
  }

  clearTimeout(routine.timer)
  activeMeetingDismissals.delete(agentId)
}

function resetClearedMeetingParticipants(clearedMeeting: OrganizationDirective) {
  const store = useAgentStore.getState()
  const meetingMessageKeywords = ['회의', '회의실', '집결', '협의', '복귀']
  const participants = getMeetingParticipants(clearedMeeting).filter(
    (agent) => !hasActiveMeetingDirective(agent.departmentId),
  )

  if (clearedMeeting.meetingRoom && clearedMeeting.channelFloorId === '1f') {
    participants.forEach((agent, index) => {
      const dismissId = `${Date.now()}-${agent.id}-${Math.random().toString(36).slice(2, 8)}`
      const dismissMs = 700 + index * 240

      cancelMeetingDismissal(agent.id)
      store.updateAgentStatus(agent.id, 'moving', MEETING_DISMISS_MESSAGE)

      const timer = setTimeout(() => {
        const activeRoutine = activeMeetingDismissals.get(agent.id)
        if (!activeRoutine || activeRoutine.id !== dismissId || hasActiveMeetingDirective(agent.departmentId)) {
          return
        }

        activeMeetingDismissals.delete(agent.id)
        useAgentStore.getState().updateAgentStatus(agent.id, 'idle', undefined)
      }, dismissMs)

      activeMeetingDismissals.set(agent.id, { id: dismissId, timer })
    })

    return
  }

  for (const agent of participants) {
    const hasMeetingMessage = agent.message
      ? isDirectiveMessage(agent.message) || includesNormalized(agent.message, meetingMessageKeywords)
      : false

    if (agent.status === 'moving' || agent.status === 'debating' || hasMeetingMessage) {
      store.updateAgentStatus(agent.id, 'idle', undefined)
      continue
    }

    if (agent.status === 'idle' && agent.message) {
      store.updateAgentMessage(agent.id, undefined)
    }
  }
}
