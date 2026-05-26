import type { StateCreator } from 'zustand'
import type { AgentStore } from '../agentStore.types'
import type { FloorId, WorkspaceView, ExecutionLogKind, ToastLevel, TaskApprovalReason } from '@/types'

const MAX_PERSISTED_EXECUTION_LOGS = 100

export { MAX_PERSISTED_EXECUTION_LOGS }

export type UiSlice = Pick<
  AgentStore,
  | 'currentFloor' | 'activeView' | 'notificationsSeenAt'
  | 'toasts' | 'executionLogs' | 'debateEnabled'
  | 'setCurrentFloor' | 'setActiveView' | 'markNotificationsSeen'
  | 'addToast' | 'removeToast'
  | 'addExecutionLog' | 'clearExecutionLogs'
  | 'setDebateEnabled'
>

export const createUiSlice: StateCreator<AgentStore, [], [], UiSlice> = (set) => ({
  currentFloor: '11f' as FloorId,
  activeView: 'office' as WorkspaceView,
  notificationsSeenAt: new Date(0),
  toasts: [],
  executionLogs: [],
  debateEnabled: false,

  setCurrentFloor: (floor) => set({ currentFloor: floor }),
  setActiveView: (view) => set({ activeView: view }),
  markNotificationsSeen: (seenAt = new Date()) => set({ notificationsSeenAt: seenAt }),

  addToast: (level: ToastLevel, title: string, message?: string, durationMs?: number, taskId?: string, approvalReasons?: TaskApprovalReason[]) => {
    const resolvedDuration = level === 'approval'
      ? undefined
      : (durationMs ?? (level === 'error' ? 8000 : 4000))
    set((state) => {
      const id = crypto.randomUUID()
      return { toasts: [...state.toasts.slice(-4), { id, level, title, message, durationMs: resolvedDuration, taskId, approvalReasons }] }
    })
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  addExecutionLog: (kind: ExecutionLogKind, label: string, detail?: string) =>
    set((state) => ({
      executionLogs: [
        ...state.executionLogs.slice(-(MAX_PERSISTED_EXECUTION_LOGS - 1)),
        { id: crypto.randomUUID(), kind, label, detail, createdAt: new Date() },
      ],
    })),
  clearExecutionLogs: () => set({ executionLogs: [] }),

  setDebateEnabled: (enabled) => set({ debateEnabled: enabled }),
})
