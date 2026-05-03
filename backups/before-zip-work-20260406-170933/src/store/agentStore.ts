import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  Agent,
  Message,
  Task,
  DepartmentId,
  AgentStatus,
  FloorId,
  WorkspaceView,
  ThemeMode,
  OfficeViewMode,
  DirectiveKind,
  OrganizationDirective,
  ProviderId,
  ProviderUsageStats,
  AgentPresence,
  DEPARTMENTS,
} from '@/types'
import type { WebhookSettings } from '@/services/webhookService'
import type { SchedulerSettings } from '@/services/schedulerService'

const C = (deptId: DepartmentId) => DEPARTMENTS[deptId].color
const emptyUsage = (provider: ProviderId): ProviderUsageStats => ({
  provider,
  requestCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  updatedAt: null,
})

const INITIAL_AGENTS: Agent[] = [
  // 대표실 12F (1명)
  { id: 'ceo-01',    departmentId: 'ceo',         name: '임태오', role: '대표이사 (CEO)',      model: 'claude-opus-4-6',        status: 'idle', position: { x: 0, y: 0 }, color: C('ceo') },

  // 임원실 11F (2명) — Gemini: 전략적 창의성, 최신 기술 트렌드
  { id: 'exec-cto',  departmentId: 'executive',   name: '이CTO',  role: '최고기술책임자 (CTO)', model: 'gemini-1.5-pro',         status: 'idle', position: { x: 0, y: 0 }, color: C('executive') },
  { id: 'exec-coo',  departmentId: 'executive',   name: '박COO',  role: '최고운영책임자 (COO)', model: 'gemini-1.5-pro',         status: 'idle', position: { x: 0, y: 0 }, color: C('executive') },

  // 보안연구소 10F (3명)
  { id: 'sec-lead',  departmentId: 'security',    name: '한보안',  role: '보안연구 팀장',        model: 'claude-opus-4-6',        status: 'idle', position: { x: 0, y: 0 }, color: C('security') },
  { id: 'sec-01',    departmentId: 'security',    name: '오취약',  role: '시니어 보안연구원',    model: 'claude-sonnet-4-6',      status: 'idle', position: { x: 0, y: 0 }, color: C('security') },
  { id: 'sec-02',    departmentId: 'security',    name: '윤위협',  role: '위협 인텔리전스 분석가', model: 'claude-sonnet-4-6',    status: 'idle', position: { x: 0, y: 0 }, color: C('security') },

  // 컴플라이언스·경영지원 9F (3명) — GPT: 규정 준수, 행정 문서 처리
  { id: 'com-01',    departmentId: 'compliance',  name: '유컴플',  role: '정보보안 담당자',      model: 'gpt-4o',                 status: 'idle', position: { x: 0, y: 0 }, color: C('compliance') },
  { id: 'mgmt-hr',   departmentId: 'management',  name: '권인사',  role: 'HR 매니저',            model: 'gpt-4o-mini',            status: 'idle', position: { x: 0, y: 0 }, color: C('management') },
  { id: 'mgmt-fin',  departmentId: 'management',  name: '노재무',  role: '재무 담당자',          model: 'gpt-4o-mini',            status: 'idle', position: { x: 0, y: 0 }, color: C('management') },

  // 개발본부 8F (4명)
  { id: 'dev-lead',  departmentId: 'development', name: '정팀장',  role: '개발팀장',             model: 'claude-sonnet-4-6',      status: 'idle', position: { x: 0, y: 0 }, color: C('development') },
  { id: 'dev-01',    departmentId: 'development', name: '김시니어', role: '시니어 개발자',        model: 'claude-sonnet-4-6',      status: 'idle', position: { x: 0, y: 0 }, color: C('development') },
  { id: 'dev-02',    departmentId: 'development', name: '이풀스택', role: '풀스택 개발자',        model: 'claude-haiku-4-5-20251001', status: 'idle', position: { x: 0, y: 0 }, color: C('development') },
  { id: 'dev-03',    departmentId: 'development', name: '박백엔드', role: '백엔드 개발자',        model: 'claude-haiku-4-5-20251001', status: 'idle', position: { x: 0, y: 0 }, color: C('development') },

  // QA·DevOps 7F (4명) — GPT: 품질 검증, 인프라 자동화 문서
  { id: 'qa-lead',   departmentId: 'qa',          name: '강QA',    role: 'QA 리더',              model: 'gpt-4o',                 status: 'idle', position: { x: 0, y: 0 }, color: C('qa') },
  { id: 'qa-01',     departmentId: 'qa',          name: '조테스트', role: 'QA 엔지니어',          model: 'gpt-4o-mini',            status: 'idle', position: { x: 0, y: 0 }, color: C('qa') },
  { id: 'ops-lead',  departmentId: 'devops',      name: '임데브옵스', role: 'DevOps 팀장',        model: 'gpt-4o',                 status: 'idle', position: { x: 0, y: 0 }, color: C('devops') },
  { id: 'ops-01',    departmentId: 'devops',      name: '류클라우드', role: '클라우드 엔지니어',  model: 'gpt-4o-mini',            status: 'idle', position: { x: 0, y: 0 }, color: C('devops') },

  // 제품기획/PM 6F (2명) — Gemini: 창의적 기획, 시장 트렌드 반영
  { id: 'plan-lead', departmentId: 'planning',    name: '박기획',  role: '수석 PM',              model: 'gemini-1.5-pro',         status: 'idle', position: { x: 0, y: 0 }, color: C('planning') },
  { id: 'plan-01',   departmentId: 'planning',    name: '최기획',  role: '제품기획자',            model: 'gemini-2.0-flash',       status: 'idle', position: { x: 0, y: 0 }, color: C('planning') },

  // 기술지원·고객성공 5F (2명) — GPT: 고객 응대, 이슈 해결 가이드
  { id: 'sup-lead',  departmentId: 'support',     name: '서지원',  role: '기술지원 팀장',        model: 'gpt-4o',                 status: 'idle', position: { x: 0, y: 0 }, color: C('support') },
  { id: 'sup-01',    departmentId: 'support',     name: '문성공',  role: '고객성공 매니저',       model: 'gpt-4o-mini',            status: 'idle', position: { x: 0, y: 0 }, color: C('support') },

  // 영업·프리세일즈 4F (3명) — 영업: GPT(설득력 있는 제안서), 프리세일즈: Gemini(기술 트렌드 데모)
  { id: 'sal-lead',  departmentId: 'sales',       name: '배영업',  role: '영업 팀장',            model: 'gpt-4o',                 status: 'idle', position: { x: 0, y: 0 }, color: C('sales') },
  { id: 'sal-01',    departmentId: 'sales',       name: '송세일즈', role: '영업 담당자',          model: 'gpt-4o-mini',            status: 'idle', position: { x: 0, y: 0 }, color: C('sales') },
  { id: 'pre-01',    departmentId: 'presales',    name: '황프리',  role: '프리세일즈 엔지니어',   model: 'gemini-1.5-pro',         status: 'idle', position: { x: 0, y: 0 }, color: C('presales') },

  // 마케팅 3F (1명) — Gemini: 창의적 콘텐츠, 트렌드 마케팅
  { id: 'mkt-01',    departmentId: 'marketing',   name: '안마케팅', role: '마케팅 매니저',        model: 'gemini-2.0-flash',       status: 'idle', position: { x: 0, y: 0 }, color: C('marketing') },
]

