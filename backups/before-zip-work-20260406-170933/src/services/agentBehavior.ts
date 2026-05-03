import { AGENT_TILE_POSITIONS, FLOOR_MAPS, T } from '@/components/office/officeLayout'
import { useAgentStore } from '@/store/agentStore'
import { Agent, AgentPresenceMode, DepartmentId, DEPARTMENTS, DEPT_FLOOR, FloorId } from '@/types'
import { AGENT_GROUND_RULES } from './claudeApi'
import {
  buildDirectiveContext,
  hasActiveMeetingDirective,
  shouldInterruptAgentWork,
  syncDirectiveAgentMessages,
} from './directives'
import { callLLM } from './multiProviderApi'

const AUTO_PROMPTS: Record<DepartmentId, string[]> = {
  ceo: [
    '이번 주 경영진이 먼저 확인해야 할 우선순위를 짧게 정리해라.',
    '확정된 이슈가 없다면 다음 의사결정 전에 필요한 질문을 메모 형태로 남겨라.',
  ],
  executive: [
    '부서 간 조율이 필요한 항목을 짧은 체크리스트로 공유해라.',
    '실행 전 준비 과제를 한두 문장으로 정리해라.',
  ],
  security: [
    '최근 보안 관점에서 먼저 점검해야 할 항목을 간단히 남겨라.',
    '위협 징후가 없더라도 예방 차원의 확인 포인트를 공유해라.',
  ],
  compliance: [
    '이번 주 컴플라이언스 점검에서 빠지면 안 되는 항목을 짧게 적어라.',
    '규정 변화 가능성에 대비해 미리 확인할 서류나 절차를 메모해라.',
  ],
  management: [
    '운영 관점에서 미리 챙겨야 할 관리 이슈를 정리해라.',
    '예산이나 일정 측면에서 먼저 확인할 리스크를 짧게 남겨라.',
  ],
  development: [
    '다음 구현 전에 먼저 정리할 기술 판단 항목을 적어라.',
    '코드 변경 전에 점검해야 할 기술 부채나 영향 범위를 메모해라.',
  ],
  qa: [
    '지금 테스트 우선순위에서 가장 먼저 볼 시나리오를 적어라.',
    '회귀 위험이 높은 지점을 한두 문장으로 정리해라.',
  ],
  devops: [
    '배포 전후로 먼저 확인할 운영 지표를 짧게 공유해라.',
    '인프라 관점에서 눈여겨볼 징후를 메모해라.',
  ],
  planning: [
    '다음 스프린트 전에 정리할 요구사항 질문을 남겨라.',
    '우선순위 재조정이 필요할 수 있는 항목을 짧게 적어라.',
  ],
  support: [
    '자주 나올 수 있는 문의에 대비해 확인할 응답 포인트를 정리해라.',
    '고객 대응 전에 미리 점검할 이슈를 메모해라.',
  ],
  sales: [
    '제안 전에 정리해야 할 고객 가치 포인트를 짧게 적어라.',
    '미팅 전에 확인할 질문이나 가설을 메모해라.',
  ],
  presales: [
    '데모 전에 점검할 기술 설명 포인트를 적어라.',
    '제안서 준비 전에 빠지면 안 되는 질문을 정리해라.',
  ],
  marketing: [
    '캠페인 전에 먼저 검증할 메시지 가설을 짧게 남겨라.',
    '콘텐츠 기획 전에 체크할 반응 포인트를 정리해라.',
  ],
}

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

const CAFE_BREAK_ZONES: Bounds[] = [
  { colStart: 1, colEnd: 10, rowStart: 3, rowEnd: 13 },
  { colStart: 16, colEnd: 23, rowStart: 3, rowEnd: 13 },
]

let behaviorInterval: ReturnType<typeof setInterval> | null = null
let behaviorStartTimeout: ReturnType<typeof setTimeout> | null = null
let ambientInterval: ReturnType<typeof setInterval> | null = null
let ambientStartTimeout: ReturnType<typeof setTimeout> | null = null

function getStretchZones(floorId: FloorId): Bounds[] {
  if (floorId === '12f') {
    return [
      { colStart: 1, colEnd: 6, rowStart: 8, rowEnd: 13 },
      { colStart: 1, colEnd: 6, rowStart: 1, rowEnd: 4 },
    ]
  }

  return [
    { colStart: 15, colEnd: 23, rowStart: 8, rowEnd: 13 },
    { colStart: 15, colEnd: 22, rowStart: 2, rowEnd: 6 },
  ]
}

