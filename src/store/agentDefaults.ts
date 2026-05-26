import type { Agent, AgentTrigger, DepartmentId } from '@/types'
import { DEPARTMENTS } from '@/types'

const C = (deptId: DepartmentId) => DEPARTMENTS[deptId].color

export const DEFAULT_AGENTS: Agent[] = [
  // 대표/총괄 12F
  { id: 'ceo-sec',   departmentId: 'ceo',         name: '강비서',  role: '대표 직속 비서',             model: 'claude-opus-4-6',       status: 'idle', color: C('ceo') },

  // 전략·비서 11F
  { id: 'exec-cto',  departmentId: 'executive',   name: '윤전략',  role: '사업전략 리드',              model: 'gemini-2.5-pro',         status: 'idle', color: C('executive') },
  { id: 'exec-coo',  departmentId: 'executive',   name: '한비서',  role: '운영 비서 / 일정 조율 매니저', model: 'gpt-4o',               status: 'idle', color: C('executive') },

  // R&D 관리 10F
  { id: 'sec-lead',  departmentId: 'security',    name: '오연구',  role: 'R&D 관리 팀장',             model: 'claude-opus-4-6',        status: 'idle', color: C('security') },
  { id: 'sec-01',    departmentId: 'security',    name: '이기질',  role: 'ICRU 기질진단 연구원',      model: 'gpt-4o',                 status: 'idle', color: C('security') },
  { id: 'sec-02',    departmentId: 'security',    name: '박창업',  role: '조직·창업자 진단 연구원',   model: 'gemini-2.5-pro',         status: 'idle', color: C('security') },

  // 데이터·경영지원 9F
  { id: 'com-01',    departmentId: 'compliance',  name: '데이터',  role: '진단 데이터 관리 담당자',    model: 'gpt-4o',                 status: 'idle', color: C('compliance') },
  { id: 'mgmt-hr',   departmentId: 'management',  name: '정운영',  role: '행정/인사 운영 매니저',      model: 'gemini-2.5-flash',       status: 'idle', color: C('management') },
  { id: 'mgmt-fin',  departmentId: 'management',  name: '권재무',  role: '회계/세무 데이터 담당자',    model: 'gpt-4o',                 status: 'idle', color: C('management') },

  // 자동화개발 8F
  { id: 'dev-lead',  departmentId: 'development', name: '송자동',  role: '자동화개발 팀장',           model: 'claude-sonnet-4-6',      status: 'idle', color: C('development') },
  { id: 'dev-01',    departmentId: 'development', name: '김리포',  role: '리포트 자동화 개발자',      model: 'claude-sonnet-4-6',      status: 'idle', color: C('development') },
  { id: 'dev-02',    departmentId: 'development', name: '최파이프', role: '데이터 파이프라인 개발자',  model: 'claude-sonnet-4-6',      status: 'idle', color: C('development') },
  { id: 'dev-03',    departmentId: 'development', name: '배도구',  role: '내부 도구 개발자',          model: 'claude-sonnet-4-6',      status: 'idle', color: C('development') },

  // 오류대응·운영자동화 7F
  { id: 'qa-lead',   departmentId: 'qa',          name: '강검증',  role: '오류대응 리더',             model: 'claude-sonnet-4-6',      status: 'idle', color: C('qa') },
  { id: 'qa-01',     departmentId: 'qa',          name: '조추적',  role: '진단 오류 트래킹 담당자',    model: 'gemini-2.5-flash',       status: 'idle', color: C('qa') },
  { id: 'ops-lead',  departmentId: 'devops',      name: '임운영',  role: '운영자동화 팀장',           model: 'claude-sonnet-4-6',      status: 'idle', color: C('devops') },
  { id: 'ops-01',    departmentId: 'devops',      name: '류라이선스', role: '라이선스/백업 운영 담당자', model: 'gpt-4o-mini',          status: 'idle', color: C('devops') },

  // 제품기획 6F
  { id: 'plan-lead', departmentId: 'planning',    name: '박제품',  role: '제품기획 리드',             model: 'gemini-2.5-pro',         status: 'idle', color: C('planning') },
  { id: 'plan-01',   departmentId: 'planning',    name: '최로드맵', role: '진단 제품 PM',              model: 'gpt-4o',                 status: 'idle', color: C('planning') },

  // 교육운영 5F
  { id: 'sup-lead',  departmentId: 'support',     name: '서교육',  role: '교육운영 팀장',             model: 'gpt-4o',                 status: 'idle', color: C('support') },
  { id: 'sup-01',    departmentId: 'support',     name: '문자격',  role: '강사/자격증 운영 담당자',    model: 'gemini-2.5-flash',       status: 'idle', color: C('support') },

  // 세일즈·리서치 4F
  { id: 'sal-lead',  departmentId: 'sales',       name: '배세일즈', role: '기관 라이선스 세일즈 리드', model: 'gpt-4o',                 status: 'idle', color: C('sales') },
  { id: 'sal-01',    departmentId: 'sales',       name: '송계약',  role: '리드/계약 파이프라인 담당자', model: 'gemini-2.5-flash',      status: 'idle', color: C('sales') },
  { id: 'pre-01',    departmentId: 'presales',    name: '황인사이트', role: 'HR·창업 리서치 분석가',  model: 'claude-sonnet-4-6',      status: 'idle', color: C('presales') },

  // 마케팅·리서치 3F
  { id: 'mkt-01',    departmentId: 'marketing',   name: '마콘텐츠',  role: '콘텐츠·캠페인 매니저',       model: 'claude-sonnet-4-6', status: 'idle', color: C('marketing') },
  { id: 'trd-01',    departmentId: 'trend',       name: '강트렌드',  role: '트렌드분석 담당자',           model: 'claude-sonnet-4-6', status: 'idle', color: C('trend') },

  // 경영지원 본부 추가 팀 9F
  { id: 'fin-01',    departmentId: 'finance',     name: '김재무',    role: '재무·회계 담당자',           model: 'gpt-4o',             status: 'idle', color: C('finance') },
  { id: 'hr-01',     departmentId: 'hr',          name: '이인사',    role: '인사·총무 담당자',           model: 'gemini-2.5-flash',   status: 'idle', color: C('hr') },
  { id: 'leg-01',    departmentId: 'legal',       name: '박법무',    role: '법무·특허 담당자',           model: 'gemini-2.5-pro',     status: 'idle', color: C('legal') },

  // 교육·서비스 본부 추가 팀 5F
  { id: 'cust-01',   departmentId: 'customer',    name: '정고객',    role: '고객서비스 담당자',          model: 'gpt-4o-mini',        status: 'idle', color: C('customer') },

  // 세일즈·마케팅 본부 추가 팀 4F
  { id: 'b2g-01',    departmentId: 'b2g',         name: '최공공',    role: 'B2G 세일즈 담당자',          model: 'gpt-4o',             status: 'idle', color: C('b2g') },
  { id: 'exp-01',    departmentId: 'expertsales', name: '한전문가',  role: '전문가양성 세일즈 담당자',    model: 'gpt-4o',             status: 'idle', color: C('expertsales') },
  { id: 'glb-01',    departmentId: 'global',      name: '윤글로벌',  role: '글로벌사업 담당자',          model: 'gemini-2.5-pro',     status: 'idle', color: C('global') },
]

