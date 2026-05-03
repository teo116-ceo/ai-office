import { DEPARTMENTS, type Agent, type DepartmentId } from '@/types'

export const MAX_TEAM_PARTICIPANTS = 3

export type CollaborationMode = 'task' | 'debate'

export type TeamAssignment = {
  agent: Agent
  workstream: string
  workstreamId: string
  isCoordinator: boolean
}

export type TeamPlan = {
  departmentId: DepartmentId
  participants: Agent[]
  assignments: TeamAssignment[]
  coordinator: TeamAssignment
  hasFormalLead: boolean
  mode: CollaborationMode
}

const LEAD_ROLE_KEYWORDS = ['팀장', '리더', '수석', '대표', 'CTO', 'COO', 'Head', 'Lead']
const MODEL_PRIORITY: Agent['model'][] = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'gpt-4o',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gpt-4o-mini',
  'claude-haiku-4-5-20251001',
]

const ROLE_STREAM_LIBRARY = [
  {
    id: 'coordination',
    keywords: ['팀장', '리더', '수석', '대표', 'CTO', 'COO', 'Head', 'Lead'],
    task: '우선순위, 의사결정 기준, 부서 실행 순서를 정리합니다.',
    debate: '부서 입장 구조, 핵심 논점, 결론 방향을 정리합니다.',
  },
  {
    id: 'backend',
    keywords: ['백엔드', '서버', 'API', '플랫폼'],
    task: '서버, API, 데이터 흐름과 구현 난이도를 검토합니다.',
    debate: '기술 구조와 실행 가능성 근거를 제시합니다.',
  },
  {
    id: 'frontend',
    keywords: ['프론트', 'UI', '웹', '모바일'],
    task: '사용자 흐름, 화면 변경, 클라이언트 영향 범위를 검토합니다.',
    debate: '사용자 경험과 인터페이스 관점 근거를 제시합니다.',
  },
  {
    id: 'fullstack',
    keywords: ['풀스택'],
    task: '클라이언트-서버 연동 경계와 전체 변경 범위를 검토합니다.',
    debate: '엔드투엔드 영향과 통합 관점 근거를 제시합니다.',
  },
  {
    id: 'qa',
    keywords: ['QA', '테스트', '품질'],
    task: '회귀 위험, 테스트 시나리오, 검증 기준을 정리합니다.',
    debate: '검증 가능성과 실패 시나리오 관점 근거를 제시합니다.',
  },
  {
    id: 'devops',
    keywords: ['DevOps', '인프라', 'SRE', '클라우드'],
    task: '배포, 인프라, 운영 안정성, 롤백 관점을 검토합니다.',
    debate: '운영 부담, 배포 리스크, 관제 영향 관점 근거를 제시합니다.',
  },
  {
    id: 'security',
    keywords: ['보안', '취약', '위협'],
    task: '위협, 공격면, 통제 방안을 검토합니다.',
    debate: '보안 위험과 통제 필요성 관점 근거를 제시합니다.',
  },
  {
    id: 'planning',
    keywords: ['기획', 'PM', '프로덕트', '제품'],
    task: '요구사항, 범위, 일정, 우선순위를 정리합니다.',
    debate: '요구사항 적합성과 범위 통제 관점 근거를 제시합니다.',
  },
  {
    id: 'support',
    keywords: ['지원', '고객성공', 'CSM', '헬프'],
    task: '사용자 영향, 운영 대응, 현장 커뮤니케이션을 정리합니다.',
    debate: '사용자 영향과 지원 난이도 관점 근거를 제시합니다.',
  },
  {
    id: 'sales',
    keywords: ['영업', '세일즈', '어카운트'],
    task: '고객 가치, 상업성, 제안 포인트를 정리합니다.',
    debate: '사업성, 고객 설득력, 계약 영향 관점 근거를 제시합니다.',
  },
  {
    id: 'presales',
    keywords: ['프리세일즈', '솔루션'],
    task: '솔루션 구조, 데모, 제안 적합성을 정리합니다.',
    debate: '기술 제안 구조와 도입 적합성 관점 근거를 제시합니다.',
  },
  {
    id: 'marketing',
    keywords: ['마케팅', '브랜드', '콘텐츠', '캠페인'],
    task: '메시지, 포지셔닝, 외부 전달 관점을 정리합니다.',
    debate: '시장 메시지와 대외 커뮤니케이션 관점 근거를 제시합니다.',
  },
  {
    id: 'compliance',
    keywords: ['컴플라이언스', '감사', '정책'],
    task: '정책, 규제, 감사 대응 관점을 정리합니다.',
    debate: '규제 적합성과 감사 가능성 관점 근거를 제시합니다.',
  },
  {
    id: 'management',
    keywords: ['인사', '재무', '법무', '운영'],
    task: '내부 운영, 재무, 법무, 절차 관점을 정리합니다.',
    debate: '운영 부담과 내부 통제 관점 근거를 제시합니다.',
  },
]

