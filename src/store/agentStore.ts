import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { encryptToBase64, decryptFromBase64 } from '@/utils/cryptoStorage'
import type { AgentStore } from './agentStore.types'
import type { TaskReview } from '@/types'
import type { NotionSettings } from '@/services/notionService'
import { DEFAULT_APPROVAL_POLICIES } from '@/services/approvalPolicy'
import { repairLegacyTaskTitle } from '@/utils/taskTitle'
import { createAgentSlice } from './slices/agentSlice'
import { createTaskSlice } from './slices/taskSlice'
import { createMessageSlice } from './slices/messageSlice'
import { createMemorySlice, MAX_PERSISTED_MEMORIES } from './slices/memorySlice'
import { createSettingsSlice, reviveWebhookSettings } from './slices/settingsSlice'
import { createUiSlice } from './slices/uiSlice'

export type { AgentStore }

// ─── RBAC 셀렉터 ─────────────────────────────────────────────────────────────
// 접근 권한이 활성화된 경우 허용된 부서의 에이전트만 반환한다.
// 사용법: useAgentStore(selectVisibleAgents)
export const selectVisibleAgents = (state: AgentStore) => {
  const { agents, accessControl } = state
  if (!accessControl.enabled || !accessControl.allowedDepartments) return agents
  const allowed = new Set(accessControl.allowedDepartments)
  return agents.filter((a) => allowed.has(a.departmentId))
}

// ─── 퍼시스트 대상 필드 ────────────────────────────────────────────────────────
type PersistedAgentState = Pick<
  AgentStore,
  | 'directives' | 'messages' | 'tasks' | 'memories' | 'memoryEnabled'
  | 'approvalRequired' | 'approvalPolicies'
  | 'notificationsSeenAt' | 'webhookSettings' | 'schedulerSettings'
  | 'triggers' | 'triggersEnabled' | 'debateEnabled'
  | 'dailyTokenBudget'
> & { notionSettings: Omit<NotionSettings, 'token'> }

const MAX_PERSISTED_MESSAGES = 100
const MAX_PERSISTED_TASKS = 50
const STORE_STORAGE_KEY = 'ai-office-store'

// ─── Safe localStorage (QuotaExceededError 대응) ─────────────────────────────
function createSafeStorage() {
  function trySet(key: string, value: string): boolean {
    try { localStorage.setItem(key, value); return true }
    catch (e) {
      const isQuota = e instanceof DOMException && (
        e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      )
      if (!isQuota) throw e
      return false
    }
  }

  return {
    getItem: (key: string): string | null => {
      try { return localStorage.getItem(key) } catch { return null }
    },
    setItem: (key: string, value: string): void => {
      if (trySet(key, value)) return
      try {
        const parsed = JSON.parse(value) as { state?: { messages?: unknown[]; executionLogs?: unknown[] } }
        if (!parsed?.state) return
        const trimmed = { ...parsed, state: { ...parsed.state, messages: (parsed.state.messages ?? []).slice(-50) } }
        if (trySet(key, JSON.stringify(trimmed))) return
        const minimal = { ...parsed, state: { ...parsed.state, messages: (parsed.state.messages ?? []).slice(-20), executionLogs: [] } }
        trySet(key, JSON.stringify(minimal))
      } catch { /* 파싱 실패 시 저장 포기 */ }
    },
    removeItem: (key: string): void => { try { localStorage.removeItem(key) } catch { /* ignore */ } },
  }
}