interface AgentStore {
  agents: Agent[]
  messages: Message[]
  tasks: Task[]
  directives: OrganizationDirective[]
  directiveRevision: number
  usageByProvider: Record<ProviderId, ProviderUsageStats>
  agentPresenceById: Record<string, AgentPresence>
  selectedAgent: string | null
  currentFloor: FloorId
  activeView: WorkspaceView
  themeMode: ThemeMode
  officeViewMode: OfficeViewMode
  autoBehaviorEnabled: boolean
  notificationsSeenAt: Date
  webhookSettings: WebhookSettings
  schedulerSettings: SchedulerSettings
  updateAgentStatus: (id: string, status: AgentStatus, message?: string) => void
  updateAgentMessage: (id: string, message?: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'> & { id?: string }) => string
  updateMessage: (id: string, updates: Partial<Omit<Message, 'id' | 'timestamp'>>) => void
  addTask: (task: Omit<Task, 'id' | 'createdAt'> & { id?: string }) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  addDirective: (directive: Omit<OrganizationDirective, 'id' | 'createdAt'> & { id?: string }) => string
  clearDirectives: (kind?: DirectiveKind) => void
  recordProviderUsage: (
    provider: ProviderId,
    usage: { inputTokens: number; outputTokens: number; totalTokens: number; model?: Agent['model'] },
  ) => void
  resetProviderUsage: (provider?: ProviderId) => void
  setAgentPresence: (id: string, presence: AgentPresence) => void
  clearAgentPresence: (id: string) => void
  clearAllAgentPresence: () => void
  setSelectedAgent: (id: string | null) => void
  setCurrentFloor: (floor: FloorId) => void
  setActiveView: (view: WorkspaceView) => void
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
  setOfficeViewMode: (mode: OfficeViewMode) => void
  setAutoBehaviorEnabled: (enabled: boolean) => void
  markNotificationsSeen: (seenAt?: Date) => void
  setWebhookSettings: (settings: Partial<WebhookSettings>) => void
  setSchedulerSettings: (settings: Partial<SchedulerSettings>) => void
  clearMessages: () => void
  clearTasks: () => void
}

type PersistedAgentState = Pick<
  AgentStore,
  'directives'
  | 'messages'
  | 'tasks'
  | 'usageByProvider'
  | 'themeMode'
  | 'officeViewMode'
  | 'autoBehaviorEnabled'
  | 'notificationsSeenAt'
  | 'webhookSettings'
  | 'schedulerSettings'
>

const MAX_PERSISTED_MESSAGES = 300
const MAX_PERSISTED_TASKS = 100

const STORE_STORAGE_KEY = 'ai-office-store'

function reviveDirectives(directives?: OrganizationDirective[]) {
  return (directives ?? []).map((directive) => ({
    ...directive,
    createdAt: directive.createdAt instanceof Date
      ? directive.createdAt
      : new Date(directive.createdAt),
  }))
}

function reviveUsageByProvider(
  usageByProvider: Partial<Record<ProviderId, ProviderUsageStats>> | undefined,
  fallback: Record<ProviderId, ProviderUsageStats>,
) {
  if (!usageByProvider) {
    return fallback
  }

  return (Object.keys(fallback) as ProviderId[]).reduce<Record<ProviderId, ProviderUsageStats>>(
    (accumulator, provider) => {
      const persisted = usageByProvider[provider]
      accumulator[provider] = persisted
        ? {
            ...fallback[provider],
            ...persisted,
            updatedAt: persisted.updatedAt ? new Date(persisted.updatedAt) : null,
          }
        : fallback[provider]
      return accumulator
    },
    { ...fallback },
  )
}

export const useAgentStore = create<AgentStore>()(persist((set) => ({
  agents: INITIAL_AGENTS,
  messages: [],
  tasks: [],
  directives: [],
  directiveRevision: 0,
  usageByProvider: {
    anthropic: emptyUsage('anthropic'),
    openai: emptyUsage('openai'),
    gemini: emptyUsage('gemini'),
  },
  agentPresenceById: {},
  selectedAgent: null,
  currentFloor: '8f',
  activeView: 'office',
  themeMode: 'dark',
  officeViewMode: '3d',
  autoBehaviorEnabled: true,
  notificationsSeenAt: new Date(0),
  webhookSettings: {
    url: '',
    enabled: false,
    onTaskComplete: true,
    onTaskFail: true,
    onDailyBriefing: true,
  },
  schedulerSettings: {
    enabled: false,
    hourUTC: 9,
    minute: 0,
  },

  updateAgentStatus: (id, status, message) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, status, message } : a
      ),
      agentPresenceById:
        status === 'working' || status === 'thinking' || status === 'debating'
          ? Object.fromEntries(Object.entries(state.agentPresenceById).filter(([agentId]) => agentId !== id))
          : state.agentPresenceById,
    })),

  updateAgentMessage: (id, message) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, message } : a
      ),
    })),

  addMessage: (message) => {
    const id = message.id ?? crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, id, timestamp: new Date() },
      ],
    }))
    return id
  },

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, ...updates } : message,
      ),
    })),

  addTask: (task) =>
    set((state) => ({
      tasks: [
        ...state.tasks,
        { ...task, id: task.id ?? crypto.randomUUID(), createdAt: new Date() },
      ],
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  addDirective: (directive) => {
    const id = directive.id ?? crypto.randomUUID()
    set((state) => ({
      directives: [
        ...state.directives,
        { ...directive, id, createdAt: new Date() },
      ].slice(-8),
      directiveRevision: state.directiveRevision + 1,
    }))
    return id
  },

  clearDirectives: (kind) =>
    set((state) => {
      const nextDirectives = kind
        ? state.directives.filter((directive) => directive.kind !== kind)
        : []
      const changed = nextDirectives.length !== state.directives.length

      return {
        directives: nextDirectives,
        directiveRevision: changed ? state.directiveRevision + 1 : state.directiveRevision,
        agents: state.agents.map((agent) => (
          agent.status === 'idle' || agent.status === 'moving'
            ? { ...agent, status: agent.status === 'moving' ? 'idle' : agent.status, message: undefined }
            : agent
        )),
      }
    }),

  recordProviderUsage: (provider, usage) =>
    set((state) => ({
      usageByProvider: {
        ...state.usageByProvider,
        [provider]: {
          ...state.usageByProvider[provider],
          requestCount: state.usageByProvider[provider].requestCount + 1,
          inputTokens: state.usageByProvider[provider].inputTokens + usage.inputTokens,
          outputTokens: state.usageByProvider[provider].outputTokens + usage.outputTokens,
          totalTokens: state.usageByProvider[provider].totalTokens + usage.totalTokens,
          lastModel: usage.model ?? state.usageByProvider[provider].lastModel,
          updatedAt: new Date(),
        },
      },
    })),

  resetProviderUsage: (provider) =>
    set((state) => ({
      usageByProvider: provider
        ? {
            ...state.usageByProvider,
            [provider]: emptyUsage(provider),
          }
        : {
            anthropic: emptyUsage('anthropic'),
            openai: emptyUsage('openai'),
            gemini: emptyUsage('gemini'),
          },
    })),

  setAgentPresence: (id, presence) =>
    set((state) => ({
      agentPresenceById: {
        ...state.agentPresenceById,
        [id]: presence,
      },
    })),

  clearAgentPresence: (id) =>
    set((state) => ({
      agentPresenceById: Object.fromEntries(
        Object.entries(state.agentPresenceById).filter(([agentId]) => agentId !== id),
      ),
    })),

  clearAllAgentPresence: () => set({ agentPresenceById: {} }),

  setSelectedAgent: (id) => set({ selectedAgent: id }),
  setCurrentFloor: (floor) => set({ currentFloor: floor }),
  setActiveView: (view) => set({ activeView: view }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  toggleTheme: () =>
    set((state) => ({
      themeMode: state.themeMode === 'dark' ? 'light' : 'dark',
    })),
  setOfficeViewMode: (mode) => set({ officeViewMode: mode }),
  setAutoBehaviorEnabled: (enabled) => set({ autoBehaviorEnabled: enabled }),
  markNotificationsSeen: (seenAt = new Date()) => set({ notificationsSeenAt: seenAt }),
  setWebhookSettings: (settings) =>
    set((state) => ({ webhookSettings: { ...state.webhookSettings, ...settings } })),
  setSchedulerSettings: (settings) =>
    set((state) => ({ schedulerSettings: { ...state.schedulerSettings, ...settings } })),
  clearMessages: () => set({ messages: [], notificationsSeenAt: new Date() }),
  clearTasks: () => set({ tasks: [], notificationsSeenAt: new Date() }),
}), {
  name: STORE_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (state): PersistedAgentState => ({
    directives: state.directives,
    messages: state.messages.slice(-MAX_PERSISTED_MESSAGES),
    tasks: state.tasks.slice(-MAX_PERSISTED_TASKS),
    usageByProvider: state.usageByProvider,
    themeMode: state.themeMode,
    officeViewMode: state.officeViewMode,
    autoBehaviorEnabled: state.autoBehaviorEnabled,
    notificationsSeenAt: state.notificationsSeenAt,
    webhookSettings: state.webhookSettings,
    schedulerSettings: state.schedulerSettings,
  }),
  merge: (persistedState, currentState) => {
    const persisted = (persistedState ?? {}) as Partial<PersistedAgentState>

    return {
      ...currentState,
      ...persisted,
      directives: reviveDirectives(persisted.directives),
      messages: (persisted.messages ?? []).map((m) => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
      })),
      tasks: (persisted.tasks ?? []).map((t) => ({
        ...t,
        createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt),
      })),
      usageByProvider: reviveUsageByProvider(persisted.usageByProvider, currentState.usageByProvider),
      notificationsSeenAt: persisted.notificationsSeenAt
        ? new Date(persisted.notificationsSeenAt)
        : currentState.notificationsSeenAt,
      directiveRevision: currentState.directiveRevision,
    }
  },
}))
