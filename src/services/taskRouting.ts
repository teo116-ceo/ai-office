import { DEPARTMENTS, FLOORS, type DepartmentId, type FloorId, type MeetingRoom } from '@/types'

const CORE_MEETING_DEPARTMENTS: DepartmentId[] = [
  'ceo',
  'executive',
  'management',
  'planning',
  'security',
  'compliance',
  'development',
  'qa',
  'sales',
  'presales',
]

const MEETING_FLOOR_ID: FloorId = '1f'

const DIRECT_AGENT_ROUTE_KEYWORDS: Array<{ departmentId: DepartmentId; keywords: string[] }> = [
  {
    departmentId: 'ceo',
    keywords: [
      '@강비서',
      '강비서',
      '@대표비서',
      '대표비서',
      '대표 비서',
    ],
  },
  {
    departmentId: 'executive',
    keywords: [
      '@한비서',
      '한비서',
      '@일정비서',
      '일정비서',
      '일정 비서',
      '운영비서',
      '운영 비서',
    ],
  },
]

const DEPARTMENT_KEYWORDS: Record<DepartmentId, string[]> = {
  ceo: ['@ceo', '@대표', '@총괄', 'ceo', '대표', '총괄', '최종', '의사결정', '우선순위'],
  executive: ['@exec', '@executive', '@전략', '@비서', 'executive', 'strategy', 'schedule', '일정', '비서', '전략', '미팅', '리마인드'],
  security: ['@rnd', '@research', '@연구', '@r&d', 'r&d', 'research', '진단 연구', '기질', '프로파일링', '조직진단', '창업자 진단', '문항', '척도'],
  compliance: ['@data', '@데이터', '@리포트', 'data', 'analytics', 'report', '통계', '데이터', '리포트', '프로파일', '패턴', '지표', '결과보고'],
  management: ['@mgmt', '@management', '@경영지원', 'management', 'finance', 'tax', 'accounting', 'hr', '경영', '회계', '세무', '매출', '비용', '증빙', '계약'],
  development: ['@dev', '@development', '@개발', '@자동화', 'code', 'coding', 'implement', 'automation', 'api', '개발', '자동화', '구현', '파이프라인', '대시보드'],
  qa: ['@qa', '@오류', '@검증', 'qa', 'test', 'testing', 'verify', 'bug', 'error', '오류', '검증', '테스트', '재현', '분류'],
  devops: ['@ops', '@devops', '@운영', 'ops', 'operation', 'deploy', 'backup', 'license', 'workflow', '운영', '백업', '권한', '라이선스', '알림'],
  planning: ['@plan', '@planning', '@기획', 'plan', 'planning', 'product', 'roadmap', 'prd', '제품', '기획', '로드맵', '요구사항', '적용안'],
  support: ['@education', '@교육', '@강사', '@자격증', 'education', 'training', 'certificate', '강사', '교육', '자격증', '시험', '강의', '과정'],
  sales: ['@sales', '@세일즈', '@영업', 'sales', 'lead', 'contract', 'deal', 'pricing', 'quote', '세일즈', '영업', '리드', '계약', '견적', '라이선스'],
  presales: ['@research', '@insight', '@리서치', '@인사이트', 'research', 'insight', 'trend', 'vc', 'ac', 'hr', '리서치', '인사이트', '트렌드', '창업', '투자자'],
  marketing: ['@mkt', '@marketing', '@마케팅', 'marketing', 'campaign', 'brand', 'content', '마케팅', '콘텐츠', '캠페인', '브랜드', '홍보', '타겟'],
  finance: ['@finance', '@재무', '@회계', 'finance', 'accounting', 'tax', '재무', '회계', '세무', '정산', '증빙', '세금계산서', '매출', '비용'],
  hr: ['@hr', '@인사', '@총무', 'hr', 'recruit', 'hiring', '인사', '채용', '총무', '급여', '4대보험', '근태', '홍보'],
  legal: ['@legal', '@법무', '@특허', 'legal', 'patent', 'trademark', '법무', '특허', '상표', '저작권', '계약서', '개인정보', '법률'],
  customer: ['@customer', '@고객', '@cs', 'customer', 'support', 'cs', '고객', '문의', '민원', '오류신고', '재발', '마크오류'],
  b2g: ['@b2g', '@공공', '@기관', 'b2g', 'government', 'public', '공공기관', '기관사업', '기관 영업', '기관영업', '기관대상', '공공사업', '조달', '용역', '시범사업', '제안공모', '입찰', '지자체', '정부부처', '교육부', '고용노동부'],
  expertsales: ['@expert', '@전문가', '@자격증영업', '전문가양성', '강사모집', '자격증세일즈', '수강생유치', '설명회'],
  global: ['@global', '@해외', '@글로벌', 'global', 'overseas', 'international', '해외', '글로벌', '현지화', '파트너십', '수출', '컨퍼런스'],
  trend: ['@trend', '@트렌드', '@동향', 'trend', 'insight', '트렌드', '동향', '시장분석', '최신', '이슈', '뉴스'],
}

const QUESTION_KEYWORDS = ['어떻게', '뭐야', '무엇', '가능해', '되나', '맞아', '이야', '하면']

const SUMMON_KEYWORDS = [
  '모여',
  '모입시다',
  '집합',
  '집결',
  '소집',
  '참석',
  '들어와',
  '회의',
]

export interface KeywordRoutingResult {
  explicitlyMentioned: DepartmentId[]
  inferred: DepartmentId[]
}

