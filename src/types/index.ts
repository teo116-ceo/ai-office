import type { ModelId } from '@/config/models'
export type { ModelId }

export type AgentStatus = 'idle' | 'working' | 'thinking' | 'debating' | 'moving'

export type DivisionId =
  | 'hq'       // 대표이사
  | 'mgmt'     // 경영지원 본부
  | 'tech'     // 제품·기술 본부
  | 'edu'      // 교육·서비스 본부
  | 'biz'      // 세일즈·마케팅 본부
  | 'research' // 리서치·인사이트 본부

export type DepartmentId =
  | 'ceo'          // 대표이사 (12F)
  | 'executive'    // 전략·비서 (11F)
  // ── 경영지원 본부 (9F) ──────────────────
  | 'management'   // 경영지원 총괄
  | 'finance'      // 재무·회계팀
  | 'hr'           // 인사·총무팀
  | 'legal'        // 법무·특허팀
  // ── 제품·기술 본부 (8F / 7F / 10F) ─────
  | 'security'     // 진단개발팀 (10F)
  | 'development'  // AI엔지니어링팀 (8F)
  | 'compliance'   // 데이터분석팀 (9F)
  | 'qa'           // QA·오류대응팀 (7F)
  | 'devops'       // 운영자동화팀 (7F)
  | 'planning'     // 제품기획팀 (6F)
  // ── 교육·서비스 본부 (5F) ───────────────
  | 'support'      // 강사양성·자격증운영
  | 'customer'     // 고객서비스팀
  // ── 세일즈·마케팅 본부 (4F / 3F) ────────
  | 'sales'        // B2B세일즈팀
  | 'b2g'          // B2G세일즈팀
  | 'expertsales'  // 전문가양성세일즈팀
  | 'marketing'    // 콘텐츠마케팅팀
  | 'global'       // 글로벌사업팀
  // ── 리서치·인사이트 본부 (3F) ───────────
  | 'presales'     // HR리서치팀
  | 'trend'        // 트렌드분석팀

export type FloorId =
  | '1f'   // 회의층
  | '2f'   // 마케팅·리서치
  | '3f'   // 세일즈
  | '4f'   // 교육·서비스
  | '5f'   // 제품기획
  | '6f'   // 운영·오류대응
  | '7f'   // 자동화개발
  | '8f'   // 경영지원·데이터
  | '9f'   // 연구개발
  | '10f'  // 전략·비서
  | '11f'  // 대표실

export type WorkspaceView = 'dashboard' | 'tasks' | 'chat' | 'agents' | 'files' | 'settings' | 'errors'

export type ThemeMode = 'dark' | 'warm-orange' | 'pastel-sky' | 'pastel-mint' | 'pastel-lavender' | 'pastel-peach' | 'pastel-pink'

export type FontFamily = 'system' | 'noto-sans-kr' | 'ibm-plex-sans-kr' | 'gowun-dodum' | 'press-start-2p'

export type FontSize = 'small' | 'medium' | 'large' | 'xlarge'

export type ResponseLanguage = 'auto' | 'ko' | 'en'

export type TaskComplexity = 'simple' | 'medium' | 'complex'

export type ProviderId = 'anthropic' | 'openai' | 'gemini'

export type DirectiveKind = 'announcement' | 'meeting'

export type MeetingRoom = 'large' | 'medium' | 'small'

export interface FloorInfo {
  id: FloorId
  label: string
  name: string
  departments: DepartmentId[]
}

export const FLOORS: Record<FloorId, FloorInfo> = {
  '11f': { id: '11f', label: '11F', name: '대표실', departments: ['ceo'] },
  '10f': { id: '10f', label: '10F', name: '전략·비서', departments: ['executive'] },
  '9f': { id: '9f', label: '9F', name: '연구개발', departments: ['security'] },
  '8f': { id: '8f', label: '8F', name: '경영지원·데이터', departments: ['management', 'finance', 'hr', 'legal', 'compliance'] },
  '7f': { id: '7f', label: '7F', name: '자동화개발', departments: ['development'] },
  '6f': { id: '6f', label: '6F', name: '운영·오류대응', departments: ['qa', 'devops'] },
  '5f': { id: '5f', label: '5F', name: '제품기획', departments: ['planning'] },
  '4f': { id: '4f', label: '4F', name: '교육·서비스', departments: ['support', 'customer'] },
  '3f': { id: '3f', label: '3F', name: '세일즈', departments: ['sales', 'b2g', 'expertsales', 'global'] },
  '2f': { id: '2f', label: '2F', name: '마케팅·리서치', departments: ['marketing', 'presales', 'trend'] },
  '1f': { id: '1f', label: '1F', name: '회의층', departments: [] },
}

export const DEPT_FLOOR: Record<DepartmentId, FloorId> = {
  ceo: '11f',
  executive: '10f',
  security: '9f',
  management: '8f',
  finance: '8f',
  hr: '8f',
  legal: '8f',
  compliance: '8f',
  development: '7f',
  qa: '6f',
  devops: '6f',
  planning: '5f',
  support: '4f',
  customer: '4f',
  sales: '3f',
  b2g: '3f',
  expertsales: '3f',
  global: '3f',
  marketing: '2f',
  presales: '2f',
  trend: '2f',
}

