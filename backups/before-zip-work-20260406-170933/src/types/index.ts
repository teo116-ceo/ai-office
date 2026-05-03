export type AgentStatus = 'idle' | 'working' | 'thinking' | 'debating' | 'moving'

export type DepartmentId =
  | 'ceo'          // 대표실 (12F)
  | 'executive'    // 임원실 (11F)
  | 'security'     // 보안연구소 (10F)
  | 'compliance'   // 컴플라이언스 (9F, management와 공유)
  | 'management'   // 경영지원 (9F, compliance와 공유)
  | 'development'  // 개발본부 (8F)
  | 'qa'           // QA (7F, devops와 공유)
  | 'devops'       // DevOps/인프라 (7F, qa와 공유)
  | 'planning'     // 제품기획/PM (6F)
  | 'support'      // 기술지원/고객성공 (5F)
  | 'sales'        // 영업 (4F, presales와 공유)
  | 'presales'     // 프리세일즈 (4F, sales와 공유)
  | 'marketing'    // 마케팅 (3F)

export type FloorId =
  | '1f'   // 카페
  | '2f'   // 회의실 전용
  | '3f'   // 마케팅
  | '4f'   // 영업 + 프리세일즈
  | '5f'   // 기술지원/고객성공
  | '6f'   // 제품기획/PM
  | '7f'   // QA + DevOps
  | '8f'   // 개발본부
  | '9f'   // 컴플라이언스 + 경영지원
  | '10f'  // 보안연구소
  | '11f'  // 임원실
  | '12f'  // 대표실 (최상층)

export type WorkspaceView = 'dashboard' | 'office' | 'tasks' | 'chat' | 'settings'

export type ThemeMode = 'dark' | 'light'

export type OfficeViewMode = '3d' | '2d'

export type ProviderId = 'anthropic' | 'openai' | 'gemini'

export type DirectiveKind = 'announcement' | 'meeting'

export type AgentPresenceMode = 'stretch' | 'walk' | 'coffee'

export type MeetingRoom = 'large' | 'medium' | 'small'

export interface FloorInfo {
  id: FloorId
  label: string        // '1F', '2F' ...
  name: string         // '카페', '회의실' ...
  departments: DepartmentId[]
}

export const FLOORS: Record<FloorId, FloorInfo> = {
  '12f': { id: '12f', label: '12F', name: '대표실',              departments: ['ceo'] },
  '11f': { id: '11f', label: '11F', name: '임원실',              departments: ['executive'] },
  '10f': { id: '10f', label: '10F', name: '보안연구소',           departments: ['security'] },
  '9f':  { id: '9f',  label: '9F',  name: '컴플라이언스·경영지원', departments: ['compliance', 'management'] },
  '8f':  { id: '8f',  label: '8F',  name: '개발본부',             departments: ['development'] },
  '7f':  { id: '7f',  label: '7F',  name: 'QA·DevOps',           departments: ['qa', 'devops'] },
  '6f':  { id: '6f',  label: '6F',  name: '제품기획/PM',          departments: ['planning'] },
  '5f':  { id: '5f',  label: '5F',  name: '기술지원·고객성공',     departments: ['support'] },
  '4f':  { id: '4f',  label: '4F',  name: '영업·프리세일즈',       departments: ['sales', 'presales'] },
  '3f':  { id: '3f',  label: '3F',  name: '마케팅',               departments: ['marketing'] },
  '2f':  { id: '2f',  label: '2F',  name: '회의실',               departments: [] },
  '1f':  { id: '1f',  label: '1F',  name: '카페',                 departments: [] },
}

export const DEPT_FLOOR: Record<DepartmentId, FloorId> = {
  ceo:         '12f',
  executive:   '11f',
  security:    '10f',
  compliance:  '9f',
  management:  '9f',
  development: '8f',
  qa:          '7f',
  devops:      '7f',
  planning:    '6f',
  support:     '5f',
  sales:       '4f',
  presales:    '4f',
  marketing:   '3f',
}

export interface Department {
  id: DepartmentId
  name: string
  color: string
  headcount: { min: number; max: number }
}

export const DEPARTMENTS: Record<DepartmentId, Department> = {
  ceo:         { id: 'ceo',         name: '대표실',              color: '#ff2d55', headcount: { min: 1, max: 1 } },
  executive:   { id: 'executive',   name: '임원실',              color: '#e94560', headcount: { min: 2, max: 4 } },
  security:    { id: 'security',    name: '보안연구소',           color: '#9b5de5', headcount: { min: 8, max: 12 } },
  compliance:  { id: 'compliance',  name: '정보보안/컴플라이언스', color: '#8d99ae', headcount: { min: 1, max: 3 } },
  management:  { id: 'management',  name: '경영지원',             color: '#a8b2d8', headcount: { min: 3, max: 5 } },
  development: { id: 'development', name: '개발본부',             color: '#00b4d8', headcount: { min: 15, max: 20 } },
  qa:          { id: 'qa',          name: 'QA',                  color: '#f77f00', headcount: { min: 3, max: 5 } },
  devops:      { id: 'devops',      name: 'DevOps/인프라',        color: '#fee440', headcount: { min: 3, max: 5 } },
  planning:    { id: 'planning',    name: '제품기획/PM',          color: '#64ffda', headcount: { min: 3, max: 5 } },
  support:     { id: 'support',     name: '기술지원/고객성공',     color: '#06d6a0', headcount: { min: 4, max: 6 } },
  sales:       { id: 'sales',       name: '영업',                 color: '#f15bb5', headcount: { min: 4, max: 8 } },
  presales:    { id: 'presales',    name: '프리세일즈',            color: '#ff9f1c', headcount: { min: 2, max: 4 } },
  marketing:   { id: 'marketing',   name: '마케팅',               color: '#ff6b6b', headcount: { min: 2, max: 4 } },
}

export interface Agent {
  id: string
  departmentId: DepartmentId
  name: string
  role: string
  model: 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001'
        | 'gpt-4o' | 'gpt-4o-mini'
        | 'gemini-1.5-pro' | 'gemini-2.0-flash'
  status: AgentStatus
  position: { x: number; y: number }
  message?: string
  color: string
}

export interface AgentPresence {
  floorId: FloorId
  tile: { col: number; row: number }
  mode: AgentPresenceMode
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
}

export interface Task {
  id: string
  title: string
  description: string
  assignedTo: DepartmentId[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  createdAt: Date
  result?: string
  attachments?: UploadedFile[]
}
