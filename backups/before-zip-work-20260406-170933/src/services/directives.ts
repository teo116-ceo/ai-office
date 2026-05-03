import { FLOOR_MAPS, T, AGENT_TILE_POSITIONS, WORK_SEAT_TILE_POSITIONS } from '@/components/office/officeLayout'
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

const ALL_DEPARTMENTS = Object.keys(DEPARTMENTS) as DepartmentId[]

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

const WALKABLE_TILES = new Set<number>([T.FLOOR, T.DOOR, T.PLANT])
const MEETING_ROOM_BOUNDS: Record<MeetingRoom, { colStart: number; colEnd: number; rowStart: number; rowEnd: number }> = {
  small: { colStart: 1, colEnd: 6, rowStart: 1, rowEnd: 13 },
  medium: { colStart: 8, colEnd: 13, rowStart: 1, rowEnd: 13 },
  large: { colStart: 16, colEnd: 24, rowStart: 1, rowEnd: 13 },
}

const MEETING_ROOM_POSITIONS = {
  small: collectMeetingPositions('small'),
  medium: collectMeetingPositions('medium'),
  large: collectMeetingPositions('large'),
}

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
      channelFloorId: '2f',
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
    resetClearedMeetingParticipants(clearedMeeting.departmentIds)
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
    .map((directive, index) => (
      `${index + 1}. ${directive.title}\n요약: ${directive.summary}\n행동 기준: ${directive.behaviorInstruction}`
    ))
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
      store.clearAgentPresence(agent.id)
      store.updateAgentStatus(agent.id, 'moving', deriveAgentDirectiveMessage(meetingDirective))
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

export function resolveAgentTile(agent: Pick<Agent, 'id' | 'departmentId' | 'status'>) {
  const meetingDirective = getLatestMeetingDirective(agent.departmentId)
  if (!meetingDirective || !meetingDirective.meetingRoom || meetingDirective.channelFloorId !== '2f') {
    const presence = useAgentStore.getState().agentPresenceById[agent.id]
    if (presence) {
      return presence.tile
    }

    return WORK_SEAT_TILE_POSITIONS[agent.id] ?? AGENT_TILE_POSITIONS[agent.id] ?? { col: 5, row: 7 }
  }

  const participants = getMeetingParticipants(meetingDirective)
  const seatIndex = participants.findIndex((candidate) => candidate.id === agent.id)
  const seats = MEETING_ROOM_POSITIONS[meetingDirective.meetingRoom]
  return seats[seatIndex] ?? seats[seats.length - 1] ?? AGENT_TILE_POSITIONS[agent.id] ?? { col: 5, row: 7 }
}

export function resolveAgentFloor(agent: Pick<Agent, 'id' | 'departmentId'>) {
  const meetingDirective = getLatestMeetingDirective(agent.departmentId)
  if (meetingDirective?.channelFloorId) {
    return meetingDirective.channelFloorId
  }

  const presence = useAgentStore.getState().agentPresenceById[agent.id]
  return presence?.floorId ?? resolveDepartmentFloor(agent.departmentId)
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

function collectMeetingPositions(room: MeetingRoom) {
  const bounds = MEETING_ROOM_BOUNDS[room]
  const map = FLOOR_MAPS['2f']
  const positions: Array<{ col: number; row: number }> = []

  for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
    for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
      if (WALKABLE_TILES.has(map[row][col])) {
        positions.push({ col, row })
      }
    }
  }

  return positions
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

  const completionKeywords = [
    '\uD68C\uC758\uB97C \uB9C8\uCCE4',
    '\uD68C\uC758 \uB9C8\uCCE4',
    '\uD68C\uC758\uB97C \uB9C8\uBB34\uB9AC',
    '\uD68C\uC758 \uB9C8\uBB34\uB9AC',
    '\uD68C\uC758\uB97C \uB05D\uB0C8',
    '\uD68C\uC758 \uB05D\uB0C8',
    '\uD68C\uC758 \uC644\uB8CC',
    '\uD68C\uC758\uB97C \uC885\uB8CC',
    '\uD68C\uC758 \uC885\uB8CC',
    '\uD68C\uC758 \uB05D',
    '\uD68C\uC758\uAC00 \uB05D',
    '\uD68C\uC758\uAC00 \uB05D\uB0AC',
  ]
  const returnKeywords = [
    '\uBCF5\uADC0',
    '\uB3CC\uC544\uAC00',
    '\uC790\uB9AC\uB85C',
    '\uBD80\uC11C\uB85C',
    '\uC6D0\uC704\uCE58',
    '\uC5C5\uBB34 \uC704\uCE58',
  ]
  const meetingKeywords = [
    '\uD68C\uC758',
    '\uB300\uD68C\uC758\uC2E4',
    '\uC911\uD68C\uC758\uC2E4',
    '\uC18C\uD68C\uC758\uC2E4',
  ]

  return (
    includesNormalized(message, completionKeywords)
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

function resetClearedMeetingParticipants(departmentIds: DepartmentId[]) {
  const store = useAgentStore.getState()
  const meetingMessageKeywords = [
    '\uD68C\uC758',
    '\uD68C\uC758\uC2E4',
    '\uC9D1\uACB0',
    '\uD611\uC758',
    '\uBCF5\uADC0',
  ]

  for (const agent of store.agents) {
    if (!departmentIds.includes(agent.departmentId) || hasActiveMeetingDirective(agent.departmentId)) {
      continue
    }

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