export interface MeetingPlan {
  room: MeetingRoom
  roomLabel: string
  participantLabel: string
  departmentIds: DepartmentId[]
  channelFloorId: FloorId
}

export function resolveKeywordRouting(message: string): KeywordRoutingResult {
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

/**
 * 키워드 없이 기본 배정될 때, 메시지 맥락에 따라 관련 부서를 추가로 포함한다.
 * 기존의 고정 4개 대신 상황에 맞는 부서 조합을 반환한다.
 */
function resolveContextualDefaults(message: string): DepartmentId[] {
  const lower = message.toLowerCase()

  const contextRules: Array<{ keywords: string[]; dept: DepartmentId }> = [
    { keywords: ['돈', '비용', '예산', '지출', '정산', '매출', '수익', '투자', '견적', '세금', '회계', '결제'], dept: 'finance' },
    { keywords: ['사람', '채용', '직원', '인사', '급여', '계약직', '온보딩', '퇴사', '4대보험', '근태', '복지'], dept: 'hr' },
    { keywords: ['계약', '법률', '특허', '저작권', '소송', '규정', '법적', '협약', '상표', '개인정보', 'nda'], dept: 'legal' },
    { keywords: ['오류', '버그', '에러', '테스트', '검증', '품질', '재현', '수정', 'qa', '이슈', '크래시'], dept: 'qa' },
    { keywords: ['마케팅', '홍보', '콘텐츠', 'sns', '캠페인', '브랜드', '광고', '포지셔닝', '채널', '타겟'], dept: 'marketing' },
    { keywords: ['운영', '배포', '서버', '인프라', '백업', '알림', '모니터링', '라이선스', '권한', '자동화'], dept: 'devops' },
    { keywords: ['강사', '수강생', '교육', '자격증', '커리큘럼', '강의', '과정', '교육생'], dept: 'support' },
    { keywords: ['고객', '문의', '민원', 'cs', '불만', '환불', '고객사', '클레임', '재발'], dept: 'customer' },
    { keywords: ['공공', '기관', '정부', '지자체', '조달', '입찰', '용역', '시범사업', '교육부', '고용노동부'], dept: 'b2g' },
    { keywords: ['해외', '글로벌', '현지화', '파트너', '수출', '영어', '컨퍼런스', '해외진출'], dept: 'global' },
    { keywords: ['트렌드', '동향', '시장분석', '뉴스', '이슈', '최신', '흐름', '거시'], dept: 'trend' },
    { keywords: ['리서치', '인사이트', '시장조사', '경쟁사', '고객분석', '데이터 기반'], dept: 'presales' },
    { keywords: ['전문가', '강사모집', '자격증 영업', '설명회', '수강생 유치'], dept: 'expertsales' },
  ]

  const matched = contextRules
    .filter(({ keywords }) => keywords.some((kw) => lower.includes(kw)))
    .map(({ dept }) => dept)

  if (matched.length > 0) {
    // 맥락에 맞는 부서 + 기본 핵심 부서(ceo는 항상 포함)
    return Array.from(new Set(['ceo', ...matched, 'planning']))
  }

  // 완전 기본값
  return ['ceo', 'planning', 'security', 'sales']
}

export function resolveByKeyword(message: string): DepartmentId[] {
  const directAgentRoutes = DIRECT_AGENT_ROUTE_KEYWORDS
    .filter(({ keywords }) => keywords.some((keyword) => message.includes(keyword)))
    .map(({ departmentId }) => departmentId)

  if (directAgentRoutes.length > 0) {
    return Array.from(new Set(directAgentRoutes))
  }

  const { explicitlyMentioned, inferred } = resolveKeywordRouting(message)
  if (explicitlyMentioned.length > 0) return explicitlyMentioned
  if (inferred.length > 0) return inferred
  return resolveContextualDefaults(message)
}

export function looksLikeMeetingSummon(message: string) {
  const compact = message.replace(/\s+/g, '')
  if (compact.includes('?') || QUESTION_KEYWORDS.some((keyword) => message.includes(keyword))) {
    return false
  }

  return SUMMON_KEYWORDS.some((keyword) => message.includes(keyword))
}

export function resolveMeetingPlan(message: string, currentFloor: FloorId): MeetingPlan | null {
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
      participantLabel: '관련 부서 우선 참여',
      departmentIds: resolveSmallMeetingDepartments(message, currentFloor),
      channelFloorId: MEETING_FLOOR_ID,
    }
  }

  if (compact.includes('회의실')) {
    const isAllHands = ['전원', '전직원', '모든직원', '전사', '전체'].some((keyword) => message.includes(keyword))
    return {
      room: isAllHands ? 'large' : 'medium',
      roomLabel: isAllHands ? '대회의실' : '중회의실',
      participantLabel: isAllHands ? '전 직원 참여' : '핵심 직원 참여',
      departmentIds: isAllHands ? (Object.keys(DEPARTMENTS) as DepartmentId[]) : CORE_MEETING_DEPARTMENTS,
      channelFloorId: MEETING_FLOOR_ID,
    }
  }

  return null
}

export function buildCoordinatorMessage(
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

function resolveSmallMeetingDepartments(message: string, currentFloor: FloorId): DepartmentId[] {
  const { explicitlyMentioned, inferred } = resolveKeywordRouting(message)
  if (explicitlyMentioned.length > 0) return explicitlyMentioned
  if (inferred.length > 0) return inferred

  const floorDepartments = FLOORS[currentFloor].departments
  if (floorDepartments.length > 0) {
    return floorDepartments
  }

  return ['planning']
}
