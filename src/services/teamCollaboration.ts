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

const LEAD_ROLE_KEYWORDS = ['팀장', '리더', '리드', '총괄', '대표', 'Head', 'Lead']
const MODEL_PRIORITY: Agent['model'][] = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'gpt-4o',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gpt-4o-mini',
  'claude-haiku-4-5-20251001',
]

const ROLE_STREAM_LIBRARY = [
  {
    id: 'coordination',
    keywords: ['팀장', '리더', '리드', '총괄', '대표', 'Head', 'Lead'],
    task: '우선순위·의사결정 기준·부서 실행 순서를 확정하여 지시하라.',
    debate: '부서 공식 입장과 핵심 주장을 명확히 제시하라.',
  },
  {
    id: 'strategy',
    keywords: ['전략', '포트폴리오', '비서', '일정'],
    task: '사업 우선순위·일정 제약·대표 의사결정 포인트를 확정하여 제출하라.',
    debate: '전략 적합성과 실행 타이밍 관점의 근거를 제시합니다.',
  },
  {
    id: 'research',
    keywords: ['R&D', '연구', '기질', '창업자', '조직'],
    task: '진단 주제·검증 단계·연구 리스크를 분석하여 결론과 다음 단계를 제출하라.',
    debate: '진단 타당성과 상용화 가능성 관점의 근거를 제시합니다.',
  },
  {
    id: 'data',
    keywords: ['데이터', '통계', '리포트', '프로파일'],
    task: '데이터 구조·지표·리포트 자동화 설계를 즉시 작성하여 제출하라.',
    debate: '데이터 해석 가능성과 지표 신뢰도 관점의 근거를 제시합니다.',
  },
  {
    id: 'development',
    keywords: ['개발', '자동화', '파이프라인', '도구', 'API'],
    task: '구현 코드·연동 설계·기술 작업 분해를 즉시 작성하여 제출하라.',
    debate: '기술 실현 가능성과 유지보수 비용 관점의 근거를 제시합니다.',
  },
  {
    id: 'qa',
    keywords: ['오류', '검증', '테스트', '트래킹'],
    task: '오류 재현 절차·검증 결론·처리안을 즉시 작성하여 제출하라.',
    debate: '품질 리스크와 검증 필요성 관점의 근거를 제시합니다.',
  },
  {
    id: 'operations',
    keywords: ['운영', '라이선스', '백업', '권한', '알림'],
    task: '운영 절차, 자동화 흐름, 장애 대응 포인트를 정리합니다.',
    debate: '운영 안정성과 반복 업무 부담 관점의 근거를 제시합니다.',
  },
  {
    id: 'education',
    keywords: ['교육', '강사', '자격증', '시험', '강의'],
    task: '교육 과정, 강사 운영, 자격 발급 절차를 정리합니다.',
    debate: '교육 운영 가능성과 품질 유지 조건 관점의 근거를 제시합니다.',
  },
  {
    id: 'sales',
    keywords: ['세일즈', '영업', '리드', '계약', '라이선스'],
    task: '고객 가치, 제안 포인트, 계약 파이프라인을 정리합니다.',
    debate: '매출 가능성과 고객 니즈 관점의 근거를 제시합니다.',
  },
  {
    id: 'marketing',
    keywords: ['마케팅', '콘텐츠', '캠페인', '브랜드'],
    task: '메시지, 타겟, 채널, 전환 포인트를 정리합니다.',
    debate: '시장 메시지와 타겟 커뮤니케이션 관점의 근거를 제시합니다.',
  },
  {
    id: 'management',
    keywords: ['경영', '회계', '세무', '행정', '재무'],
    task: '비용, 매출, 증빙, 행정 절차 영향을 정리합니다.',
    debate: '운영 부담과 재무 리스크 관점의 근거를 제시합니다.',
  },
]

