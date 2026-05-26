import { useAgentStore } from '@/store/agentStore'
import { AgentStatus } from '@/types'
import { hasActiveMeetingDirective } from './directives'

let ambientStartTimeout: ReturnType<typeof setTimeout> | null = null
let deskActivityInterval: ReturnType<typeof setInterval> | null = null

const activeDeskRoutines = new Map<string, ReturnType<typeof setTimeout>>()

const DESK_ACTIVITY_POOL: AgentStatus[] = [
  'working', 'working', 'working',
  'thinking', 'thinking',
  'idle',
]

function chooseRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function randomRange(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function clearDeskRoutine(agentId: string) {
  const timerId = activeDeskRoutines.get(agentId)
  if (timerId !== undefined) clearTimeout(timerId)
  activeDeskRoutines.delete(agentId)
}

function triggerDeskActivity() {
  const store = useAgentStore.getState()

  const candidates = store.agents.filter((agent) =>
    (agent.status === 'idle' || agent.status === 'working' || agent.status === 'thinking')
    && !activeDeskRoutines.has(agent.id)
    && !hasActiveMeetingDirective(agent.departmentId)
    && !agent.message
  )

  if (candidates.length === 0) return

  const batchSize = Math.min(randomRange(2, 5), candidates.length)
  const chosen = [...candidates].sort(() => Math.random() - 0.5).slice(0, batchSize)

  const batchUpdates: Array<{ id: string; status: AgentStatus; message?: string }> = []

  for (const agent of chosen) {
    const newStatus = chooseRandom(DESK_ACTIVITY_POOL)
    const duration = randomRange(5000, 16000)

    batchUpdates.push({ id: agent.id, status: newStatus, message: undefined })

    const timerId = setTimeout(() => {
      clearDeskRoutine(agent.id)
      const latestStore = useAgentStore.getState()
      const latestAgent = latestStore.agents.find((a) => a.id === agent.id)
      if (latestAgent?.status === newStatus && !latestAgent.message) {
        latestStore.updateAgentStatus(agent.id, 'idle', undefined)
      }
    }, duration)

    activeDeskRoutines.set(agent.id, timerId)
  }

  if (batchUpdates.length > 0) {
    store.batchUpdateAgentStatuses(batchUpdates)
  }
}

export function startAmbientBehavior() {
  if (deskActivityInterval) return

  ambientStartTimeout = setTimeout(() => {
    ambientStartTimeout = null
    triggerDeskActivity()
  }, 3000)

  deskActivityInterval = setInterval(triggerDeskActivity, 5000)
}

export function stopAmbientBehavior() {
  if (ambientStartTimeout) {
    clearTimeout(ambientStartTimeout)
    ambientStartTimeout = null
  }
  if (deskActivityInterval) {
    clearInterval(deskActivityInterval)
    deskActivityInterval = null
  }

  activeDeskRoutines.forEach((timerId) => clearTimeout(timerId))
  activeDeskRoutines.clear()
}
