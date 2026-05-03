import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveAgentFloor, resolveAgentTile } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import {
  AGENT_TILE_POSITIONS,
  DESK_TILE_POSITIONS,
  FLOOR_ATMOSPHERE,
  FLOOR_MAPS,
  MAP_COLS,
  MAP_ROWS,
  T,
  TILE_SIZE,
  WORK_SEAT_TILE_POSITIONS,
} from './officeLayout'
import { drawTile } from './tileDraw'
import { bfsPath, randomWalkableTile } from './pathfinding'
import { Agent, DEPARTMENTS, DepartmentId, FLOORS } from '@/types'

const FRAME_W = 16
const FRAME_H = 32
const SPRITE_SCALE = 2
const CHAR_W = FRAME_W * SPRITE_SCALE
const CHAR_H = FRAME_H * SPRITE_SCALE
const MOVE_SPEED = 1.5

const DEPT_CHAR: Record<DepartmentId, number> = {
  ceo: 0,
  executive: 0,
  security: 4,
  compliance: 0,
  management: 5,
  development: 2,
  qa: 3,
  devops: 5,
  planning: 1,
  support: 1,
  sales: 2,
  presales: 3,
  marketing: 4,
}

type FacingDir = 'down' | 'up' | 'side'

interface CharMover {
  agent: Agent
  px: number
  py: number
  path: Array<{ col: number; row: number }>
  tileCol: number
  tileRow: number
  idleTimer: number
  facingLeft: boolean
  facing: FacingDir
  walkFrame: number
  walkTick: number
}

const spriteCache = new Map<string, HTMLImageElement>()

function loadSprite(src: string): Promise<HTMLImageElement> {
  if (spriteCache.has(src)) return Promise.resolve(spriteCache.get(src)!)

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      spriteCache.set(src, img)
      resolve(img)
    }
    img.onerror = () => resolve(img)
    img.src = src
  })
}

function tileToPixel(col: number, row: number) {
  return {
    px: col * TILE_SIZE + (TILE_SIZE - CHAR_W) / 2,
    py: row * TILE_SIZE + TILE_SIZE - CHAR_H,
  }
}

function resolveDeskFacing(agent: Agent): FacingDir {
  const desk = DESK_TILE_POSITIONS[agent.id]
  const worker = WORK_SEAT_TILE_POSITIONS[agent.id] ?? AGENT_TILE_POSITIONS[agent.id]
  if (!desk || !worker) return 'down'

  const dx = desk.col - worker.col
  const dy = desk.row - worker.row

  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? 'up' : 'down'
  }

  return 'side'
}