const DEFAULT_STREAMS: Record<DepartmentId, Record<CollaborationMode, Array<{ id: string; text: string }>>> = {
  ceo: {
    task: [
      { id: 'ceo-priority', text: '전사 우선순위와 의사결정 기준을 정리합니다.' },
      { id: 'ceo-risk', text: '핵심 리스크와 승인 포인트를 정리합니다.' },
      { id: 'ceo-execution', text: '실행 순서와 후속 지원 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'ceo-thesis', text: '주장의 전사 관점 핵심 쟁점을 정리합니다.' },
      { id: 'ceo-risk', text: '반대 논리와 실패 조건을 정리합니다.' },
      { id: 'ceo-decision', text: '최종 의사결정 기준과 대안을 정리합니다.' },
    ],
  },
  executive: {
    task: [
      { id: 'exec-schedule', text: '일정, 미팅, 우선순위 충돌을 정리합니다.' },
      { id: 'exec-strategy', text: '사업 포트폴리오와 전략 적합성을 정리합니다.' },
      { id: 'exec-dependency', text: '부서 간 의존성과 실행 순서를 정리합니다.' },
    ],
    debate: [
      { id: 'exec-position', text: '전략 관점의 찬반 논리와 판단 기준을 정리합니다.' },
      { id: 'exec-risk', text: '일정과 운영 리스크를 짚습니다.' },
      { id: 'exec-tradeoff', text: '대안과 의사결정 조건을 정리합니다.' },
    ],
  },
  security: {
    task: [
      { id: 'rnd-stage', text: '진단 연구의 현재 단계와 다음 검증 과제를 정리합니다.' },
      { id: 'rnd-validity', text: '문항, 척도, 해석 로직의 검증 필요사항을 정리합니다.' },
      { id: 'rnd-commercial', text: '상용화 가능성과 테스트베드 조건을 정리합니다.' },
    ],
    debate: [
      { id: 'rnd-claim', text: '진단 연구 필요성과 타당성 근거를 정리합니다.' },
      { id: 'rnd-counter', text: '반대 의견의 검증 공백과 연구 리스크를 짚습니다.' },
      { id: 'rnd-condition', text: '허용 가능한 출시 조건과 최소 검증선을 정리합니다.' },
    ],
  },
  compliance: {
    task: [
      { id: 'data-structure', text: '진단 데이터 구조와 필수 필드를 정리합니다.' },
      { id: 'data-report', text: '기관 보고용 통계와 리포트 자동화 항목을 정리합니다.' },
      { id: 'data-governance', text: '개인정보, 익명화, 접근 권한 조건을 정리합니다.' },
    ],
    debate: [
      { id: 'data-claim', text: '데이터 활용 필요성과 지표 설계 근거를 정리합니다.' },
      { id: 'data-risk', text: '해석 오류와 민감 데이터 리스크를 짚습니다.' },
      { id: 'data-condition', text: '활용 조건과 데이터 품질 기준을 정리합니다.' },
    ],
  },
  management: {
    task: [
      { id: 'management-finance', text: '비용, 매출, 세무 자료 영향을 정리합니다.' },
      { id: 'management-admin', text: '행정 절차와 증빙 관리 항목을 정리합니다.' },
      { id: 'management-contract', text: '계약, 정산, 외주 운영 리스크를 정리합니다.' },
    ],
    debate: [
      { id: 'management-claim', text: '경영지원 관점의 찬반 논리와 부담을 정리합니다.' },
      { id: 'management-risk', text: '재무와 행정 통제 리스크를 짚습니다.' },
      { id: 'management-condition', text: '실행 가능한 조건과 제약을 정리합니다.' },
    ],
  },
  development: {
    task: [
      { id: 'dev-architecture', text: '자동화 구현 구조와 변경 범위를 정리합니다.' },
      { id: 'dev-integration', text: '데이터, 리포트, API 연동 영향을 정리합니다.' },
      { id: 'dev-delivery', text: '개발 순서와 작업 분해 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'dev-claim', text: '기술적으로 가능한 방향과 장점을 정리합니다.' },
      { id: 'dev-counter', text: '상대 의견의 기술적 한계와 구현 비용을 짚습니다.' },
      { id: 'dev-condition', text: '실행 가능 조건과 필요한 전제를 정리합니다.' },
    ],
  },
  qa: {
    task: [
      { id: 'qa-repro', text: '오류 재현 절차와 영향 범위를 정리합니다.' },
      { id: 'qa-edge', text: '예외 케이스와 실패 조건을 정리합니다.' },
      { id: 'qa-criteria', text: '승인 기준과 검증 범위를 정리합니다.' },
    ],
    debate: [
      { id: 'qa-claim', text: '검증 관점 찬반 근거를 정리합니다.' },
      { id: 'qa-counter', text: '검증되지 않은 가정과 누락 테스트 포인트를 짚습니다.' },
      { id: 'qa-condition', text: '허용 가능한 품질 조건과 검증 전제를 정리합니다.' },
    ],
  },
  devops: {
    task: [
      { id: 'ops-workflow', text: '운영 자동화 스크립트·절차·체크리스트를 즉시 완성하여 제출하라.' },
      { id: 'ops-runtime', text: '운영 안정성과 백업 영향을 정리합니다.' },
      { id: 'ops-recovery', text: '복구, 권한, 알림 절차를 정리합니다.' },
    ],
    debate: [
      { id: 'ops-claim', text: '운영 관점 찬반 근거를 정리합니다.' },
      { id: 'ops-counter', text: '운영 리스크와 상대 논리의 약점을 짚습니다.' },
      { id: 'ops-condition', text: '운영 가능 조건과 안전장치를 정리합니다.' },
    ],
  },
  planning: {
    task: [
      { id: 'plan-scope', text: '제품 범위와 고객군을 정리합니다.' },
      { id: 'plan-priority', text: '우선순위와 일정 영향을 정리합니다.' },
      { id: 'plan-dependency', text: '의존성과 의사결정 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'plan-claim', text: '제품 적합성과 우선순위 근거를 정리합니다.' },
      { id: 'plan-counter', text: '상대 논리의 범위 문제와 누락 요구를 짚습니다.' },
      { id: 'plan-condition', text: '수용 가능한 범위와 실행 조건을 정리합니다.' },
    ],
  },
  support: {
    task: [
      { id: 'edu-course', text: '교육 과정과 강사 운영 영향을 정리합니다.' },
      { id: 'edu-certificate', text: '자격증, 시험, 채점, 결과 안내 절차를 정리합니다.' },
      { id: 'edu-record', text: '강의 이력과 발급 대장 관리 항목을 정리합니다.' },
    ],
    debate: [
      { id: 'edu-claim', text: '교육 운영 관점 찬반 근거를 정리합니다.' },
      { id: 'edu-counter', text: '운영 부담과 품질 유지 리스크를 짚습니다.' },
      { id: 'edu-condition', text: '운영 가능한 조건과 최소 준비물을 정리합니다.' },
    ],
  },
  sales: {
    task: [
      { id: 'sales-value', text: '고객 가치·세일즈 메시지·제안서 초안을 즉시 작성하여 제출하라.' },
      { id: 'sales-pipeline', text: '리드, 계약, 라이선스 진행 상태를 정리합니다.' },
      { id: 'sales-position', text: '제안 포지션과 반론 대응 논리를 정리합니다.' },
    ],
    debate: [
      { id: 'sales-claim', text: '사업성, 고객 수요, 계약 영향 근거를 정리합니다.' },
      { id: 'sales-counter', text: '상대 논리의 상업적 한계와 세일즈 리스크를 짚습니다.' },
      { id: 'sales-condition', text: '수용 가능한 제안 조건과 거래 전제를 정리합니다.' },
    ],
  },
  presales: {
    task: [
      { id: 'research-topic', text: 'HR, 창업, AI, 경제/시사 주제별 정보를 정리합니다.' },
      { id: 'research-insight', text: '지음과깃듬 적용 인사이트와 기회를 정리합니다.' },
      { id: 'research-risk', text: '확인 필요 사실과 후속 조사 질문을 정리합니다.' },
    ],
    debate: [
      { id: 'research-claim', text: '외부 트렌드와 인사이트 근거를 정리합니다.' },
      { id: 'research-counter', text: '상대 논리의 근거 부족과 시장 리스크를 짚습니다.' },
      { id: 'research-condition', text: '적용 가능한 조건과 추가 검증 항목을 정리합니다.' },
    ],
  },
  marketing: {
    task: [
      { id: 'mkt-message', text: '완성된 카피·콘텐츠·캠페인 기획을 즉시 작성하여 제출하라.' },
      { id: 'mkt-audience', text: '타겟 고객과 전달 채널을 정리합니다.' },
      { id: 'mkt-risk', text: '커뮤니케이션 리스크와 보완점을 정리합니다.' },
    ],
    debate: [
      { id: 'mkt-claim', text: '시장 메시지와 전환 효과 근거를 정리합니다.' },
      { id: 'mkt-counter', text: '상대 논리의 전달 약점과 시장 리스크를 짚습니다.' },
      { id: 'mkt-condition', text: '타겟 메시지 조건과 주의점을 정리합니다.' },
    ],
  },
  finance: {
    task: [
      { id: 'fin-cashflow', text: '매출·비용·현금흐름 영향을 정리합니다.' },
      { id: 'fin-tax', text: '세무 신고·증빙·세금계산서 처리 항목을 정리합니다.' },
      { id: 'fin-risk', text: '재무 리스크와 누락 가능 항목을 정리합니다.' },
    ],
    debate: [
      { id: 'fin-claim', text: '재무 관점 찬반 근거를 정리합니다.' },
      { id: 'fin-counter', text: '상대 논리의 비용·수익 약점을 짚습니다.' },
      { id: 'fin-condition', text: '재무적으로 수용 가능한 조건을 정리합니다.' },
    ],
  },
  hr: {
    task: [
      { id: 'hr-recruit', text: '채용 공고·온보딩·계약서 항목을 정리합니다.' },
      { id: 'hr-admin', text: '급여·4대보험·근태 관리 처리 포인트를 정리합니다.' },
      { id: 'hr-compliance', text: '노동법·행정 의무 사항과 리스크를 정리합니다.' },
    ],
    debate: [
      { id: 'hr-claim', text: '인사 관점 찬반 근거를 정리합니다.' },
      { id: 'hr-counter', text: '조직 운영 부담과 법적 리스크를 짚습니다.' },
      { id: 'hr-condition', text: '인사 운영 가능한 조건과 전제를 정리합니다.' },
    ],
  },
  legal: {
    task: [
      { id: 'leg-ip', text: '저작권·특허·상표 등록 관련 항목을 정리합니다.' },
      { id: 'leg-contract', text: '계약서 리스크와 필수 조항을 정리합니다.' },
      { id: 'leg-privacy', text: '개인정보보호법·규제 준수 포인트를 정리합니다.' },
    ],
    debate: [
      { id: 'leg-claim', text: '법무 관점 찬반 근거를 정리합니다.' },
      { id: 'leg-counter', text: '법적 리스크와 상대 논리의 취약점을 짚습니다.' },
      { id: 'leg-condition', text: '법적으로 수용 가능한 조건과 전제를 정리합니다.' },
    ],
  },
  customer: {
    task: [
      { id: 'cs-classify', text: '문의 유형 분류와 1차 안내 문구를 정리합니다.' },
      { id: 'cs-escalation', text: '내부 에스컬레이션 기준과 처리 경로를 정리합니다.' },
      { id: 'cs-followup', text: '후속 조치와 고객 안내 타임라인을 정리합니다.' },
    ],
    debate: [
      { id: 'cs-claim', text: '고객 경험 관점 찬반 근거를 정리합니다.' },
      { id: 'cs-counter', text: '대응 리스크와 신뢰 영향을 짚습니다.' },
      { id: 'cs-condition', text: '고객 서비스 가능한 조건과 경계를 정리합니다.' },
    ],
  },
  b2g: {
    task: [
      { id: 'b2g-eligibility', text: '공모 적격 여부와 사업 범위를 정리합니다.' },
      { id: 'b2g-proposal', text: '제안서 구성과 차별화 포인트를 정리합니다.' },
      { id: 'b2g-deadline', text: '마감일·서류·납품 일정을 정리합니다.' },
    ],
    debate: [
      { id: 'b2g-claim', text: '공공 사업 수주 가능성과 근거를 정리합니다.' },
      { id: 'b2g-counter', text: '요건 미충족 리스크와 경쟁 취약점을 짚습니다.' },
      { id: 'b2g-condition', text: '참여 가능한 조건과 필수 전제를 정리합니다.' },
    ],
  },
  expertsales: {
    task: [
      { id: 'exp-target', text: '잠재 강사·전문가 타겟 분류를 정리합니다.' },
      { id: 'exp-message', text: '자격증 가치 메시지와 설명회 전환 전략을 정리합니다.' },
      { id: 'exp-pipeline', text: '유치 파이프라인과 후속 연결 경로를 정리합니다.' },
    ],
    debate: [
      { id: 'exp-claim', text: '전문가 양성 세일즈 가능성과 근거를 정리합니다.' },
      { id: 'exp-counter', text: '수요 불확실성과 경쟁 대안을 짚습니다.' },
      { id: 'exp-condition', text: '수용 가능한 세일즈 조건과 전제를 정리합니다.' },
    ],
  },
  global: {
    task: [
      { id: 'glb-market', text: '목표 국가·시장 분류와 진입 가능성을 정리합니다.' },
      { id: 'glb-partner', text: '현지 파트너 발굴 방법과 계약 구조를 정리합니다.' },
      { id: 'glb-risk', text: '현지 규제·문화 리스크와 현지화 필요 항목을 정리합니다.' },
    ],
    debate: [
      { id: 'glb-claim', text: '글로벌 진출 가능성과 근거를 정리합니다.' },
      { id: 'glb-counter', text: '시장 리스크와 상대 논리의 취약점을 짚습니다.' },
      { id: 'glb-condition', text: '진출 가능한 조건과 최소 전제를 정리합니다.' },
    ],
  },
  trend: {
    task: [
      { id: 'trd-signal', text: 'AI·HR·창업·교육 분야 기회 신호를 정리합니다.' },
      { id: 'trd-apply', text: '지음과깃듬 적용 가능한 인사이트를 정리합니다.' },
      { id: 'trd-verify', text: '확인 필요 정보와 후속 조사 항목을 정리합니다.' },
    ],
    debate: [
      { id: 'trd-claim', text: '트렌드 근거와 사업 기회 논리를 정리합니다.' },
      { id: 'trd-counter', text: '과장된 해석과 시장 불확실성을 짚습니다.' },
      { id: 'trd-condition', text: '적용 가능한 조건과 검증 전제를 정리합니다.' },
    ],
  },
}

const GENERIC_STREAMS: Record<CollaborationMode, Array<{ id: string; text: string }>> = {
  task: [
    { id: 'generic-scope', text: '핵심 요구사항을 분석하고 완성된 결과물을 즉시 제출하라.' },
    { id: 'generic-risk', text: '리스크를 분석하고 해결안을 포함한 결과물을 즉시 제출하라.' },
    { id: 'generic-next', text: '지금 바로 실행 가능한 다음 단계와 결과물을 완성하여 제출하라.' },
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