export const DEFAULT_TRIGGERS: AgentTrigger[] = [
  {
    id: 'trigger-research-to-data',
    enabled: true,
    label: 'R&D → 데이터: 진단 구조 데이터화 요청',
    fromDept: 'security',
    condition: 'keywords',
    keywords: ['진단', '척도', '문항', '기질', '회복탄력성', '창업자', '조직진단'],
    toDepts: ['compliance', 'development'],
    messageTemplate: 'R&D에서 진단 구조 또는 문항 변경이 발생했습니다. 데이터 구조와 리포트 자동화 영향을 검토해주세요.',
  },
  {
    id: 'trigger-dev-to-qa',
    enabled: true,
    label: '자동화개발 → 오류대응: 자동화 결과 검증 요청',
    fromDept: 'development',
    condition: 'file_saved',
    toDepts: ['qa'],
    messageTemplate: '자동화개발 작업이 완료되었습니다. 결과물의 오류 가능성, 입력 예외, 리포트 품질을 검증해주세요.',
  },
  {
    id: 'trigger-data-to-sales',
    enabled: true,
    label: '데이터 → 세일즈: 기관 보고 지표 전달',
    fromDept: 'compliance',
    condition: 'keywords',
    keywords: ['기관', '통계', '결과보고', '라이선스', '연말보고', '대시보드'],
    toDepts: ['sales', 'marketing'],
    messageTemplate: '기관 보고용 통계 또는 리포트 지표가 정리되었습니다. 세일즈 제안과 마케팅 메시지에 반영해주세요.',
  },
  {
    id: 'trigger-planning-to-education',
    enabled: true,
    label: '제품기획 → 교육운영: 교육 과정 반영 요청',
    fromDept: 'planning',
    condition: 'file_saved',
    toDepts: ['support', 'sales'],
    messageTemplate: '제품기획에서 진단/교육 상품 변경을 완료했습니다. 강사 과정, 자격증 운영, 기관 세일즈 자료 반영을 준비해주세요.',
  },
]