const DEFAULT_STREAMS: Record<DepartmentId, Record<CollaborationMode, Array<{ id: string; text: string }>>> = {
  ceo: {
    task: [
      { id: 'ceo-priority', text: '전사 우선순위와 의사결정 기준을 정리합니다.' },
      { id: 'ceo-risk', text: '핵심 리스크와 승인 포인트를 정리합니다.' },
      { id: 'ceo-execution', text: '실행 순서와 후속 지시 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'ceo-thesis', text: '주장 구조와 전사 관점 핵심 논점을 정리합니다.' },
      { id: 'ceo-risk', text: '반대 논리와 실패 조건을 정리합니다.' },
      { id: 'ceo-decision', text: '최종 의사결정 기준과 타협안을 정리합니다.' },
    ],
  },
  executive: {
    task: [
      { id: 'exec-dependency', text: '부서 간 의존성과 협업 순서를 정리합니다.' },
      { id: 'exec-priority', text: '경영 우선순위와 승인 이슈를 정리합니다.' },
      { id: 'exec-resourcing', text: '리소스 배분과 실행 장애물을 정리합니다.' },
    ],
    debate: [
      { id: 'exec-position', text: '임원 관점의 찬반 논리와 판단 기준을 정리합니다.' },
      { id: 'exec-risk', text: '조직 운영 리스크와 통제 포인트를 정리합니다.' },
      { id: 'exec-tradeoff', text: '타협안과 의사결정 조건을 정리합니다.' },
    ],
  },
  security: {
    task: [
      { id: 'security-threat', text: '위협 모델과 악용 가능성을 정리합니다.' },
      { id: 'security-control', text: '보안 통제와 우선 대응 방안을 정리합니다.' },
      { id: 'security-monitoring', text: '탐지, 모니터링, 사고 대응 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'security-claim', text: '보안 필요성과 기술적 근거를 정리합니다.' },
      { id: 'security-counter', text: '반대 의견의 취약점과 누락 리스크를 짚습니다.' },
      { id: 'security-condition', text: '허용 가능한 조건과 최소 통제선을 정리합니다.' },
    ],
  },
  compliance: {
    task: [
      { id: 'compliance-policy', text: '정책, 규제, 감사 요구사항을 정리합니다.' },
      { id: 'compliance-gap', text: '위반 가능성과 보완 조치를 정리합니다.' },
      { id: 'compliance-record', text: '증적과 문서화 요구사항을 정리합니다.' },
    ],
    debate: [
      { id: 'compliance-claim', text: '규정 준수 필요성과 근거를 정리합니다.' },
      { id: 'compliance-risk', text: '감사 실패나 규제 위반 가능성을 짚습니다.' },
      { id: 'compliance-condition', text: '허용 조건과 필수 통제 요구를 정리합니다.' },
    ],
  },
  management: {
    task: [
      { id: 'management-ops', text: '내부 운영, 인사, 재무 영향 범위를 정리합니다.' },
      { id: 'management-proc', text: '절차 변경과 승인 흐름을 정리합니다.' },
      { id: 'management-cost', text: '비용, 법무, 리소스 부담을 정리합니다.' },
    ],
    debate: [
      { id: 'management-claim', text: '운영 측면 찬반 논리와 부담을 정리합니다.' },
      { id: 'management-risk', text: '내부 통제와 비용 리스크를 짚습니다.' },
      { id: 'management-condition', text: '실행 가능한 조건과 제약을 정리합니다.' },
    ],
  },
  development: {
    task: [
      { id: 'dev-architecture', text: '구현 구조와 변경 범위를 정리합니다.' },
      { id: 'dev-integration', text: 'API, 데이터, 연동 영향 범위를 정리합니다.' },
      { id: 'dev-delivery', text: '개발 순서와 난이도, 작업 분해 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'dev-claim', text: '기술적으로 가능한 방향과 장점을 정리합니다.' },
      { id: 'dev-counter', text: '상대 의견의 기술적 한계와 구현 비용을 짚습니다.' },
      { id: 'dev-condition', text: '실행 가능 조건과 필요한 전제를 정리합니다.' },
    ],
  },
  qa: {
    task: [
      { id: 'qa-regression', text: '회귀 위험과 핵심 테스트 시나리오를 정리합니다.' },
      { id: 'qa-edge', text: '엣지 케이스와 실패 조건을 정리합니다.' },
      { id: 'qa-criteria', text: '승인 기준과 검증 범위를 정리합니다.' },
    ],
    debate: [
      { id: 'qa-claim', text: '품질 관점 찬반 근거를 정리합니다.' },
      { id: 'qa-counter', text: '검증되지 않은 가정과 누락된 테스트 포인트를 짚습니다.' },
      { id: 'qa-condition', text: '허용 가능한 품질 조건과 검증 전제를 정리합니다.' },
    ],
  },
  devops: {
    task: [
      { id: 'ops-deploy', text: '배포와 인프라 변경 포인트를 정리합니다.' },
      { id: 'ops-runtime', text: '운영 안정성과 관제 영향 범위를 정리합니다.' },
      { id: 'ops-recovery', text: '롤백, 장애 대응, 운영 절차를 정리합니다.' },
    ],
    debate: [
      { id: 'ops-claim', text: '운영 관점 찬반 근거를 정리합니다.' },
      { id: 'ops-counter', text: '배포/운영 리스크와 상대 논리의 취약점을 짚습니다.' },
      { id: 'ops-condition', text: '운영 가능 조건과 안전장치를 정리합니다.' },
    ],
  },
  planning: {
    task: [
      { id: 'plan-scope', text: '요구사항과 범위를 정리합니다.' },
      { id: 'plan-priority', text: '우선순위와 일정 영향을 정리합니다.' },
      { id: 'plan-dependency', text: '의존성과 의사결정 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'plan-claim', text: '요구사항 적합성과 우선순위 근거를 정리합니다.' },
      { id: 'plan-counter', text: '상대 논리의 범위 문제와 누락 요건을 짚습니다.' },
      { id: 'plan-condition', text: '타협 가능한 범위와 실행 조건을 정리합니다.' },
    ],
  },
  support: {
    task: [
      { id: 'support-impact', text: '사용자 영향과 운영 대응 포인트를 정리합니다.' },
      { id: 'support-guide', text: '지원 가이드와 현장 커뮤니케이션을 정리합니다.' },
      { id: 'support-escalation', text: '장애 대응과 에스컬레이션 기준을 정리합니다.' },
    ],
    debate: [
      { id: 'support-claim', text: '사용자 지원 관점 찬반 근거를 정리합니다.' },
      { id: 'support-counter', text: '운영 지원 부담과 누락된 현장 이슈를 짚습니다.' },
      { id: 'support-condition', text: '지원 가능 조건과 대응 한계를 정리합니다.' },
    ],
  },
  sales: {
    task: [
      { id: 'sales-value', text: '고객 가치와 상업성을 정리합니다.' },
      { id: 'sales-pricing', text: '가격, 계약, 영업 리스크를 정리합니다.' },
      { id: 'sales-position', text: '제안 포인트와 설득 논리를 정리합니다.' },
    ],
    debate: [
      { id: 'sales-claim', text: '사업성, 고객 수요, 계약 영향 근거를 정리합니다.' },
      { id: 'sales-counter', text: '상대 논리의 상업적 한계와 영업 리스크를 짚습니다.' },
      { id: 'sales-condition', text: '수용 가능한 제안 조건과 거래 전제를 정리합니다.' },
    ],
  },
  presales: {
    task: [
      { id: 'presales-solution', text: '솔루션 구조와 기술 적합성을 정리합니다.' },
      { id: 'presales-demo', text: '데모, 제안 구성, 고객 설명 포인트를 정리합니다.' },
      { id: 'presales-gap', text: '기술 격차와 보완 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'presales-claim', text: '도입 적합성과 제안 구조 근거를 정리합니다.' },
      { id: 'presales-counter', text: '상대 논리의 기술 제안상 약점을 짚습니다.' },
      { id: 'presales-condition', text: '제안 가능한 조건과 전제 사항을 정리합니다.' },
    ],
  },
  marketing: {
    task: [
      { id: 'mkt-message', text: '메시지와 포지셔닝을 정리합니다.' },
      { id: 'mkt-audience', text: '대상 고객과 전달 포인트를 정리합니다.' },
      { id: 'mkt-risk', text: '대외 커뮤니케이션 리스크와 보완점을 정리합니다.' },
    ],
    debate: [
      { id: 'mkt-claim', text: '시장 메시지와 대외 효과 관점 근거를 정리합니다.' },
      { id: 'mkt-counter', text: '상대 논리의 전달력 약점과 시장 리스크를 짚습니다.' },
      { id: 'mkt-condition', text: '대외 메시지 조건과 주의점을 정리합니다.' },
    ],
  },
}

const GENERIC_STREAMS: Record<CollaborationMode, Array<{ id: string; text: string }>> = {
  task: [
    { id: 'generic-scope', text: '핵심 요구사항과 범위를 정리합니다.' },
    { id: 'generic-risk', text: '주요 리스크와 확인 필요사항을 정리합니다.' },
    { id: 'generic-next', text: '바로 실행할 다음 단계와 의존성을 정리합니다.' },
  ],
  debate: [
    { id: 'generic-claim', text: '주장의 핵심 논리와 근거를 정리합니다.' },
    { id: 'generic-counter', text: '반대 논리의 약점과 리스크를 짚습니다.' },
    { id: 'generic-condition', text: '수용 가능한 조건과 전제를 정리합니다.' },
  ],
}

export function buildTeamPlan(
  agents: Agent[],
  departmentId: DepartmentId,
  mode: CollaborationMode,
  maxParticipants = MAX_TEAM_PARTICIPANTS,
): TeamPlan {
  const participants = getDepartmentParticipants(agents, departmentId, maxParticipants)
  const coordinatorAgent = getTeamCoordinator(participants)
  const hasFormalLead = Boolean(coordinatorAgent && isLeadAgent(coordinatorAgent))
  const usedWorkstreamIds = new Set<string>()

  const assignments = participants.map((agent, index) => {
    const stream = pickWorkstream(agent, departmentId, mode, usedWorkstreamIds, index)
    usedWorkstreamIds.add(stream.id)
    return {
      agent,
      workstream: stream.text,
      workstreamId: stream.id,
      isCoordinator: coordinatorAgent?.id === agent.id,
    }
  })

  return {
    departmentId,
    participants,
    assignments,
    coordinator: assignments.find((assignment) => assignment.isCoordinator) ?? assignments[0],
    hasFormalLead,
    mode,
  }
}

export function getDepartmentParticipants(
  agents: Agent[],
  departmentId: DepartmentId,
  maxParticipants = MAX_TEAM_PARTICIPANTS,
) {
  return sortTeamMembers(
    agents.filter((agent) => agent.departmentId === departmentId),
  ).slice(0, maxParticipants)
}

export function getTeamLead(agents: Agent[]) {
  return sortTeamMembers([...agents]).find((agent) => isLeadAgent(agent)) ?? null
}

export function getTeamCoordinator(agents: Agent[]) {
  return getTeamLead(agents) ?? sortTeamMembers([...agents])[0] ?? null
}

export function isLeadAgent(agent: Agent) {
  return LEAD_ROLE_KEYWORDS.some((keyword) => agent.role.includes(keyword))
}

export function formatParticipantRoster(agents: Agent[]) {
  return agents.map((agent) => `${agent.name}(${agent.role})`).join(', ')
}

export function formatAssignmentRoster(assignments: TeamAssignment[]) {
  return assignments
    .map((assignment, index) => (
      `${index + 1}. ${assignment.agent.name} (${assignment.agent.role})${assignment.isCoordinator ? ' [조정]' : ''}\n담당: ${assignment.workstream}`
    ))
    .join('\n')
}

export function getCoordinatorLabel(plan: TeamPlan) {
  return plan.hasFormalLead ? '팀 리드 조정' : '자동 조정'
}

function pickWorkstream(
  agent: Agent,
  departmentId: DepartmentId,
  mode: CollaborationMode,
  usedIds: Set<string>,
  index: number,
) {
  const matched = ROLE_STREAM_LIBRARY.find((entry) => entry.keywords.some((keyword) => agent.role.includes(keyword)))
  const candidates = [
    matched ? { id: `${matched.id}-${mode}`, text: matched[mode] } : null,
    ...DEFAULT_STREAMS[departmentId][mode],
    ...GENERIC_STREAMS[mode],
  ].filter(Boolean) as Array<{ id: string; text: string }>

  const uniqueCandidate = candidates.find((candidate) => !usedIds.has(candidate.id))
  if (uniqueCandidate) {
    return uniqueCandidate
  }

  return candidates[index % candidates.length] ?? {
    id: `${departmentId}-${mode}-${index}`,
    text: `${DEPARTMENTS[departmentId].name} 관점에서 핵심 판단과 다음 조치를 정리합니다.`,
  }
}

function sortTeamMembers(agents: Agent[]) {
  return [...agents].sort((left, right) => {
    const leadGap = Number(isLeadAgent(right)) - Number(isLeadAgent(left))
    if (leadGap !== 0) {
      return leadGap
    }

    const modelGap = getModelRank(left.model) - getModelRank(right.model)
    if (modelGap !== 0) {
      return modelGap
    }

    return left.name.localeCompare(right.name, 'ko')
  })
}

function getModelRank(model: Agent['model']) {
  const index = MODEL_PRIORITY.indexOf(model)
  return index === -1 ? MODEL_PRIORITY.length : index
}
