import type { StateCreator } from 'zustand'
import type { AgentStore } from '../agentStore.types'
import type { AgentStatus } from '@/types'
import { DEFAULT_AGENTS } from '../agentDefaults'

export type AgentSlice = Pick<
  AgentStore,
  | 'agents' | 'selectedAgent'
  | 'updateAgentStatus' | 'batchUpdateAgentStatuses' | 'updateAgentMessage'
  | 'updateAgent' | 'setSelectedAgent'
>

export const createAgentSlice: StateCreator<AgentStore, [], [], AgentSlice> = (set) => ({
  agents: DEFAULT_AGENTS,
  selectedAgent: null,

  updateAgentStatus: (id, status, message) =>
    set((state) => ({
      agents: state.agents.map((a) => a.id === id ? { ...a, status, message } : a),
    })),

  batchUpdateAgentStatuses: (updates) =>
    set((state) => {
      const updateMap = new Map(updates.map((u) => [u.id, u]))
      return {
        agents: state.agents.map((a) => {
          const u = updateMap.get(a.id)
          return u ? { ...a, status: u.status as AgentStatus, message: u.message } : a
        }),
      }
    }),

  updateAgentMessage: (id, message) =>
    set((state) => ({ agents: state.agents.map((a) => a.id === id ? { ...a, message } : a) })),

  updateAgent: (id, updates) =>
    set((state) => ({ agents: state.agents.map((a) => a.id === id ? { ...a, ...updates } : a) })),

  setSelectedAgent: (id) => set({ selectedAgent: id }),
})