// ─── 날짜 부활 헬퍼 ───────────────────────────────────────────────────────────
function reviveDirectives(directives?: AgentStore['directives']) {
  return (directives ?? []).map((d) => ({ ...d, createdAt: d.createdAt instanceof Date ? d.createdAt : new Date(d.createdAt) }))
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

// ─── AES-256-GCM 암호화 스토리지 ─────────────────────────────────────────────
function createEncryptedStorage() {
  const safe = createSafeStorage()
  return {
    getItem: async (key: string): Promise<string | null> => {
      const raw = safe.getItem(key)
      if (!raw) return null
      return decryptFromBase64(raw)
    },
    setItem: async (key: string, value: string): Promise<void> => {
      const encrypted = await encryptToBase64(value)
      safe.setItem(key, encrypted)
    },
    removeItem: async (key: string): Promise<void> => safe.removeItem(key),
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useAgentStore = create<AgentStore>()(persist(
  (...a) => ({
    ...createAgentSlice(...a),
    ...createTaskSlice(...a),
    ...createMessageSlice(...a),
    ...createMemorySlice(...a),
    ...createSettingsSlice(...a),
    ...createUiSlice(...a),
  }),
  {
    name: STORE_STORAGE_KEY,
    storage: createJSONStorage(createEncryptedStorage),
    version: 10,
    migrate: (rawState) => {
      const state = (rawState ?? {}) as Record<string, unknown>

      // v1-v6: triggers 미존재 → 빈 배열로 초기화
      if (!Array.isArray(state.triggers)) state.triggers = []
      if (typeof state.triggersEnabled !== 'boolean') state.triggersEnabled = false

      // v1-v7: debateEnabled 미존재, v1-v10: 기본값 false로 변경 (실행 모드 우선)
      state.debateEnabled = false

      // v1-v8: memories 미존재
      if (!Array.isArray(state.memories)) state.memories = []
      if (typeof state.memoryEnabled !== 'boolean') state.memoryEnabled = true

      // v1-v9: dailyTokenBudget 미존재
      if (!state.dailyTokenBudget || typeof state.dailyTokenBudget !== 'object') {
        state.dailyTokenBudget = {
          enabled: false,
          limitTokens: 100_000,
          usedToday: 0,
          resetDate: new Date().toISOString().slice(0, 10),
        }
      }

      // 모든 버전: 배열 타입 필드 보호 (타입 변경 시 앱 크래시 방지)
      if (!Array.isArray(state.messages)) state.messages = []
      if (!Array.isArray(state.tasks)) state.tasks = []
      if (!Array.isArray(state.directives)) state.directives = []

      return state
    },
    partialize: (state): PersistedAgentState => ({
      directives: state.directives,
      messages: state.messages.slice(-MAX_PERSISTED_MESSAGES),
      tasks: state.tasks.slice(-MAX_PERSISTED_TASKS),
      memories: state.memories.slice(-MAX_PERSISTED_MEMORIES),
      memoryEnabled: state.memoryEnabled,
      approvalRequired: state.approvalRequired,
      approvalPolicies: state.approvalPolicies,
      // usageByProvider는 세션 기반 ("이번 세션" 누적) → 저장하지 않음
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
      // executionLogs는 세션 기반 → 저장하지 않음
      dailyTokenBudget: state.dailyTokenBudget,
    }),
    merge: (persistedState, currentState) => {
      const persisted = (persistedState ?? {}) as Partial<PersistedAgentState>
      return {
        ...currentState,
        ...persisted,
        directives: reviveDirectives(persisted.directives),
        messages: (persisted.messages ?? []).map((m) => ({
          ...m, timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
        })),
        tasks: (persisted.tasks ?? []).map((t) => ({
          ...repairLegacyTaskTitle(t),
          createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt),
          reviews: (t.reviews ?? []).map((r: TaskReview) => ({
            ...r, createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
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
        approvalPolicies: { ...DEFAULT_APPROVAL_POLICIES, ...persisted.approvalPolicies },
        usageByProvider: currentState.usageByProvider, // 세션 기반 — 저장하지 않고 항상 초기값 사용
        themeMode: currentState.themeMode, // ai-office-theme 키로 별도 관리 — 구버전 persisted 값이 덮어쓰지 못하게 차단
        fontFamily: currentState.fontFamily,
        fontSize: currentState.fontSize,
        responseLanguage: currentState.responseLanguage,
        webhookSettings: reviveWebhookSettings(persisted.webhookSettings, currentState.webhookSettings),
        notionSettings: reviveNotionSettings(persisted.notionSettings, currentState.notionSettings),
        notificationsSeenAt: persisted.notificationsSeenAt
          ? new Date(persisted.notificationsSeenAt)
          : currentState.notificationsSeenAt,
        executionLogs: currentState.executionLogs, // 세션 기반 — 항상 빈 배열로 시작
        dailyTokenBudget: persisted.dailyTokenBudget ?? currentState.dailyTokenBudget,
        directiveRevision: currentState.directiveRevision,
      }
    },
  },
))
