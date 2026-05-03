import { AGENT_TILE_POSITIONS, FLOOR_MAPS, T } from '@/components/office/officeLayout'
import { useAgentStore } from '@/store/agentStore'
import { Agent, AgentPresenceMode, AgentStatus, DEPT_FLOOR, FloorId } from '@/types'
import { hasActiveMeetingDirective } from './directives'


type Bounds = {
  colStart: number
  colEnd: number
  rowStart: number
  rowEnd: number
}

type AmbientPlan = {
  mode: AgentPresenceMode
  floorId: FloorId
  tile: { col: number; row: number }
  departMessage: string
  arrivalMessage: string
  returnMessage: string
  dwellMs: number
}

type AmbientRoutine = {
  id: string
  timers: Array<ReturnType<typeof setTimeout>>
}

const DEFAULT_HOME_TILE = { col: 5, row: 7 }
const WALKABLE_TILES = new Set<number>([T.FLOOR, T.DOOR, T.PLANT])
const AMBIENT_MESSAGE_PREFIX = '[휴식]'
const activeAmbientRoutines = new Map<string, AmbientRoutine>()

// ── 책상 활동 트래킹 ───────────────────────────────────────────────────────────
const activeDeskRoutines = new Map<string, ReturnType<typeof setTimeout>>()

let ambientInterval: ReturnType<typeof setInterval> | null = null
let ambientStartTimeout: ReturnType<typeof setTimeout> | null = null
let deskActivityInterval: ReturnType<typeof setInterval> | null = null

function getStretchZones(floorId: FloorId): Bounds[] {
  if (floorId === '11f') {
    return [
      { colStart: 2, colEnd: 7, rowStart: 8, rowEnd: 12 },
      { colStart: 2, colEnd: 6, rowStart: 1, rowEnd: 4 },
    ]
  }

  return [
    { colStart: 15, colEnd: 23, rowStart: 8, rowEnd: 13 },
    { colStart: 15, colEnd: 22, rowStart: 2, rowEnd: 6 },
  ]
}

function getWalkZones(floorId: FloorId): Bounds[] {
  if (floorId === '11f') {
    return [
      { colStart: 4, colEnd: 11, rowStart: 2, rowEnd: 12 },
      { colStart: 1, colEnd: 8, rowStart: 7, rowEnd: 11 },
    ]
  }

  return [
    { colStart: 9, colEnd: 14, rowStart: 2, rowEnd: 12 },
    { colStart: 15, colEnd: 23, rowStart: 7, rowEnd: 12 },
  ]
}

function chooseRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function formatAmbientMessage(text: string) {
  return `${AMBIENT_MESSAGE_PREFIX} ${text}`
}

function isAmbientMessage(message?: string) {
  return Boolean(message && message.startsWith(AMBIENT_MESSAGE_PREFIX))
}

function randomRange(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function tileDistance(left: { col: number; row: number }, right: { col: number; row: number }) {
  return Math.abs(left.col - right.col) + Math.abs(left.row - right.row)
}

function getHomeLocation(agent: Pick<Agent, 'id' | 'departmentId'>) {
  return {
    floorId: DEPT_FLOOR[agent.departmentId],
    tile: AGENT_TILE_POSITIONS[agent.id] ?? DEFAULT_HOME_TILE,
  }
}

function collectWalkableTiles(floorId: FloorId, boundsList: Bounds[]) {
  const map = FLOOR_MAPS[floorId]
  const positions: Array<{ col: number; row: number }> = []

  for (const bounds of boundsList) {
    for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
      for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
        if (row < 0 || col < 0 || row >= map.length || col >= map[row].length) continue
        if (WALKABLE_TILES.has(map[row][col])) {
          positions.push({ col, row })
        }
      }
    }
  }

  return positions
}

function pickRemoteTile(
  floorId: FloorId,
  homeTile: { col: number; row: number },
  boundsList: Bounds[],
  minDistance: number,
) {
  const candidates = collectWalkableTiles(floorId, boundsList)
    .filter((tile) => tileDistance(tile, homeTile) >= minDistance)

  if (candidates.length > 0) {
    return chooseRandom(candidates)
  }

  const fallback = collectWalkableTiles(floorId, [{
    colStart: 0,
    colEnd: FLOOR_MAPS[floorId][0].length - 1,
    rowStart: 0,
    rowEnd: FLOOR_MAPS[floorId].length - 1,
  }]).filter((tile) => tileDistance(tile, homeTile) >= Math.max(2, minDistance - 1))

  return fallback.length > 0 ? chooseRandom(fallback) : undefined
}

