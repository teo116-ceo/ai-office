import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  Agent,
  AgentMemory,
  AgentTrigger,
  ApprovalPolicySettings,
  Message,
  Task,
  AgentStatus,
  FloorId,
  WorkspaceView,
  ThemeMode,
  FontFamily,
  FontSize,
  ResponseLanguage,
  DirectiveKind,
  OrganizationDirective,
  ProviderId,
  ProviderUsageStats,
  AgentPresence,
  Toast,
  ToastLevel,
  ExecutionLog,
  ExecutionLogKind,
  DailyTokenBudget,
  TaskReview,
} from '@/types'
import type { WebhookSettings } from '@/services/webhookService'
import type { SchedulerSettings } from '@/services/schedulerService'
import type { NotionSettings } from '@/services/notionService'
import { DEFAULT_APPROVAL_POLICIES } from '@/services/approvalPolicy'
import { validateWebhookUrl } from '@/utils/webhookValidation'
import { repairLegacyTaskTitle } from '@/utils/taskTitle'
import { getNextThemeMode, isThemeMode } from '@/utils/themePresets'
import { DEFAULT_AGENTS, DEFAULT_TRIGGERS } from './agentDefaults'

const emptyUsage = (provider: ProviderId): ProviderUsageStats => ({
  provider,
  requestCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  updatedAt: null,
})

interface AgentStore {
  agents: Agent[]
  messages: Message[]
  tasks: Task[]
  memories: AgentMemory[]
  memoryEnabled: boolean
  approvalRequired: boolean
  approvalPolicies: ApprovalPolicySettings
  directives: OrganizationDirective[]
  directiveRevision: number
  usageByProvider: Record<ProviderId, ProviderUsageStats>
  agentPresenceById: Record<string, AgentPresence>
  selectedAgent: string | null
  currentFloor: FloorId
  activeView: WorkspaceView
  themeMode: ThemeMode
  fontFamily: FontFamily
  fontSize: FontSize
  responseLanguage: ResponseLanguage
  notificationsSeenAt: Date
  webhookSettings: WebhookSettings
  schedulerSettings: SchedulerSettings
  notionSettings: NotionSettings
  updateAgentStatus: (id: string, status: AgentStatus, message?: string) => void
  updateAgentMessage: (id: string, message?: string) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'> & { id?: string }) => string
  updateMessage: (id: string, updates: Partial<Omit<Message, 'id' | 'timestamp'>>) => void
  addTask: (task: Omit<Task, 'id' | 'createdAt'> & { id?: string }) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  addTaskReview: (taskId: string, review: Omit<TaskReview, 'id' | 'createdAt'>) => void
  addMemory: (memory: Omit<AgentMemory, 'id' | 'createdAt'>) => void
  updateMemory: (id: string, updates: Partial<AgentMemory>) => void
  deleteMemory: (id: string) => void
  clearMemories: () => void
  setMemoryEnabled: (enabled: boolean) => void
  approveTask: (taskId: string) => void
  rejectTask: (taskId: string) => void
  setApprovalRequired: (required: boolean) => void
  setApprovalPolicies: (settings: Partial<ApprovalPolicySettings>) => void
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
  updateAgent: (id: string, updates: Partial<Pick<Agent, 'name' | 'role' | 'model'>>) => void
  setSelectedAgent: (id: string | null) => void
  setCurrentFloor: (floor: FloorId) => void
  setActiveView: (view: WorkspaceView) => void
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
  setFontFamily: (font: FontFamily) => void
  setFontSize: (size: FontSize) => void
  setResponseLanguage: (lang: ResponseLanguage) => void
  markNotificationsSeen: (seenAt?: Date) => void
  setWebhookSettings: (settings: Partial<WebhookSettings>) => void
  resetWebhookSettings: () => void
  setSchedulerSettings: (settings: Partial<SchedulerSettings>) => void
  setNotionSettings: (settings: Partial<NotionSettings>) => void
  resetNotionSettings: () => void
  clearMessages: () => void
  clearTasks: () => void
  toasts: Toast[]
  addToast: (level: ToastLevel, title: string, message?: string, durationMs?: number, taskId?: string, approvalReasons?: import('@/types').TaskApprovalReason[]) => void
  removeToast: (id: string) => void
  sessionContext: string
  setSessionContext: (ctx: string) => void
  activeThreadId: string | null
  setActiveThreadId: (id: string | null) => void
  threadSummaries: Record<string, string>
  setThreadSummary: (threadId: string, summary: string) => void
  executionLogs: ExecutionLog[]
  addExecutionLog: (kind: ExecutionLogKind, label: string, detail?: string) => void
  clearExecutionLogs: () => void
  debateEnabled: boolean
  setDebateEnabled: (enabled: boolean) => void
  triggers: AgentTrigger[]
  triggersEnabled: boolean
  setTriggers: (triggers: AgentTrigger[]) => void
  setTriggersEnabled: (enabled: boolean) => void
  dailyTokenBudget: DailyTokenBudget
  setDailyTokenBudget: (settings: Partial<DailyTokenBudget>) => void
  checkAndConsumeTokenBudget: (tokens: number) => boolean  // true: OK, false: 예산 초과
}