export interface Division {
  id: DivisionId
  name: string
  color: string
  departments: DepartmentId[]
}

export const DIVISIONS: Record<DivisionId, Division> = {
  hq:       { id: 'hq',       name: '경영진',            color: '#ff2d55', departments: ['ceo', 'executive'] },
  mgmt:     { id: 'mgmt',     name: '경영지원 본부',      color: '#a8b2d8', departments: ['management', 'finance', 'hr', 'legal'] },
  tech:     { id: 'tech',     name: '제품운영 본부',      color: '#9b5de5', departments: ['security', 'development', 'compliance', 'qa', 'devops', 'planning'] },
  edu:      { id: 'edu',      name: '교육서비스 본부',    color: '#06d6a0', departments: ['support', 'customer'] },
  biz:      { id: 'biz',      name: '사업운영 본부',      color: '#f15bb5', departments: ['sales', 'b2g', 'expertsales', 'marketing', 'global'] },
  research: { id: 'research', name: '시장리서치 본부',    color: '#ff9f1c', departments: ['presales', 'trend'] },
}

export interface Department {
  id: DepartmentId
  name: string
  color: string
  divisionId: DivisionId
  headcount: { min: number; max: number }
}

export const DEPARTMENTS: Record<DepartmentId, Department> = {
  // ── 대표이사 ──────────────────────────────────────────────────────────────
  ceo:         { id: 'ceo',         name: '대표실',                color: '#ff2d55', divisionId: 'hq',       headcount: { min: 1, max: 2 } },
  executive:   { id: 'executive',   name: '전략지원',              color: '#e94560', divisionId: 'hq',       headcount: { min: 1, max: 2 } },
  // ── 경영지원 본부 ─────────────────────────────────────────────────────────
  management:  { id: 'management',  name: '경영지원',              color: '#a8b2d8', divisionId: 'mgmt',     headcount: { min: 1, max: 2 } },
  finance:     { id: 'finance',     name: '재무회계',              color: '#8fb3de', divisionId: 'mgmt',     headcount: { min: 1, max: 2 } },
  hr:          { id: 'hr',          name: '인사총무',              color: '#b8c8e8', divisionId: 'mgmt',     headcount: { min: 1, max: 2 } },
  legal:       { id: 'legal',       name: '법무특허',              color: '#7a9cc9', divisionId: 'mgmt',     headcount: { min: 1, max: 2 } },
  // ── 제품·기술 본부 ────────────────────────────────────────────────────────
  security:    { id: 'security',    name: '연구개발',              color: '#9b5de5', divisionId: 'tech',     headcount: { min: 2, max: 4 } },
  development: { id: 'development', name: '자동화개발',            color: '#00b4d8', divisionId: 'tech',     headcount: { min: 2, max: 4 } },
  compliance:  { id: 'compliance',  name: '데이터관리',            color: '#7c6fcd', divisionId: 'tech',     headcount: { min: 1, max: 2 } },
  qa:          { id: 'qa',          name: '오류대응',              color: '#f77f00', divisionId: 'tech',     headcount: { min: 1, max: 2 } },
  devops:      { id: 'devops',      name: '운영자동화',            color: '#fee440', divisionId: 'tech',     headcount: { min: 1, max: 2 } },
  planning:    { id: 'planning',    name: '제품기획',              color: '#64ffda', divisionId: 'tech',     headcount: { min: 1, max: 2 } },
  // ── 교육·서비스 본부 ──────────────────────────────────────────────────────
  support:     { id: 'support',     name: '교육운영',              color: '#06d6a0', divisionId: 'edu',      headcount: { min: 1, max: 2 } },
  customer:    { id: 'customer',    name: '고객지원',              color: '#00c896', divisionId: 'edu',      headcount: { min: 1, max: 2 } },
  // ── 세일즈·마케팅 본부 ────────────────────────────────────────────────────
  sales:       { id: 'sales',       name: '기업세일즈',            color: '#f15bb5', divisionId: 'biz',      headcount: { min: 1, max: 2 } },
  b2g:         { id: 'b2g',         name: '공공사업',              color: '#e0449e', divisionId: 'biz',      headcount: { min: 1, max: 2 } },
  expertsales: { id: 'expertsales', name: '전문가사업',            color: '#c93d87', divisionId: 'biz',      headcount: { min: 1, max: 2 } },
  marketing:   { id: 'marketing',   name: '마케팅',                color: '#ff6b6b', divisionId: 'biz',      headcount: { min: 1, max: 2 } },
  global:      { id: 'global',      name: '글로벌사업',            color: '#ff8e53', divisionId: 'biz',      headcount: { min: 1, max: 2 } },
  // ── 리서치·인사이트 본부 ─────────────────────────────────────────────────
  presales:    { id: 'presales',    name: '리서치',                color: '#ff9f1c', divisionId: 'research', headcount: { min: 1, max: 2 } },
  trend:       { id: 'trend',       name: '시장동향',              color: '#ffbb5c', divisionId: 'research', headcount: { min: 1, max: 2 } },
}

