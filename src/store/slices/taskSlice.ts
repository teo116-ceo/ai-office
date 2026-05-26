import type { StateCreator } from 'zustand'
import type { AgentStore } from '../agentStore.types'
import type { TaskReview, DirectiveKind } from '@/types'
import { DEFAULT_APPROVAL_POLICIES } from '@/services/approvalPolicy'
import { DEFAULT_TRIGGERS } from '../agentDefaults'

export type TaskSlice = Pick<
  AgentStore,
  | 'tasks' | 'approvalRequired' | 'approvalPolicies' | 'directives' | 'directiveRevision'
  | 'addTask' | 'updateTask' | 'addTaskReview' | 'approveTask' | 'rejectTask'
  | 'setApprovalRequired' | 'setApprovalPolicies'
  | 'addDirective' | 'clearDirectives' | 'clearTasks'
  | 'triggers' | 'triggersEnabled' | 'setTriggers' | 'setTriggersEnabled'
>

export const createTaskSlice: StateCreator<AgentStore, [], [], TaskSlice> = (set) => ({
  tasks: [],
  approvalRequired: false,
  approvalPolicies: DEFAULT_APPROVAL_POLICIES,
  directives: [],
  directiveRevision: 0,
  triggers: DEFAULT_TRIGGERS,
  triggersEnabled: true,

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, { ...task, id: task.id ?? crypto.randomUUID(), createdAt: new Date() }],
    })),

  updateTask: (id, updates) =>
    set((state) => ({ tasks: state.tasks.map((t) => t.id === id ? { ...t, ...updates } : t) })),

  addTaskReview: (taskId, review) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, reviews: [...(t.reviews ?? []), { ...review, id: crypto.randomUUID(), createdAt: new Date() } as TaskReview] }
          : t
      ),
    })),

  approveTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId && t.status === 'awaiting_approval' ? { ...t, status: 'completed' as const } : t
      ),
    })),

  rejectTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId && t.status === 'awaiting_approval' ? { ...t, status: 'failed' as const } : t
      ),
    })),

  setApprovalRequired: (required) => set({ approvalRequired: required }),

  setApprovalPolicies: (settings) =>
    set((state) => ({ approvalPolicies: { ...state.approvalPolicies, ...settings } })),

  addDirective: (directive) => {
    const id = directive.id ?? crypto.randomUUID()
    set((state) => ({
      directives: [...state.directives, { ...directive, id, createdAt: new Date() }].slice(-20),
      directiveRevision: state.directiveRevision + 1,
    }))
    return id
  },

  clearDirectives: (kind?: DirectiveKind) =>
    set((state) => {
      const nextDirectives = kind ? state.directives.filter((d) => d.kind !== kind) : []
      const changed = nextDirectives.length !== state.directives.length
      return {
        directives: nextDirectives,
        directiveRevision: changed ? state.directiveRevision + 1 : state.directiveRevision,
        agents: state.agents.map((agent) => (
          agent.status === 'idle' || agent.status === 'moving'
            ? { ...agent, status: agent.status === 'moving' ? 'idle' as const : agent.status, message: undefined }
            : agent
        )),
      }
    }),

  clearTasks: () => set((state) => ({ tasks: [], notificationsSeenAt: new Date(state.notificationsSeenAt) })),

  setTriggers: (triggers) => set({ triggers }),
  setTriggersEnabled: (enabled) => set({ triggersEnabled: enabled }),
})
