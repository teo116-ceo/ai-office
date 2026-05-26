import type { StateCreator } from 'zustand'
import type { AgentStore } from '../agentStore.types'

const MAX_PERSISTED_MEMORIES = 200

export type MemorySlice = Pick<
  AgentStore,
  | 'memories' | 'memoryEnabled'
  | 'addMemory' | 'updateMemory' | 'deleteMemory' | 'clearMemories' | 'setMemoryEnabled'
>

export const createMemorySlice: StateCreator<AgentStore, [], [], MemorySlice> = (set) => ({
  memories: [],
  memoryEnabled: true,

  addMemory: (memory) =>
    set((state) => ({
      memories: [...state.memories, { ...memory, id: crypto.randomUUID(), createdAt: new Date() }]
        .slice(-MAX_PERSISTED_MEMORIES),
    })),

  updateMemory: (id, updates) =>
    set((state) => ({ memories: state.memories.map((m) => m.id === id ? { ...m, ...updates } : m) })),

  deleteMemory: (id) =>
    set((state) => ({ memories: state.memories.filter((m) => m.id !== id) })),

  clearMemories: () => set({ memories: [] }),
  setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),
})

export { MAX_PERSISTED_MEMORIES }
