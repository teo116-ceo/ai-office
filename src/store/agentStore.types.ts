import type {
  Agent,
  AgentMemory,
  AgentTrigger,
  ApprovalPolicySettings,
  Message,
  Task,
  AgentStatus,
  DepartmentId,
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
  Toast,
  ToastLevel,
  ExecutionLog,
  ExecutionLogKind,
  DailyTokenBudget,
  TaskReview,
  TaskApprovalReason,
} from '@/types'

import type { WebhookSettings } from '@/services/webhookService'
import type { SchedulerSettings } from '@/services/schedulerService'
import type { NotionSettings } from '@/services/notionService'

export interface AccessControlSettings {
  enabled: boolean
  // null = 전체 허용, 배열 = 허용된 부서 ID 목록
  allowedDepartments: DepartmentId[] | null
}

export interface AgentStore {
  // ── Agent ──────────────────────────────────────────────────────────────────
  agents: Agent[]
  selectedAgent: string | null
  updateAgentStatus: (id: string, status: AgentStatus, message?: string) => void
  batchUpdateAgentStatuses: (updates: Array<{ id: string; status: AgentStatus; message?: string }>) => void
  updateAgentMessage: (id: string, message?: string) => void
  updateAgent: (id: string, updates: Partial<Pick<Agent, 'name' | 'role' | 'model'>>) => void
  setSelectedAgent: (id: string | null) => void

  // ── Task ───────────────────────────────────────────────────────────────────
  tasks: Task[]
  approvalRequired: boolean
  approvalPolicies: ApprovalPolicySettings
  directives: OrganizationDirective[]
  directiveRevision: number
  addTask: (task: Omit<Task, 'id' | 'createdAt'> & { id?: string }) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  addTaskReview: (taskId: string, review: Omit<TaskReview, 'id' | 'createdAt'>) => void
  approveTask: (taskId: string) => void
  rejectTask: (taskId: string) => void
  setApprovalRequired: (required: boolean) => void
  setApprovalPolicies: (settings: Partial<ApprovalPolicySettings>) => void
  addDirective: (directive: Omit<OrganizationDirective, 'id' | 'createdAt'> & { id?: string }) => string
  clearDirectives: (kind?: DirectiveKind) => void
  clearTasks: () => void

  // ── Message ────────────────────────────────────────────────────────────────
  messages: Message[]
  sessionContext: string
  activeThreadId: string | null
  threadSummaries: Record<string, string>
  addMessage: (message: Omit<Message, 'id' | 'timestamp'> & { id?: string }) => string
  updateMessage: (id: string, updates: Partial<Omit<Message, 'id' | 'timestamp'>>) => void
  clearMessages: () => void
  setSessionContext: (ctx: string) => void
  setActiveThreadId: (id: string | null) => void
  setThreadSummary: (threadId: string, summary: string) => void

  // ── Memory ─────────────────────────────────────────────────────────────────
  memories: AgentMemory[]
  memoryEnabled: boolean
  addMemory: (memory: Omit<AgentMemory, 'id' | 'createdAt'>) => void
  updateMemory: (id: string, updates: Partial<AgentMemory>) => void
  deleteMemory: (id: string) => void
  clearMemories: () => void
  setMemoryEnabled: (enabled: boolean) => void

  // ── Settings ───────────────────────────────────────────────────────────────
  webhookSettings: WebhookSettings
  schedulerSettings: SchedulerSettings
  notionSettings: NotionSettings
  usageByProvider: Record<ProviderId, ProviderUsageStats>
  dailyTokenBudget: DailyTokenBudget
  setWebhookSettings: (settings: Partial<WebhookSettings>) => void
  resetWebhookSettings: () => void
  setSchedulerSettings: (settings: Partial<SchedulerSettings>) => void
  setNotionSettings: (settings: Partial<NotionSettings>) => void
  resetNotionSettings: () => void
  recordProviderUsage: (
    provider: ProviderId,
    usage: { inputTokens: number; outputTokens: number; totalTokens: number; model?: Agent['model'] },
  ) => void
  resetProviderUsage: (provider?: ProviderId) => void
  setDailyTokenBudget: (settings: Partial<DailyTokenBudget>) => void
  checkAndConsumeTokenBudget: (tokens: number) => boolean

  // ── Access Control ──────────────────────────────────────────────────────────
  accessControl: AccessControlSettings
  setAccessControl: (settings: Partial<AccessControlSettings>) => void

  // ── UI ─────────────────────────────────────────────────────────────────────
  currentFloor: FloorId
  activeView: WorkspaceView
  themeMode: ThemeMode
  fontFamily: FontFamily
  fontSize: FontSize
  responseLanguage: ResponseLanguage
  notificationsSeenAt: Date
  toasts: Toast[]
  executionLogs: ExecutionLog[]
  debateEnabled: boolean
  triggers: AgentTrigger[]
  triggersEnabled: boolean
  setCurrentFloor: (floor: FloorId) => void
  setActiveView: (view: WorkspaceView) => void
  setThemeMode: (mode: ThemeMode) => void
  toggleTheme: () => void
  setFontFamily: (font: FontFamily) => void
  setFontSize: (size: FontSize) => void
  setResponseLanguage: (lang: ResponseLanguage) => void
  markNotificationsSeen: (seenAt?: Date) => void
  addToast: (level: ToastLevel, title: string, message?: string, durationMs?: number, taskId?: string, approvalReasons?: TaskApprovalReason[]) => void
  removeToast: (id: string) => void
  addExecutionLog: (kind: ExecutionLogKind, label: string, detail?: string) => void
  clearExecutionLogs: () => void
  setDebateEnabled: (enabled: boolean) => void
  setTriggers: (triggers: AgentTrigger[]) => void
  setTriggersEnabled: (enabled: boolean) => void
}