function estimateTravelMs(
  originFloorId: FloorId,
  originTile: { col: number; row: number },
  targetFloorId: FloorId,
  targetTile: { col: number; row: number },
) {
  const distance = tileDistance(originTile, targetTile)
  const floorPenalty = originFloorId === targetFloorId ? 0 : 3800
  return 1400 + distance * 260 + floorPenalty
}

function clearRoutineTimers(routine?: AmbientRoutine) {
  routine?.timers.forEach((timer) => clearTimeout(timer))
}

function finishAmbientRoutine(agentId: string) {
  const routine = activeAmbientRoutines.get(agentId)
  clearRoutineTimers(routine)
  activeAmbientRoutines.delete(agentId)

  const store = useAgentStore.getState()
  const agent = store.agents.find((candidate) => candidate.id === agentId)
  store.clearAgentPresence(agentId)

  if (agent && (agent.status === 'idle' || agent.status === 'moving') && isAmbientMessage(agent.message)) {
    store.updateAgentStatus(agentId, 'idle', undefined)
  }
}

function routineStillActive(agentId: string, routineId: string) {
  const routine = activeAmbientRoutines.get(agentId)
  if (!routine || routine.id !== routineId) {
    return false
  }

  const store = useAgentStore.getState()
  const agent = store.agents.find((candidate) => candidate.id === agentId)
  if (!agent || hasActiveMeetingDirective(agent.departmentId) || !['idle', 'moving'].includes(agent.status)) {
    finishAmbientRoutine(agentId)
    return false
  }

  return true
}

function buildAmbientPlan(agent: Agent): AmbientPlan | null {
  const home = getHomeLocation(agent)
  const stretchTile = pickRemoteTile(home.floorId, home.tile, getStretchZones(home.floorId), 3)
  const walkTile = pickRemoteTile(home.floorId, home.tile, getWalkZones(home.floorId), 4)

  const plans: AmbientPlan[] = []

  if (stretchTile) {
    plans.push({
      mode: 'stretch',
      floorId: home.floorId,
      tile: stretchTile,
      departMessage: '잠깐 몸 풀러 가는 중...',
      arrivalMessage: '가볍게 스트레칭 중',
      returnMessage: '업무 자리로 복귀하는 중...',
      dwellMs: randomRange(6000, 10000),
    })
  }

  if (walkTile) {
    plans.push({
      mode: 'walk',
      floorId: home.floorId,
      tile: walkTile,
      departMessage: '사무실을 잠깐 둘러보는 중...',
      arrivalMessage: '복도 쪽을 잠깐 걷는 중',
      returnMessage: '다시 자리로 돌아가는 중...',
      dwellMs: randomRange(7000, 12000),
    })
  }

  return plans.length > 0 ? chooseRandom(plans) : null
}

function startAmbientRoutine(agent: Agent) {
  const plan = buildAmbientPlan(agent)
  if (!plan) return

  finishAmbientRoutine(agent.id)

  const store = useAgentStore.getState()
  const home = getHomeLocation(agent)
  const outboundMs = estimateTravelMs(home.floorId, home.tile, plan.floorId, plan.tile)
  const inboundMs = estimateTravelMs(plan.floorId, plan.tile, home.floorId, home.tile)
  const routineId = `${Date.now()}-${agent.id}-${Math.random().toString(36).slice(2, 8)}`
  const routine: AmbientRoutine = { id: routineId, timers: [] }

  activeAmbientRoutines.set(agent.id, routine)
  store.setAgentPresence(agent.id, { floorId: plan.floorId, tile: plan.tile, mode: plan.mode })
  store.updateAgentStatus(agent.id, 'moving', formatAmbientMessage(plan.departMessage))

  routine.timers.push(setTimeout(() => {
    if (!routineStillActive(agent.id, routineId)) return
    useAgentStore.getState().updateAgentStatus(agent.id, 'idle', formatAmbientMessage(plan.arrivalMessage))
  }, outboundMs))

  routine.timers.push(setTimeout(() => {
    if (!routineStillActive(agent.id, routineId)) return
    const latestStore = useAgentStore.getState()
    latestStore.updateAgentStatus(agent.id, 'moving', formatAmbientMessage(plan.returnMessage))
    latestStore.clearAgentPresence(agent.id)
  }, outboundMs + plan.dwellMs))

  routine.timers.push(setTimeout(() => {
    if (!routineStillActive(agent.id, routineId)) return
    finishAmbientRoutine(agent.id)
  }, outboundMs + plan.dwellMs + inboundMs))
}