export interface Agent {
  id: string
  departmentId: DepartmentId
  name: string
  role: string
  model: ModelId
  status: AgentStatus
  message?: string
  color: string
}

export type UploadedFileKind = 'text' | 'binary' | 'archive'

export interface ArchiveEntry {
  path: string
  size: number
  kind: 'text' | 'binary'
  excerpt?: string
  truncated?: boolean
}

export interface ArchiveSummary {
  format: 'zip'
  entryCount: number
  directoryCount: number
  entries: ArchiveEntry[]
}

export interface UploadedFile {
  id: string
  name: string
  size: number
  mimeType: string
  kind: UploadedFileKind
  summary: string
  promptContext: string
  warnings?: string[]
  archive?: ArchiveSummary
}

export interface OrganizationDirective {
  id: string
  kind: DirectiveKind
  title: string
  content: string
  summary: string
  behaviorInstruction: string
  departmentIds: DepartmentId[]
  createdAt: Date
  channelFloorId?: FloorId
  meetingRoom?: MeetingRoom
  attachmentContext?: string  // 공지 등록 시 첨부 파일 컨텍스트 보존
}

export interface ProviderUsageStats {
  provider: ProviderId
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  lastModel?: Agent['model']
  updatedAt: Date | null
}

export interface Message {
  id: string
  sender: string
  senderName: string
  content: string
  timestamp: Date
  type: 'task' | 'result' | 'debate' | 'system'
  attachments?: UploadedFile[]
  taskId?: string
  departmentIds?: DepartmentId[]
  channelFloorId?: FloorId
  streaming?: boolean
}

export type ApprovalPolicyId =
  | 'externalCommunication'
  | 'pricingCommitment'
  | 'paymentExecution'
  | 'scheduleCommitment'
  | 'legalCommitment'

export type TaskApprovalReasonId = 'allTasks' | ApprovalPolicyId

export interface ApprovalPolicySettings {
  externalCommunication: boolean
  pricingCommitment: boolean
  paymentExecution: boolean
  scheduleCommitment: boolean
  legalCommitment: boolean
}

export interface TaskApprovalReason {
  id: TaskApprovalReasonId
  label: string
  description: string
}

export interface DepartmentResult {
  deptId: DepartmentId
  agentName: string
  content: string
}

export interface TaskTokenUsage {
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface Task {
  id: string
  title: string
  description: string
  assignedTo: DepartmentId[]
  status: 'pending' | 'in_progress' | 'completed' | 'awaiting_approval' | 'failed'
  createdAt: Date
  result?: string
  departmentResults?: DepartmentResult[]
  attachments?: UploadedFile[]
  revisionFeedback?: string
  approvalReasons?: TaskApprovalReason[]
  threadId?: string
  triggeredBy?: string
  revisionOf?: string    // 원본 태스크 ID (재작업인 경우)
  revisionNumber?: number // 버전 번호: 1=원본, 2=1차 수정, …
  reviews?: TaskReview[] // 교차 검토 결과 목록
  tokenUsage?: TaskTokenUsage
}

export type TriggerCondition = 'always' | 'keywords' | 'file_saved'
export type TriggerMode = 'task' | 'review'

export interface AgentTrigger {
  id: string
  enabled: boolean
  label: string
  fromDept: DepartmentId
  condition: TriggerCondition
  keywords?: string[]
  toDepts: DepartmentId[]
  messageTemplate: string
  mode?: TriggerMode  // 'task'=별도 태스크 생성(기본), 'review'=원본 태스크에 검토 코멘트 추가
}

export interface TaskReview {
  id: string
  reviewerId: DepartmentId   // 검토한 부서
  reviewerName: string       // 에이전트 이름
  content: string            // 검토 내용
  createdAt: Date
  triggerId: string          // 어떤 트리거로 실행됐는지
}

export interface AgentMemory {
  id: string
  taskId: string
  title: string
  summary: string
  keyPoints: string[]
  departments: DepartmentId[]
  tags: string[]
  createdAt: Date
  embedding?: number[]
  outcome?: string        // 업무 결과 한 줄 요약
  importance?: number     // 중요도 점수 (0~1), 저장 시 계산
  accessCount?: number    // 검색에서 참조된 횟수
  lastAccessedAt?: Date   // 마지막 참조 시각
}

export type ToastLevel = 'error' | 'warn' | 'info' | 'success' | 'approval'

export interface Toast {
  id: string
  level: ToastLevel
  title: string
  message?: string
  durationMs?: number
  taskId?: string               // approval 레벨 전용
  approvalReasons?: TaskApprovalReason[]  // approval 레벨 전용
}

export type ExecutionLogKind = 'llm' | 'tool' | 'memory' | 'system'

export interface ExecutionLog {
  id: string
  kind: ExecutionLogKind
  label: string
  detail?: string
  createdAt: Date
}

export interface DailyTokenBudget {
  enabled: boolean
  limitTokens: number
  usedToday: number
  resetDate: string
}