function getWalkZones(floorId: FloorId): Bounds[] {
  if (floorId === '12f') {
    return [
      { colStart: 5, colEnd: 11, rowStart: 2, rowEnd: 12 },
      { colStart: 1, colEnd: 8, rowStart: 7, rowEnd: 12 },
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
  const coffeeTile = home.floorId !== '1f'
    ? pickRemoteTile('1f', { col: 12, row: 7 }, CAFE_BREAK_ZONES, 2)
    : undefined

  const plans: AmbientPlan[] = []

  if (stretchTile) {
    plans.push({
      mode: 'stretch',
      floorId: home.floorId,
      tile: stretchTile,
      departMessage: '잠깐 몸 풀러 가는 중...',
      arrivalMessage: '가볍게 스트레칭 중',
      returnMessage: '업무 자리로 복귀하는 중...',
      dwellMs: randomRange(8000, 12000),
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
      dwellMs: randomRange(9000, 14000),
    })
  }

  if (coffeeTile && Math.random() < 0.45) {
    plans.push({
      mode: 'coffee',
      floorId: '1f',
      tile: coffeeTile,
      departMessage: '카페에 커피 가지러 가는 중...',
      arrivalMessage: '카페에서 잠깐 쉬는 중',
      returnMessage: '커피 들고 복귀하는 중...',
      dwellMs: randomRange(14000, 20000),
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
  if (activeAmbientRoutines.size >= 3) return

  const idleAgents = store.agents.filter((agent) => (
    agent.status === 'idle'
    && !hasActiveMeetingDirective(agent.departmentId)
    && !store.agentPresenceById[agent.id]
    && !activeAmbientRoutines.has(agent.id)
  ))

  if (idleAgents.length === 0) return
  if (Math.random() > (activeAmbientRoutines.size === 0 ? 0.72 : 0.38)) return

  startAmbientRoutine(chooseRandom(idleAgents))
}

async function triggerAutoBehavior() {
  const store = useAgentStore.getState()
  const idleAgents = store.agents.filter((agent) => (
    agent.status === 'idle'
    && !hasActiveMeetingDirective(agent.departmentId)
    && !store.agentPresenceById[agent.id]
  ))
  if (idleAgents.length === 0) return

  const agent = chooseRandom(idleAgents)
  const prompts = AUTO_PROMPTS[agent.departmentId]
  const prompt = prompts[Math.floor(Math.random() * prompts.length)]
  const dept = DEPARTMENTS[agent.departmentId]
  const directiveContext = buildDirectiveContext({ departmentId: agent.departmentId, mode: 'behavior' })
  const directiveRevisionAtStart = store.directiveRevision

  store.updateAgentStatus(agent.id, 'thinking', '생각 중...')

  try {
    const text = await callLLM({
      model: agent.model,
      maxTokens: 256,
      system: [
        `당신은 IT 보안 회사 ${dept.name}의 ${agent.role}입니다. 업무 메모를 2~3문장으로 간결하게 작성하세요.`,
        AGENT_GROUND_RULES,
        directiveContext,
        '확정된 사실이 없으면 추측으로 단정하지 말고, 확인할 항목이나 준비 메모 형식으로만 답하세요.',
      ].join('\n\n'),
      messages: [{
        role: 'user',
        content: directiveContext ? `${directiveContext}\n\n[현재 메모 요청]\n${prompt}` : prompt,
      }],
    })

    if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return
    }

    store.addMessage({
      sender: agent.id,
      senderName: `${agent.name} (${agent.role})`,
      content: `[자동 메모]\n${text}`,
      type: 'system',
      departmentIds: [agent.departmentId],
    })
    store.updateAgentStatus(agent.id, 'idle', undefined)
    syncDirectiveAgentMessages()
  } catch (err) {
    console.error('[agentBehavior] 자율 행동 실패:', agent.id, err)
    store.updateAgentStatus(agent.id, 'idle', undefined)
    syncDirectiveAgentMessages()
  }
}

export function startAgentBehavior(intervalMs = 45000) {
  if (behaviorInterval || ambientInterval) return

  behaviorStartTimeout = setTimeout(() => {
    behaviorStartTimeout = null
    triggerAutoBehavior().catch((err) => console.error('[agentBehavior] 초기 실행 실패:', err))
  }, 15000)

  behaviorInterval = setInterval(() => {
    triggerAutoBehavior().catch((err) => console.error('[agentBehavior] 주기 실행 실패:', err))
  }, intervalMs)

  ambientStartTimeout = setTimeout(() => {
    ambientStartTimeout = null
    triggerAmbientBehavior()
  }, 6000)

  ambientInterval = setInterval(triggerAmbientBehavior, 12000)
}

export function stopAgentBehavior() {
  if (behaviorStartTimeout) {
    clearTimeout(behaviorStartTimeout)
    behaviorStartTimeout = null
  }
  if (behaviorInterval) {
    clearInterval(behaviorInterval)
    behaviorInterval = null
  }
  if (ambientStartTimeout) {
    clearTimeout(ambientStartTimeout)
    ambientStartTimeout = null
  }
  if (ambientInterval) {
    clearInterval(ambientInterval)
    ambientInterval = null
  }

  Array.from(activeAmbientRoutines.keys()).forEach((agentId) => finishAmbientRoutine(agentId))
}