function triggerAmbientBehavior() {
  const store = useAgentStore.getState()
  // 최대 6명 동시 이동 허용
  if (activeAmbientRoutines.size >= 6) return

  const idleAgents = store.agents.filter((agent) => (
    agent.status === 'idle'
    && !hasActiveMeetingDirective(agent.departmentId)
    && !store.agentPresenceById[agent.id]
    && !activeAmbientRoutines.has(agent.id)
  ))

  if (idleAgents.length === 0) return
  // 트리거 확률 상향
  if (Math.random() > (activeAmbientRoutines.size === 0 ? 0.85 : 0.55)) return

  startAmbientRoutine(chooseRandom(idleAgents))
}

// ── 책상 활동 사이클 ────────────────────────────────────────────────────────────
// 실제 업무 중이 아닌 idle 에이전트들의 상태를 working/thinking으로 바꿔
// 책상에 앉아 일하는 것처럼 보이게 함

const DESK_ACTIVITY_POOL: AgentStatus[] = [
  'working', 'working', 'working',  // 타이핑 자주
  'thinking', 'thinking',            // 고민하는 자세
  'idle',                             // 가끔 손 놓기
]

function clearDeskRoutine(agentId: string) {
  const timerId = activeDeskRoutines.get(agentId)
  if (timerId !== undefined) clearTimeout(timerId)
  activeDeskRoutines.delete(agentId)
}

function triggerDeskActivity() {
  const store = useAgentStore.getState()

  // 실제 작업 중이거나 이동 중인 에이전트는 제외
  const candidates = store.agents.filter((agent) =>
    (agent.status === 'idle' || agent.status === 'working' || agent.status === 'thinking')
    && !store.agentPresenceById[agent.id]
    && !activeAmbientRoutines.has(agent.id)
    && !activeDeskRoutines.has(agent.id)
    && !hasActiveMeetingDirective(agent.departmentId)
    && !isAmbientMessage(agent.message)
    && !agent.message  // 실제 업무 메시지 있으면 건드리지 않음
  )

  if (candidates.length === 0) return

  // 한 번에 여러 명 동시 전환 (자연스러운 오피스 느낌)
  const batchSize = Math.min(randomRange(2, 5), candidates.length)
  const chosen = [...candidates].sort(() => Math.random() - 0.5).slice(0, batchSize)

  for (const agent of chosen) {
    const newStatus = chooseRandom(DESK_ACTIVITY_POOL)
    const duration = randomRange(5000, 16000)

    store.updateAgentStatus(agent.id, newStatus, undefined)

    const timerId = setTimeout(() => {
      clearDeskRoutine(agent.id)
      const latestStore = useAgentStore.getState()
      const latestAgent = latestStore.agents.find((a) => a.id === agent.id)
      // 외부에서 상태가 바뀌었으면 건드리지 않음
      if (latestAgent?.status === newStatus && !latestAgent.message) {
        latestStore.updateAgentStatus(agent.id, 'idle', undefined)
      }
    }, duration)

    activeDeskRoutines.set(agent.id, timerId)
  }
}

export function startAmbientBehavior() {
  if (ambientInterval) return

  // 초기 딜레이를 짧게: 3초 후 즉시 첫 동작
  ambientStartTimeout = setTimeout(() => {
    ambientStartTimeout = null
    triggerDeskActivity()
    triggerAmbientBehavior()
  }, 3000)

  // 이동 루틴: 7초마다
  ambientInterval = setInterval(triggerAmbientBehavior, 7000)

  // 책상 활동 사이클: 5초마다
  deskActivityInterval = setInterval(triggerDeskActivity, 5000)
}

export function stopAmbientBehavior() {
  if (ambientStartTimeout) {
    clearTimeout(ambientStartTimeout)
    ambientStartTimeout = null
  }
  if (ambientInterval) {
    clearInterval(ambientInterval)
    ambientInterval = null
  }
  if (deskActivityInterval) {
    clearInterval(deskActivityInterval)
    deskActivityInterval = null
  }

  Array.from(activeAmbientRoutines.keys()).forEach((agentId) => finishAmbientRoutine(agentId))

  activeDeskRoutines.forEach((timerId) => clearTimeout(timerId))
  activeDeskRoutines.clear()
}
