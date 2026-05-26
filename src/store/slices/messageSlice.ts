import type { StateCreator } from 'zustand'
import type { AgentStore } from '../agentStore.types'

export type MessageSlice = Pick<
  AgentStore,
  | 'messages' | 'sessionContext' | 'activeThreadId' | 'threadSummaries'
  | 'addMessage' | 'updateMessage' | 'clearMessages'
  | 'setSessionContext' | 'setActiveThreadId' | 'setThreadSummary'
>

export const createMessageSlice: StateCreator<AgentStore, [], [], MessageSlice> = (set) => ({
  messages: [],
  sessionContext: '',
  activeThreadId: null,
  threadSummaries: {},

  addMessage: (message) => {
    const id = message.id ?? crypto.randomUUID()
    set((state) => ({
      messages: [...state.messages, { ...message, id, timestamp: new Date() }],
    }))
    return id
  },

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => m.id === id ? { ...m, ...updates } : m),
    })),

  clearMessages: () => set({ messages: [], notificationsSeenAt: new Date() }),

  setSessionContext: (ctx) => set({ sessionContext: ctx }),
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  setThreadSummary: (threadId, summary) =>
    set((state) => ({ threadSummaries: { ...state.threadSummaries, [threadId]: summary } })),
})