export default function PixiOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const spritesRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const moversRef = useRef<Map<string, CharMover>>(new Map())
  const storeRef = useRef(useAgentStore.getState())
  const [scale, setScale] = useState(1)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = useAgentStore.subscribe((state) => {
      storeRef.current = state
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    Array.from({ length: 6 }, (_, index) =>
      loadSprite(`/assets/characters/char_${index}.png`).then((img) => {
        spritesRef.current.set(`char_${index}`, img)
      }),
    )
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const canvasWidth = MAP_COLS * TILE_SIZE
      const canvasHeight = MAP_ROWS * TILE_SIZE
      const nextScale = Math.min(width / canvasWidth, height / canvasHeight) * 0.97
      setScale(Math.min(Math.max(nextScale, 0.3), 1))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const getAgentAtPixel = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const pixelX = ((clientX - rect.left) / rect.width) * canvas.width
    const pixelY = ((clientY - rect.top) / rect.height) * canvas.height

    for (const [id, mover] of moversRef.current) {
      if (pixelX >= mover.px && pixelX <= mover.px + CHAR_W && pixelY >= mover.py && pixelY <= mover.py + CHAR_H) {
        return id
      }
    }

    return null
  }, [scale])

  const handleClick = useCallback((event: React.MouseEvent) => {
    const id = getAgentAtPixel(event.clientX, event.clientY)
    const { selectedAgent, setSelectedAgent } = storeRef.current
    setSelectedAgent(selectedAgent === id ? null : id)
  }, [getAgentAtPixel])

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    setHoveredId(getAgentAtPixel(event.clientX, event.clientY))
  }, [getAgentAtPixel])

  useEffect(() => {
    const canvasElement = canvasRef.current
    if (!canvasElement) return

    const canvas: HTMLCanvasElement = canvasElement
    const context = canvas.getContext('2d')
    if (!context) return

    const ctx: CanvasRenderingContext2D = context

    ctx.imageSmoothingEnabled = false
    let globalTick = 0

    function getFloorMap() {
      return FLOOR_MAPS[storeRef.current.currentFloor]
    }

    function isWalkable(col: number, row: number) {
      const map = getFloorMap()
      if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return false
      const tile = map[row][col]
      return tile === T.FLOOR || tile === T.DOOR || tile === T.PLANT
    }

    function getFloorAgents() {
      const { agents, currentFloor } = storeRef.current
      return agents.filter((agent) => resolveAgentFloor(agent) === currentFloor)
    }

    function syncMovers() {
      const floorAgents = getFloorAgents()
      const activeIds = new Set(floorAgents.map((agent) => agent.id))

      for (const id of moversRef.current.keys()) {
        if (!activeIds.has(id)) moversRef.current.delete(id)
      }

      floorAgents.forEach((agent) => {
        const existing = moversRef.current.get(agent.id)
        if (existing) {
          existing.agent = agent
          return
        }

        const position = resolveAgentTile(agent) ?? AGENT_TILE_POSITIONS[agent.id] ?? { col: 5, row: 7 }
        const { px, py } = tileToPixel(position.col, position.row)

        moversRef.current.set(agent.id, {
          agent,
          px,
          py,
          path: [],
          tileCol: position.col,
          tileRow: position.row,
          idleTimer: 300 + Math.floor(Math.random() * 300),
          facingLeft: false,
          facing: resolveDeskFacing(agent),
          walkFrame: 0,
          walkTick: 0,
        })
      })
    }

    function updateMover(mover: CharMover) {
      const { agent } = mover
      const home = resolveAgentTile(agent) ?? AGENT_TILE_POSITIONS[agent.id]
      const atHome = home && mover.tileCol === home.col && mover.tileRow === home.row
      const presence = storeRef.current.agentPresenceById[agent.id]

      if (!presence && atHome && mover.path.length === 0 && (agent.status === 'idle' || agent.status === 'working' || agent.status === 'thinking')) {
        mover.facing = resolveDeskFacing(agent)
        mover.facingLeft = false
      }

      if ((agent.status === 'working' || agent.status === 'thinking' || agent.status === 'moving') && home && mover.path.length === 0 && !atHome) {
        mover.path = bfsPath(mover.tileCol, mover.tileRow, home.col, home.row, isWalkable)
      }

      if (agent.status === 'idle' && mover.path.length === 0) {
        if (!atHome && home) {
          mover.path = bfsPath(mover.tileCol, mover.tileRow, home.col, home.row, isWalkable)
        } else {
          mover.idleTimer -= 1
          if (mover.idleTimer <= 0) {
            if (Math.random() < 0.1) {
              const target = randomWalkableTile(isWalkable)
              mover.path = bfsPath(mover.tileCol, mover.tileRow, target.col, target.row, isWalkable)
            }
            mover.idleTimer = 300 + Math.floor(Math.random() * 300)
          }
        }
      }

      if (mover.path.length === 0) return

      const next = mover.path[0]
      const targetPx = next.col * TILE_SIZE + (TILE_SIZE - CHAR_W) / 2
      const targetPy = next.row * TILE_SIZE + TILE_SIZE - CHAR_H
      const dx = targetPx - mover.px
      const dy = targetPy - mover.py
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < MOVE_SPEED) {
        mover.px = targetPx
        mover.py = targetPy
        mover.tileCol = next.col
        mover.tileRow = next.row
        mover.path.shift()
      } else {
        mover.px += (dx / dist) * MOVE_SPEED
        mover.py += (dy / dist) * MOVE_SPEED

        if (Math.abs(dx) >= Math.abs(dy)) {
          mover.facing = 'side'
          mover.facingLeft = dx < 0
        } else {
          mover.facing = dy > 0 ? 'down' : 'up'
        }
      }

      mover.walkTick += 1
      if (mover.walkTick % 10 === 0) mover.walkFrame = (mover.walkFrame + 1) % 4
    }

    function getStatusMeta(status: Agent['status']) {
      switch (status) {
        case 'idle':
          return { color: '#44ff88', label: '\uB300\uAE30 \uC911' }
        case 'working':
          return { color: '#ffaa00', label: '\uC791\uC5C5 \uC911' }
        case 'thinking':
          return { color: '#64ffda', label: '\uBD84\uC11D \uC911' }
        case 'moving':
          return { color: '#60a5fa', label: '\uC774\uB3D9 \uC911' }
        default:
          return { color: '#ff4466', label: '\uD1A0\uB860 \uC911' }
      }
    }

    function getModelShort(model: string) {
      const lower = model.toLowerCase()
      if (lower.includes('gpt')) return 'GPT'
      if (lower.includes('gemini')) return 'Gemini'
      if (lower.includes('opus')) return 'Opus'
      if (lower.includes('sonnet')) return 'Sonnet'
      if (lower.includes('haiku')) return 'Haiku'
      return 'Model'
    }

    function drawFallbackCharacter(
      mover: CharMover,
      departmentColor: string,
      charIdx: number,
      isMoving: boolean,
      isWorking: boolean,
    ) {
      ctx.save()

      const flip = mover.facing === 'side' && mover.facingLeft
      if (flip) {
        ctx.translate(mover.px + CHAR_W, mover.py)
        ctx.scale(-1, 1)
      }

      const baseX = flip ? 0 : mover.px
      const baseY = flip ? 0 : mover.py
      const skinPalette = ['#f4c090', '#e8a870', '#c87848', '#f0b080', '#dca078', '#f6c79d']
      const hairPalette = ['#1a0a00', '#2a1400', '#0a0a22', '#200820', '#0a1a06', '#35210d']
      const skinColor = skinPalette[charIdx % skinPalette.length]
      const hairColor = hairPalette[charIdx % hairPalette.length]
      const swing = isMoving ? [0, 4, 0, -4][mover.walkFrame % 4] : 0
      const bob = isMoving ? Math.abs(swing) * 0.35 : 0
      const torsoY = baseY + 18 - Math.round(bob)
      const headY = torsoY - 12

      ctx.fillStyle = '#152033'
      ctx.fillRect(baseX + 9, baseY + 37 + swing, 6, 20)
      ctx.fillRect(baseX + 17, baseY + 37 - swing, 6, 20)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(baseX + 8, baseY + 56 + swing, 9, 5)
      ctx.fillRect(baseX + 16, baseY + 56 - swing, 9, 5)

      ctx.fillStyle = departmentColor
      ctx.fillRect(baseX + 6, torsoY, 20, 20)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(baseX + 6, torsoY + 13, 20, 7)
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(baseX + 12, torsoY, 8, 8)
      ctx.fillStyle = '#bf3026'
      ctx.fillRect(baseX + 14, torsoY + 2, 4, 14)
      ctx.fillStyle = '#111827'
      ctx.fillRect(baseX + 6, torsoY + 19, 20, 3)
      ctx.fillStyle = '#c99a2c'
      ctx.fillRect(baseX + 14, torsoY + 19, 4, 3)

      ctx.fillStyle = departmentColor
      ctx.fillRect(baseX + 1, torsoY + 1, 6, 18)
      ctx.fillRect(baseX + 25, torsoY + 1, 6, 18)
      ctx.fillStyle = skinColor
      ctx.fillRect(baseX + 1, torsoY + 17, 6, 6)
      ctx.fillRect(baseX + 25, torsoY + 17, 6, 6)

      ctx.fillStyle = skinColor
      ctx.fillRect(baseX + 13, headY + 10, 6, 7)
      ctx.fillRect(baseX + 9, headY, 14, 12)
      ctx.fillRect(baseX + 7, headY + 4, 3, 5)
      ctx.fillRect(baseX + 22, headY + 4, 3, 5)

      ctx.fillStyle = hairColor
      ctx.fillRect(baseX + 9, headY, 14, 3)
      ctx.fillRect(baseX + 9, headY + 3, 2, 4)
      ctx.fillRect(baseX + 21, headY + 3, 2, 4)
      ctx.fillRect(baseX + 9, headY, 4, 5)
      ctx.fillRect(baseX + 19, headY, 4, 5)
      ctx.fillRect(baseX + 11, headY + 4, 4, 1)
      ctx.fillRect(baseX + 17, headY + 4, 4, 1)

      ctx.fillStyle = '#eef2ff'
      ctx.fillRect(baseX + 11, headY + 5, 4, 3)
      ctx.fillRect(baseX + 17, headY + 5, 4, 3)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(baseX + 12, headY + 6, 2, 2)
      ctx.fillRect(baseX + 18, headY + 6, 2, 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(baseX + 13, headY + 6, 1, 1)
      ctx.fillRect(baseX + 19, headY + 6, 1, 1)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(baseX + 15, headY + 8, 2, 2)
      ctx.fillStyle = '#c07462'
      ctx.fillRect(baseX + 13, headY + 10, 6, 1)

      if (isWorking) {
        ctx.fillStyle = `rgba(255,170,0,${0.1 + Math.sin(globalTick * 0.12) * 0.05})`
        ctx.fillRect(baseX, baseY, CHAR_W, CHAR_H)
      }

      ctx.restore()
    }

    function drawChar(mover: CharMover, isSelected: boolean, isHovered: boolean) {
      const charIdx = DEPT_CHAR[mover.agent.departmentId] ?? 0
      const sprite = spritesRef.current.get(`char_${charIdx}`)
      const isMoving = mover.path.length > 0
      const isWorking = mover.agent.status === 'working'
      const departmentColor = mover.agent.color
      const { color: statusColor } = getStatusMeta(mover.agent.status)
      const bubbleSource = (mover.agent.message ?? '').replace(/\s+/g, ' ').trim()
      const bubbleText = bubbleSource.length > 21 ? `${bubbleSource.slice(0, 18)}...` : bubbleSource
      const showLabel = isSelected || isHovered || mover.agent.status !== 'idle' || bubbleText.length > 0

      if (isSelected || isHovered) {
        ctx.save()
        ctx.strokeStyle = isSelected ? '#ffffff' : departmentColor
        ctx.lineWidth = isSelected ? 2 : 1.25
        ctx.shadowColor = departmentColor
        ctx.shadowBlur = isSelected ? 10 : 6
        ctx.beginPath()
        ctx.ellipse(mover.px + CHAR_W / 2, mover.py + CHAR_H + 2, isSelected ? 15 : 12, 5, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.beginPath()
      ctx.ellipse(mover.px + CHAR_W / 2, mover.py + CHAR_H + 3, isSelected ? 12 : 10, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      if (sprite?.complete && sprite.naturalWidth > 0) {
        let frameRow = mover.facing === 'up' ? 1 : mover.facing === 'side' ? 2 : 0
        let frameCol = 0

        if (isWorking) {
          if (mover.facing === 'down') {
            frameRow = 0
            frameCol = 5 + Math.floor(globalTick / 15) % 2
          } else {
            frameCol = 0
          }
        } else if (isMoving) {
          frameCol = 1 + mover.walkFrame
        }

        ctx.save()
        if (isHovered) {
          ctx.shadowColor = departmentColor
          ctx.shadowBlur = 7
        }

        if (mover.facingLeft && mover.facing === 'side') {
          ctx.translate(mover.px + CHAR_W, mover.py)
          ctx.scale(-1, 1)
          ctx.drawImage(sprite, frameCol * FRAME_W, frameRow * FRAME_H, FRAME_W, FRAME_H, 0, 0, CHAR_W, CHAR_H)
        } else {
          ctx.drawImage(
            sprite,
            frameCol * FRAME_W,
            frameRow * FRAME_H,
            FRAME_W,
            FRAME_H,
            mover.px,
            mover.py,
            CHAR_W,
            CHAR_H,
          )
        }

        ctx.restore()
      } else {
        drawFallbackCharacter(mover, departmentColor, charIdx, isMoving, isWorking)
      }

      if (showLabel) {
        ctx.save()
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const labelWidth = ctx.measureText(mover.agent.name).width + 16
        const labelX = mover.px + CHAR_W / 2 - labelWidth / 2
        const labelY = mover.py - 15
        ctx.fillStyle = 'rgba(7,10,20,0.9)'
        ctx.beginPath()
        ctx.roundRect(labelX, labelY, labelWidth, 18, 5)
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#ffffff' : `${departmentColor}cc`
        ctx.lineWidth = isSelected ? 1.5 : 1
        ctx.beginPath()
        ctx.roundRect(labelX, labelY, labelWidth, 18, 5)
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.fillText(mover.agent.name, mover.px + CHAR_W / 2, labelY + 10)
        ctx.restore()
      }

      ctx.save()
      ctx.fillStyle = 'rgba(7,10,20,0.7)'
      ctx.beginPath()
      ctx.roundRect(mover.px + 8, mover.py + CHAR_H + 6, CHAR_W - 16, 4, 3)
      ctx.fill()
      ctx.fillStyle = statusColor
      ctx.beginPath()
      ctx.roundRect(mover.px + 8, mover.py + CHAR_H + 6, CHAR_W - 16, 4, 3)
      ctx.fill()
      ctx.restore()

      if (bubbleText && (isSelected || isHovered || mover.agent.status !== 'idle')) {
        ctx.save()
        ctx.font = 'bold 6px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const bubbleWidth = Math.min(Math.max(ctx.measureText(bubbleText).width + 14, 38), 94)
        const bubbleX = mover.px + CHAR_W / 2 - bubbleWidth / 2
        const bubbleY = mover.py - (showLabel ? 33 : 23)
        ctx.fillStyle = 'rgba(9,13,26,0.94)'
        ctx.strokeStyle = `${departmentColor}dd`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(bubbleX, bubbleY, bubbleWidth, 14, 4)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(mover.px + CHAR_W / 2 - 3, bubbleY + 14)
        ctx.lineTo(mover.px + CHAR_W / 2 + 3, bubbleY + 14)
        ctx.lineTo(mover.px + CHAR_W / 2, bubbleY + 18)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#f8fafc'
        ctx.fillText(bubbleText, bubbleX + bubbleWidth / 2, bubbleY + 7)
        ctx.restore()
      }
    }

    function drawAgentCard(mover: CharMover) {
      const { agent } = mover
      const department = DEPARTMENTS[agent.departmentId]
      const { color: statusColor, label: statusLabel } = getStatusMeta(agent.status)
      const modelShort = getModelShort(agent.model)
      const pad = 10
      const cardWidth = 176
      const cardHeight = 82
      let cardX = mover.px + CHAR_W + 10
      let cardY = mover.py - 6

      if (cardX + cardWidth > MAP_COLS * TILE_SIZE - 6) cardX = mover.px - cardWidth - 10
      if (cardY + cardHeight > MAP_ROWS * TILE_SIZE - 6) cardY = MAP_ROWS * TILE_SIZE - cardHeight - 6
      if (cardY < 6) cardY = 6

      ctx.save()
      ctx.fillStyle = 'rgba(7,10,20,0.96)'
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.shadowColor = 'rgba(0,0,0,0.32)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetY = 6
      ctx.beginPath()
      ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 8)
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      ctx.fillStyle = agent.color
      ctx.beginPath()
      ctx.roundRect(cardX + 1, cardY + 1, cardWidth - 2, 5, 4)
      ctx.fill()

      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(agent.name, cardX + pad, cardY + 20)

      ctx.font = '9px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.76)'
      ctx.fillText(agent.role, cardX + pad, cardY + 36)

      const deptWidth = ctx.measureText(department.name).width + 14
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(cardX + pad, cardY + 45, deptWidth, 14, 4)
      ctx.fill()
      ctx.fillStyle = '#f8fafc'
      ctx.fillText(department.name, cardX + pad + 7, cardY + 52)

      const modelWidth = ctx.measureText(modelShort).width + 14
      const modelX = cardX + cardWidth - pad - modelWidth
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(modelX, cardY + 12, modelWidth, 14, 4)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.74)'
      ctx.fillText(modelShort, modelX + 7, cardY + 19)

      const statusWidth = ctx.measureText(statusLabel).width + 18
      ctx.fillStyle = `${statusColor}22`
      ctx.strokeStyle = `${statusColor}aa`
      ctx.beginPath()
      ctx.roundRect(cardX + cardWidth - pad - statusWidth, cardY + 45, statusWidth, 16, 5)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = statusColor
      ctx.fillText(statusLabel, cardX + cardWidth - pad - statusWidth + 9, cardY + 53)

      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fillRect(cardX + pad, cardY + 66, cardWidth - pad * 2, 1)
      ctx.font = '8px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.52)'
      ctx.fillText(agent.model, cardX + pad, cardY + 74)
      ctx.restore()
    }

    function drawFloorLabel() {
      const { currentFloor } = storeRef.current
      const floor = FLOORS[currentFloor]
      const atmosphere = FLOOR_ATMOSPHERE[currentFloor]

      ctx.save()
      ctx.fillStyle = 'rgba(6,10,18,0.82)'
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(10, 10, 168, 28, 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = atmosphere.accentColor
      ctx.beginPath()
      ctx.roundRect(18, 16, 34, 16, 4)
      ctx.fill()
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = '#08101e'
      ctx.fillText(floor.label, 24, 28)
      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(floor.name, 60, 28)
      ctx.restore()
    }

    function render() {
      const { currentFloor, selectedAgent } = storeRef.current
      const map = FLOOR_MAPS[currentFloor]
      const atmosphere = FLOOR_ATMOSPHERE[currentFloor]
      const isCafe = currentFloor === '1f'

      ctx.fillStyle = atmosphere.bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (let row = 0; row < MAP_ROWS; row += 1) {
        for (let col = 0; col < MAP_COLS; col += 1) {
          drawTile(ctx, map[row][col], col * TILE_SIZE, row * TILE_SIZE, globalTick, isCafe, atmosphere.accentColor)
        }
      }

      ctx.fillStyle = atmosphere.tint
      ctx.globalAlpha = atmosphere.alpha
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalAlpha = 1

      const topGlow = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.28)
      topGlow.addColorStop(0, 'rgba(255,255,255,0.08)')
      topGlow.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = topGlow
      ctx.fillRect(0, 0, canvas.width, canvas.height * 0.28)

      const vignette = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.2,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.75,
      )
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,0.22)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      syncMovers()

      const movers = Array.from(moversRef.current.values()).sort((left, right) => {
        if (left.agent.id === selectedAgent) return 1
        if (right.agent.id === selectedAgent) return -1
        return left.py - right.py
      })

      for (const mover of movers) {
        updateMover(mover)
        const isSelected = mover.agent.id === selectedAgent
        const isHovered = mover.agent.id === hoveredId
        drawChar(mover, isSelected, isHovered)
        if (isSelected) drawAgentCard(mover)
      }

      drawFloorLabel()

      globalTick += 1
      animRef.current = requestAnimationFrame(render)
    }

    render()

    return () => cancelAnimationFrame(animRef.current)
  }, [hoveredId])

  const canvasWidth = MAP_COLS * TILE_SIZE
  const canvasHeight = MAP_ROWS * TILE_SIZE

  return (
    <div ref={containerRef} className="flex h-full w-full items-center justify-center overflow-hidden bg-transparent p-5">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          imageRendering: 'pixelated',
          width: `${canvasWidth * scale}px`,
          height: `${canvasHeight * scale}px`,
          cursor: hoveredId ? 'pointer' : 'default',
        }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredId(null)}
        className="rounded-[18px] border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
      />
    </div>
  )
}