const MAX_PERSISTED_MEMORIES = 200
const MAX_PERSISTED_EXECUTION_LOGS = 100

type PersistedAgentState = Pick<
  AgentStore,
  'directives'
  | 'messages'
  | 'tasks'
  | 'memories'
  | 'memoryEnabled'
  | 'approvalRequired'
  | 'approvalPolicies'
  | 'usageByProvider'
  | 'notificationsSeenAt'
  | 'webhookSettings'
  | 'schedulerSettings'
  | 'triggers'
  | 'triggersEnabled'
  | 'debateEnabled'
  | 'executionLogs'
  | 'dailyTokenBudget'
> & {
  notionSettings: Omit<NotionSettings, 'token'>
}

const MAX_PERSISTED_MESSAGES = 100
const MAX_PERSISTED_TASKS = 50

const STORE_STORAGE_KEY = 'ai-office-store'

// localStorage 용량 초과(QuotaExceededError) 시 메시지를 단계적으로 줄여서 재시도하는 안전한 스토리지
function createSafeStorage() {
  function trySet(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value)
      return true
    } catch (e) {
      const isQuota = e instanceof DOMException && (
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      )
      if (!isQuota) throw e
      return false
    }
  }

  return {
    getItem: (key: string): string | null => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    setItem: (key: string, value: string): void => {
      if (trySet(key, value)) return

      // 용량 초과: 메시지 50개로 줄여서 재시도
      try {
        const parsed = JSON.parse(value) as { state?: { messages?: unknown[]; executionLogs?: unknown[] } }
        if (!parsed?.state) return

        const trimmed = {
          ...parsed,
          state: {
            ...parsed.state,
            messages: (parsed.state.messages ?? []).slice(-50),
          },
        }
        if (trySet(key, JSON.stringify(trimmed))) return

        // 그래도 실패: executionLogs도 제거하고 메시지 20개만
        const minimal = {
          ...parsed,
          state: {
            ...parsed.state,
            messages: (parsed.state.messages ?? []).slice(-20),
            executionLogs: [],
          },
        }
        trySet(key, JSON.stringify(minimal))
      } catch {
        // 파싱 실패 시 저장 포기 (기존 값 유지됨)
      }
    },
    removeItem: (key: string): void => {
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}

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

function reviveNotionSettings(
  notionSettings: Partial<NotionSettings> | undefined,
  fallback: NotionSettings,
): NotionSettings {
  return {
    ...fallback,
    enabled: false,
    databaseId: notionSettings?.databaseId ?? fallback.databaseId,
    departmentDatabases: notionSettings?.departmentDatabases ?? fallback.departmentDatabases,
    onTaskComplete: notionSettings?.onTaskComplete ?? fallback.onTaskComplete,
    onTaskFail: notionSettings?.onTaskFail ?? fallback.onTaskFail,
    token: '',
  }
}

function reviveWebhookSettings(
  webhookSettings: Partial<WebhookSettings> | undefined,
  fallback: WebhookSettings,
): WebhookSettings {
  const next = {
    ...fallback,
    ...webhookSettings,
  }

  return {
    ...next,
    enabled: next.enabled && validateWebhookUrl(next.url).ok,
  }
}

function reviveApprovalPolicies(
  approvalPolicies: Partial<ApprovalPolicySettings> | undefined,
): ApprovalPolicySettings {
  return {
    ...DEFAULT_APPROVAL_POLICIES,
    ...approvalPolicies,
  }
}

export const useAgentStore = create<AgentStore>()(persist((set) => ({
  agents: DEFAULT_AGENTS,
  messages: [],
  tasks: [],
  memories: [],
  memoryEnabled: true,
  approvalRequired: false,
  approvalPolicies: DEFAULT_APPROVAL_POLICIES,
  directives: [],
  directiveRevision: 0,
  usageByProvider: {
    anthropic: emptyUsage('anthropic'),
    openai: emptyUsage('openai'),
    gemini: emptyUsage('gemini'),
  },
  agentPresenceById: {},
  selectedAgent: null,
  currentFloor: '11f',
  activeView: 'office',
  themeMode: (() => {
    const saved = localStorage.getItem('ai-office-theme')
    return isThemeMode(saved) ? saved : 'dark'
  })(),
  fontFamily: (localStorage.getItem('ai-office-font') as FontFamily) ?? 'system',
  fontSize: (localStorage.getItem('ai-office-font-size') as FontSize) ?? 'medium',
  responseLanguage: (localStorage.getItem('ai-office-response-lang') as ResponseLanguage) ?? 'auto',
  notificationsSeenAt: new Date(0),
  webhookSettings: {
    url: '',
    enabled: false,
    onTaskComplete: true,
    onTaskFail: true,
    onDailyBriefing: true,
    departmentWebhooks: {},
  },
  schedulerSettings: {
    enabled: false,
    hourUTC: 9,
    minute: 0,
  },
  notionSettings: {
    enabled: false,
    token: '',
    databaseId: '',
    departmentDatabases: {},
    onTaskComplete: true,
    onTaskFail: false,
  },

  toasts: [],
  addToast: (level, title, message, durationMs, taskId, approvalReasons) => {
    const resolvedDuration = level === 'approval'
      ? undefined  // approval 토스트는 ToastContainer에서 타이머 안 씀
      : (durationMs ?? (level === 'error' ? 8000 : 4000))
    set((state) => {
      const id = crypto.randomUUID()
      return { toasts: [...state.toasts.slice(-4), { id, level, title, message, durationMs: resolvedDuration, taskId, approvalReasons }] }
    })
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  sessionContext: '',
  setSessionContext: (ctx) => set({ sessionContext: ctx }),

  activeThreadId: null,
  setActiveThreadId: (id) => set({ activeThreadId: id }),

  threadSummaries: {},
  setThreadSummary: (threadId, summary) =>
    set((state) => ({ threadSummaries: { ...state.threadSummaries, [threadId]: summary } })),

  executionLogs: [],
  addExecutionLog: (kind, label, detail) =>
    set((state) => ({
      executionLogs: [
        ...state.executionLogs.slice(-(MAX_PERSISTED_EXECUTION_LOGS - 1)),
        { id: crypto.randomUUID(), kind, label, detail, createdAt: new Date() },
      ],
    })),
  clearExecutionLogs: () => set({ executionLogs: [] }),

  debateEnabled: true,
  setDebateEnabled: (enabled) => set({ debateEnabled: enabled }),

  triggers: DEFAULT_TRIGGERS,
  triggersEnabled: true,
  setTriggers: (triggers) => set({ triggers }),
  setTriggersEnabled: (enabled) => set({ triggersEnabled: enabled }),

  dailyTokenBudget: {
    enabled: false,
    limitTokens: 100_000,
    usedToday: 0,
    resetDate: new Date().toISOString().slice(0, 10),
  },
  setDailyTokenBudget: (settings) =>
    set((state) => ({ dailyTokenBudget: { ...state.dailyTokenBudget, ...settings } })),
  checkAndConsumeTokenBudget: (tokens) => {
    // set() 내부에서 원자적으로 검사+소비 — async 사이 race condition 방지
    let allowed = true
    set((state) => {
      const budget = state.dailyTokenBudget
      if (!budget.enabled || budget.limitTokens === 0) return {}

      const today = new Date().toISOString().slice(0, 10)
      if (budget.resetDate !== today) {
        // 날짜가 바뀌면 리셋 후 허용
        return { dailyTokenBudget: { ...budget, usedToday: tokens, resetDate: today } }
      }

      if (budget.usedToday + tokens > budget.limitTokens) {
        allowed = false
        return {}
      }

      return { dailyTokenBudget: { ...budget, usedToday: budget.usedToday + tokens } }
    })
    return allowed
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

  addTaskReview: (taskId, review) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, reviews: [...(t.reviews ?? []), { ...review, id: crypto.randomUUID(), createdAt: new Date() }] }
          : t
      ),
    })),

  addDirective: (directive) => {
    const id = directive.id ?? crypto.randomUUID()
    set((state) => ({
      directives: [
        ...state.directives,
        { ...directive, id, createdAt: new Date() },
      ].slice(-20),
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

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => a.id === id ? { ...a, ...updates } : a),
    })),

  setSelectedAgent: (id) => set({ selectedAgent: id }),
  setCurrentFloor: (floor) => set({ currentFloor: floor }),
  setActiveView: (view) => set({ activeView: view }),
  setThemeMode: (mode) => {
    localStorage.setItem('ai-office-theme', mode)
    set({ themeMode: mode })
  },
  toggleTheme: () =>
    set((state) => {
      const next = getNextThemeMode(state.themeMode)
      localStorage.setItem('ai-office-theme', next)
      return { themeMode: next }
    }),
  setFontFamily: (font) => {
    localStorage.setItem('ai-office-font', font)
    set({ fontFamily: font })
  },
  setFontSize: (size) => {
    localStorage.setItem('ai-office-font-size', size)
    set({ fontSize: size })
  },
  setResponseLanguage: (lang) => {
    localStorage.setItem('ai-office-response-lang', lang)
    set({ responseLanguage: lang })
  },
  markNotificationsSeen: (seenAt = new Date()) => set({ notificationsSeenAt: seenAt }),
  setWebhookSettings: (settings) =>
    set((state) => ({ webhookSettings: { ...state.webhookSettings, ...settings } })),
  resetWebhookSettings: () =>
    set({ webhookSettings: { url: '', enabled: false, onTaskComplete: true, onTaskFail: true, onDailyBriefing: true, departmentWebhooks: {} } }),
  setSchedulerSettings: (settings) =>
    set((state) => ({ schedulerSettings: { ...state.schedulerSettings, ...settings } })),
  setNotionSettings: (settings) =>
    set((state) => ({ notionSettings: { ...state.notionSettings, ...settings } })),
  resetNotionSettings: () =>
    set({ notionSettings: { enabled: false, token: '', databaseId: '', departmentDatabases: {}, onTaskComplete: true, onTaskFail: false } }),
  addMemory: (memory) => {
    const id = crypto.randomUUID()
    set((state) => ({
      memories: [
        ...state.memories,
        { ...memory, id, createdAt: new Date() },
      ].slice(-MAX_PERSISTED_MEMORIES),
    }))
  },

  updateMemory: (id, updates) =>
    set((state) => ({
      memories: state.memories.map((m) => m.id === id ? { ...m, ...updates } : m),
    })),

  deleteMemory: (id) =>
    set((state) => ({ memories: state.memories.filter((m) => m.id !== id) })),

  clearMemories: () => set({ memories: [] }),

  setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),

  approveTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId && t.status === 'awaiting_approval'
          ? { ...t, status: 'completed' as const }
          : t
      ),
    })),

  rejectTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId && t.status === 'awaiting_approval'
          ? { ...t, status: 'failed' as const }
          : t
      ),
    })),

  setApprovalRequired: (required) => set({ approvalRequired: required }),
  setApprovalPolicies: (settings) =>
    set((state) => ({ approvalPolicies: { ...state.approvalPolicies, ...settings } })),

  clearMessages: () => set({ messages: [], notificationsSeenAt: new Date() }),
  clearTasks: () => set({ tasks: [], notificationsSeenAt: new Date() }),
}), {
  name: STORE_STORAGE_KEY,
  storage: createJSONStorage(createSafeStorage),
  version: 10,
  migrate: (persistedState, version) => {
    void version
    return persistedState
  },
  partialize: (state): PersistedAgentState => ({
    directives: state.directives,
    messages: state.messages.slice(-MAX_PERSISTED_MESSAGES),
    tasks: state.tasks.slice(-MAX_PERSISTED_TASKS),
    memories: state.memories.slice(-MAX_PERSISTED_MEMORIES),
    memoryEnabled: state.memoryEnabled,
    approvalRequired: state.approvalRequired,
    approvalPolicies: state.approvalPolicies,
    usageByProvider: state.usageByProvider,
    notificationsSeenAt: state.notificationsSeenAt,
    webhookSettings: state.webhookSettings,
    schedulerSettings: state.schedulerSettings,
    notionSettings: {
      enabled: state.notionSettings.enabled,
      databaseId: state.notionSettings.databaseId,
      departmentDatabases: state.notionSettings.departmentDatabases,
      onTaskComplete: state.notionSettings.onTaskComplete,
      onTaskFail: state.notionSettings.onTaskFail,
    },
    triggers: state.triggers,
    triggersEnabled: state.triggersEnabled,
    debateEnabled: state.debateEnabled,
    executionLogs: state.executionLogs.slice(-MAX_PERSISTED_EXECUTION_LOGS),
    dailyTokenBudget: state.dailyTokenBudget,
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
        ...repairLegacyTaskTitle(t),
        createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt),
        reviews: (t.reviews ?? []).map((r: TaskReview) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
        })),
      })),
      memories: (persisted.memories ?? []).map((mem) => ({
        ...mem,
        createdAt: mem.createdAt instanceof Date ? mem.createdAt : new Date(mem.createdAt),
        lastAccessedAt: mem.lastAccessedAt
          ? (mem.lastAccessedAt instanceof Date ? mem.lastAccessedAt : new Date(mem.lastAccessedAt))
          : undefined,
      })),
      memoryEnabled: persisted.memoryEnabled ?? true,
      approvalRequired: persisted.approvalRequired ?? false,
      approvalPolicies: reviveApprovalPolicies(persisted.approvalPolicies),
      usageByProvider: reviveUsageByProvider(persisted.usageByProvider, currentState.usageByProvider),
      webhookSettings: reviveWebhookSettings(persisted.webhookSettings, currentState.webhookSettings),
      notionSettings: reviveNotionSettings(persisted.notionSettings, currentState.notionSettings),
      notificationsSeenAt: persisted.notificationsSeenAt
        ? new Date(persisted.notificationsSeenAt)
        : currentState.notificationsSeenAt,
      executionLogs: (persisted.executionLogs ?? []).map((log) => ({
        ...log,
        createdAt: log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt),
      })),
      dailyTokenBudget: persisted.dailyTokenBudget ?? currentState.dailyTokenBudget,
      directiveRevision: currentState.directiveRevision,
    }
  },
}))
