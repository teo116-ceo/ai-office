import { useEffect, useMemo, useRef } from 'react'
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { resolveAgentFloor, resolveAgentTile } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { Agent, AgentPresence, FLOORS, FloorId } from '@/types'
import { AGENT_TILE_POSITIONS, DESK_TILE_POSITIONS, FLOOR_ATMOSPHERE, MAP_COLS, MAP_ROWS } from './officeLayout'

const TILE_SIZE = 1.08
const FLOOR_WIDTH = MAP_COLS * TILE_SIZE
const FLOOR_DEPTH = MAP_ROWS * TILE_SIZE
const HALF_WIDTH = FLOOR_WIDTH / 2
const HALF_DEPTH = FLOOR_DEPTH / 2
const DESK_WORKER_OFFSET_Z = 0.62
const DESK_CHAIR_OFFSET_Z = 0.92

type SceneKind = 'office' | 'meeting' | 'cafe' | 'executive'

interface SceneStyle {
  kind: SceneKind
  base: string
  slab: string
  floorA: string
  floorB: string
  wall: string
  trim: string
  wood: string
  metal: string
  glass: string
  rug: string
  foliage: string
  glow: string
  sky: string
}

function tileToWorld(col: number, row: number, y = 0): [number, number, number] {
  return [
    col * TILE_SIZE - HALF_WIDTH + TILE_SIZE / 2,
    y,
    row * TILE_SIZE - HALF_DEPTH + TILE_SIZE / 2,
  ]
}

function blendColor(from: string, to: string, amount: number) {
  const source = new THREE.Color(from)
  const target = new THREE.Color(to)
  return `#${source.lerp(target, amount).getHexString()}`
}

function isDeskScene(kind: SceneKind) {
  return kind === 'office' || kind === 'executive'
}

function statusColor(status: Agent['status']) {
  if (status === 'working') return '#f59e0b'
  if (status === 'thinking') return '#5eead4'
  if (status === 'debating') return '#fb7185'
  if (status === 'moving') return '#60a5fa'
  return '#4ade80'
}

function truncateText(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value
}

function resolveSceneKind(floorId: FloorId): SceneKind {
  if (floorId === '1f') return 'cafe'
  if (floorId === '2f') return 'meeting'
  if (floorId === '12f') return 'executive'
  return 'office'
}

function createSceneStyle(floorId: FloorId, accentColor: string, bgColor: string): SceneStyle {
  const kind = resolveSceneKind(floorId)

  if (kind === 'executive') {
    return {
      kind,
      base: blendColor(bgColor, '#140f08', 0.46),
      slab: blendColor(bgColor, '#050505', 0.88),
      floorA: blendColor('#6f5330', '#1a1209', 0.42),
      floorB: blendColor('#4c361b', '#120b06', 0.48),
      wall: blendColor(bgColor, '#f0e6cf', 0.24),
      trim: accentColor,
      wood: blendColor('#8a5b2d', '#2b1609', 0.24),
      metal: blendColor(accentColor, '#b7a26a', 0.46),
      glass: blendColor('#dbeafe', '#f8f1d8', 0.18),
      rug: blendColor(accentColor, '#2b1b0b', 0.52),
      foliage: blendColor('#356b3e', '#d9d08f', 0.08),
      glow: blendColor(accentColor, '#fff7da', 0.24),
      sky: blendColor('#0f172a', '#9fbde5', 0.28),
    }
  }

  return {
    kind,
    base: blendColor(bgColor, '#0f172a', 0.62),
    slab: blendColor(bgColor, '#050814', 0.84),
    floorA: blendColor(bgColor, '#f3ede3', 0.84),
    floorB: blendColor(bgColor, '#ddd4c6', 0.8),
    wall: blendColor(bgColor, '#f8fafc', 0.18),
    trim: accentColor,
    wood: blendColor(accentColor, '#8b5e34', 0.7),
    metal: blendColor(bgColor, '#cbd5e1', 0.54),
    glass: blendColor(accentColor, '#dbeafe', 0.78),
    rug: blendColor(accentColor, '#ffffff', 0.42),
    foliage: blendColor(accentColor, '#22c55e', 0.72),
    glow: blendColor(accentColor, '#ffffff', 0.3),
    sky: blendColor(bgColor, '#dbe7f7', 0.12),
  }
}

function Planter({
  position,
  style,
  scale = 1,
}: {
  position: [number, number, number]
  style: SceneStyle
  scale?: number
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.23, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.34, 10]} />
        <meshStandardMaterial color={style.metal} roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.57, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color={style.foliage} roughness={0.8} />
      </mesh>
      <mesh position={[-0.12, 0.7, 0.08]} castShadow>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color={blendColor(style.foliage, '#d9f99d', 0.24)} roughness={0.8} />
      </mesh>
      <mesh position={[0.13, 0.72, -0.06]} castShadow>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color={blendColor(style.foliage, '#bbf7d0', 0.18)} roughness={0.8} />
      </mesh>
    </group>
  )
}

function WindowWall({ style }: { style: SceneStyle }) {
  const executiveScene = style.kind === 'executive'
  const frameY = executiveScene ? 1.96 : 2.12
  const topBandY = executiveScene ? 3.3 : 3.26
  const panelWidth = executiveScene ? FLOOR_WIDTH / 3.45 : FLOOR_WIDTH / 4.6
  const panelHeight = executiveScene ? 2.9 : 2.4
  const panelInnerHeight = executiveScene ? 2.56 : 2.08
  const windowPositions = executiveScene ? [-7.8, 0, 7.8] : [-9.2, -3.1, 3, 9.1]

  return (
    <group>
      <mesh position={[0, 1.9, -HALF_DEPTH - 0.18]} receiveShadow>
        <boxGeometry args={[FLOOR_WIDTH + 2.6, 3.8, 0.34]} />
        <meshStandardMaterial color={executiveScene ? blendColor(style.wall, '#111827', 0.14) : style.wall} roughness={0.92} />
      </mesh>

      <mesh position={[0, topBandY, -HALF_DEPTH - 0.02]}>
        <boxGeometry args={[FLOOR_WIDTH + 1.9, 0.16, 0.48]} />
        <meshStandardMaterial color={style.trim} emissive={style.glow} emissiveIntensity={0.3} />
      </mesh>

      {executiveScene && (
        <mesh position={[0, 0.68, -HALF_DEPTH - 0.02]}>
          <boxGeometry args={[FLOOR_WIDTH + 1.9, 1.18, 0.18]} />
          <meshStandardMaterial color={blendColor(style.wood, '#111827', 0.24)} roughness={0.72} />
        </mesh>
      )}

      {windowPositions.map((x, index) => (
        <group key={x} position={[x, frameY, -HALF_DEPTH - 0.01]}>
          <mesh>
            <boxGeometry args={[panelWidth, panelHeight, 0.08]} />
            <meshStandardMaterial color={style.glass} transparent opacity={executiveScene ? 0.16 : 0.2} metalness={0.2} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0.02, -0.08]}>
            <planeGeometry args={[panelWidth - 0.24, panelInnerHeight]} />
            <meshBasicMaterial color={index % 2 === 0 ? style.sky : blendColor(style.sky, '#f8fafc', 0.24)} />
          </mesh>
          {executiveScene && (
            <>
              {[-panelWidth / 2 - 0.16, panelWidth / 2 + 0.16].map((offset) => (
                <mesh key={offset} position={[offset, 0, 0.02]}>
                  <boxGeometry args={[0.22, panelHeight + 0.24, 0.12]} />
                  <meshStandardMaterial color={blendColor(style.trim, '#1f2937', 0.42)} roughness={0.82} />
                </mesh>
              ))}
            </>
          )}
        </group>
      ))}

      {[-HALF_WIDTH - 0.25, HALF_WIDTH + 0.25].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]} receiveShadow>
          <boxGeometry args={[0.38, 3.4, FLOOR_DEPTH + 0.9]} />
          <meshStandardMaterial color={blendColor(style.wall, '#111827', 0.18)} roughness={0.92} />
        </mesh>
      ))}

      <mesh position={[0, -0.52, 0]} receiveShadow>
        <boxGeometry args={[FLOOR_WIDTH + 3.6, 1.06, FLOOR_DEPTH + 3.6]} />
        <meshStandardMaterial color={style.slab} roughness={0.98} />
      </mesh>

      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[FLOOR_WIDTH + 1.2, 0.14, FLOOR_DEPTH + 1.2]} />
        <meshStandardMaterial color={blendColor(style.floorA, '#ffffff', 0.2)} roughness={0.88} />
      </mesh>
    </group>
  )
}

function FloorTiles({ style }: { style: SceneStyle }) {
  const tiles = useMemo(() => {
    const items = []

    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let col = 0; col < MAP_COLS; col += 1) {
        const walkway = row === 7 || (style.kind === 'meeting' && col > 11 && col < 15)
        const accentStrip = style.kind !== 'cafe' && (col === 12 || col === 13) && row > 1 && row < 13
        const color = accentStrip
          ? blendColor(style.trim, '#f8fafc', 0.8)
          : walkway
            ? blendColor(style.rug, '#ffffff', 0.48)
            : (row + col) % 2 === 0
              ? style.floorA
              : style.floorB

        items.push(
          <mesh
            key={`${row}-${col}`}
            position={tileToWorld(col, row, walkway ? -0.002 : -0.008)}
            receiveShadow
          >
            <boxGeometry args={[TILE_SIZE - 0.05, walkway ? 0.03 : 0.02, TILE_SIZE - 0.05]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>,
        )
      }
    }

    return items
  }, [style])

  return <group>{tiles}</group>
}

function DeskStation({
  position,
  style,
  accent,
  variant,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
  variant: number
}) {
  const chairColor = variant % 2 === 0 ? accent : blendColor(accent, '#1f2937', 0.42)
  const addPlant = variant % 3 === 0
  const addCabinet = variant % 3 === 1

  return (
    <group position={position}>
      <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.16, 0.08, 0.72]} />
        <meshStandardMaterial color={style.wood} roughness={0.72} />
      </mesh>
      {[-0.46, 0.46].flatMap((x) => [-0.25, 0.25].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.34, z]}>
          <cylinderGeometry args={[0.03, 0.03, 0.68, 10]} />
          <meshStandardMaterial color={style.metal} roughness={0.55} metalness={0.28} />
        </mesh>
      )))}
      <mesh position={[0, 0.99, -0.16]} castShadow>
        <boxGeometry args={[0.58, 0.34, 0.05]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.99, -0.13]}>
        <boxGeometry args={[0.5, 0.26, 0.015]} />
        <meshStandardMaterial color={blendColor(style.glow, '#60a5fa', 0.3)} emissive={style.glow} emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[0, 0.8, 0.12]}>
        <boxGeometry args={[0.42, 0.02, 0.18]} />
        <meshStandardMaterial color={blendColor(style.metal, '#0f172a', 0.55)} roughness={0.48} />
      </mesh>
      <group position={[0, 0, DESK_CHAIR_OFFSET_Z]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 0.46, 10]} />
          <meshStandardMaterial color={style.metal} roughness={0.52} />
        </mesh>
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[0.44, 0.08, 0.42]} />
          <meshStandardMaterial color={chairColor} roughness={0.62} />
        </mesh>
        <mesh position={[0, 0.78, 0.18]}>
          <boxGeometry args={[0.4, 0.52, 0.06]} />
          <meshStandardMaterial color={blendColor(chairColor, '#111827', 0.18)} roughness={0.64} />
        </mesh>
      </group>

      {addPlant && <Planter position={[0.34, 0.72, 0.1]} style={style} scale={0.7} />}
      {addCabinet && (
        <mesh position={[-0.4, 0.34, -0.16]} castShadow receiveShadow>
          <boxGeometry args={[0.26, 0.62, 0.42]} />
          <meshStandardMaterial color={blendColor(style.wood, '#111827', 0.16)} roughness={0.66} />
        </mesh>
      )}
    </group>
  )
}

function ExecutiveDesk({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  const chairColor = blendColor(accent, '#111827', 0.32)

  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[5.2, 0.02, 3.2]} />
        <meshStandardMaterial color={blendColor(accent, '#f8fafc', 0.84)} roughness={0.95} />
      </mesh>

      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.24, 0.12, 0.92]} />
        <meshStandardMaterial color={style.wood} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.43, -0.34]} castShadow receiveShadow>
        <boxGeometry args={[2.06, 0.64, 0.08]} />
        <meshStandardMaterial color={blendColor(style.wood, '#111827', 0.18)} roughness={0.7} />
      </mesh>
      {[-0.94, 0.94].flatMap((x) => [-0.32, 0.32].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.38, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.76, 10]} />
          <meshStandardMaterial color={style.metal} roughness={0.52} metalness={0.24} />
        </mesh>
      )))}
      <mesh position={[0, 0.83, -0.12]}>
        <boxGeometry args={[2.08, 0.03, 0.12]} />
        <meshStandardMaterial color={blendColor(accent, '#f8fafc', 0.42)} emissive={style.glow} emissiveIntensity={0.14} />
      </mesh>

      {[-0.42, 0.42].map((x) => (
        <group key={x} position={[x, 0, -0.1]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[0.54, 0.34, 0.05]} />
            <meshStandardMaterial color="#0f172a" roughness={0.36} />
          </mesh>
          <mesh position={[0, 1.1, 0.03]}>
            <boxGeometry args={[0.46, 0.26, 0.015]} />
            <meshStandardMaterial color={blendColor(style.glow, '#60a5fa', 0.26)} emissive={style.glow} emissiveIntensity={0.18} />
          </mesh>
          <mesh position={[0, 0.92, 0.05]}>
            <boxGeometry args={[0.08, 0.18, 0.08]} />
            <meshStandardMaterial color={blendColor(style.metal, '#0f172a', 0.4)} roughness={0.48} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 0.83, 0.22]}>
        <boxGeometry args={[0.56, 0.03, 0.24]} />
        <meshStandardMaterial color={blendColor(style.metal, '#0f172a', 0.5)} roughness={0.46} />
      </mesh>

      <group position={[0, 0, 1.02]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.52, 10]} />
          <meshStandardMaterial color={style.metal} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.54, 0]}>
          <boxGeometry args={[0.58, 0.1, 0.56]} />
          <meshStandardMaterial color={chairColor} roughness={0.62} />
        </mesh>
        <mesh position={[0, 0.96, 0.24]}>
          <boxGeometry args={[0.56, 0.78, 0.08]} />
          <meshStandardMaterial color={blendColor(chairColor, '#111827', 0.14)} roughness={0.64} />
        </mesh>
      </group>

      {[-0.72, 0.72].map((x) => (
        <group key={x} position={[x, 0, -0.96]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.44, 0.08, 0.4]} />
            <meshStandardMaterial color={blendColor(accent, '#ffffff', 0.62)} roughness={0.74} />
          </mesh>
          <mesh position={[0, 0.74, -0.14]}>
            <boxGeometry args={[0.42, 0.46, 0.08]} />
            <meshStandardMaterial color={blendColor(accent, '#1f2937', 0.2)} roughness={0.76} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function ExecutiveRug({
  position,
  size,
  style,
  accent,
}: {
  position: [number, number, number]
  size: [number, number]
  style: SceneStyle
  accent: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[size[0], 0.02, size[1]]} />
        <meshStandardMaterial color={blendColor(style.rug, '#111827', 0.16)} roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.025, 0]}>
        <boxGeometry args={[size[0] - 0.22, 0.01, size[1] - 0.22]} />
        <meshStandardMaterial color={blendColor(accent, '#3f2a13', 0.5)} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[size[0] - 0.62, 0.008, size[1] - 0.62]} />
        <meshStandardMaterial color={blendColor(accent, '#f8f1d8', 0.7)} roughness={0.94} />
      </mesh>
    </group>
  )
}

function ArtPanel({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.2, 1.92, 0.12]} />
        <meshStandardMaterial color={blendColor(style.base, '#050814', 0.24)} roughness={0.66} />
      </mesh>
      <mesh position={[0, 0, 0.07]}>
        <boxGeometry args={[2.78, 1.5, 0.02]} />
        <meshStandardMaterial color={blendColor(accent, '#f8fafc', 0.7)} emissive={style.glow} emissiveIntensity={0.08} />
      </mesh>
      {[-0.9, -0.25, 0.35, 0.95].map((x, index) => (
        <mesh key={x} position={[x, 0.22 - index * 0.18, 0.09]}>
          <boxGeometry args={[0.46, 0.18, 0.01]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? blendColor(accent, '#111827', 0.2) : blendColor(accent, '#f8fafc', 0.52)}
            emissive={style.glow}
            emissiveIntensity={0.05}
          />
        </mesh>
      ))}
    </group>
  )
}

function SculpturePedestal({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.76, 1.04, 0.76]} />
        <meshStandardMaterial color={blendColor(style.wall, '#111827', 0.1)} roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.34, 0]} castShadow>
        <torusKnotGeometry args={[0.18, 0.06, 96, 14]} />
        <meshStandardMaterial color={blendColor(accent, '#f8f1d8', 0.32)} metalness={0.46} roughness={0.42} />
      </mesh>
    </group>
  )
}

function ConferenceTable({
  position,
  style,
  accent,
  size,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
  size: 'large' | 'medium' | 'small'
}) {
  const dimensions =
    size === 'large'
      ? { width: 4.8, depth: 1.8, chairCount: 6 }
      : size === 'medium'
        ? { width: 3.4, depth: 1.5, chairCount: 4 }
        : { width: 2.2, depth: 1.2, chairCount: 2 }

  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[dimensions.width, 0.1, dimensions.depth]} />
        <meshStandardMaterial color={style.wood} roughness={0.72} />
      </mesh>
      {[-dimensions.width / 2 + 0.32, dimensions.width / 2 - 0.32].flatMap((x) => [-0.46, 0.46].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.36, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.72, 10]} />
          <meshStandardMaterial color={style.metal} roughness={0.54} metalness={0.22} />
        </mesh>
      )))}
      <mesh position={[0, 0.83, 0]}>
        <boxGeometry args={[dimensions.width - 0.24, 0.02, dimensions.depth - 0.18]} />
        <meshStandardMaterial color={blendColor(accent, '#e0f2fe', 0.78)} emissive={style.glow} emissiveIntensity={0.14} />
      </mesh>
      {Array.from({ length: dimensions.chairCount }).map((_, index) => {
        const fraction = dimensions.chairCount === 2 ? 0.5 : index / (dimensions.chairCount - 1)
        const x = -dimensions.width / 2 + 0.7 + fraction * (dimensions.width - 1.4)
        const z = index % 2 === 0 ? dimensions.depth / 2 + 0.34 : -dimensions.depth / 2 - 0.34
        return (
          <mesh key={`${size}-${index}`} position={[x, 0.46, z]} castShadow>
            <boxGeometry args={[0.38, 0.08, 0.36]} />
            <meshStandardMaterial color={blendColor(accent, '#0f172a', 0.34)} roughness={0.64} />
          </mesh>
        )
      })}
    </group>
  )
}

function LoungeSet({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  const sofaColor = blendColor(accent, '#ffffff', 0.56)

  return (
    <group position={position}>
      <mesh position={[-0.78, 0.46, 0]} castShadow>
        <boxGeometry args={[1.4, 0.3, 0.62]} />
        <meshStandardMaterial color={sofaColor} roughness={0.76} />
      </mesh>
      <mesh position={[-0.78, 0.8, -0.22]}>
        <boxGeometry args={[1.4, 0.42, 0.12]} />
        <meshStandardMaterial color={blendColor(sofaColor, '#1f2937', 0.18)} roughness={0.78} />
      </mesh>
      <mesh position={[0.78, 0.46, 0]} castShadow>
        <boxGeometry args={[1.4, 0.3, 0.62]} />
        <meshStandardMaterial color={sofaColor} roughness={0.76} />
      </mesh>
      <mesh position={[0.78, 0.8, -0.22]}>
        <boxGeometry args={[1.4, 0.42, 0.12]} />
        <meshStandardMaterial color={blendColor(sofaColor, '#1f2937', 0.18)} roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.44, 0.48, 0.18, 18]} />
        <meshStandardMaterial color={style.wood} roughness={0.72} />
      </mesh>
      <Planter position={[2.1, 0, 0.2]} style={style} />
    </group>
  )
}

function CafeSet({ style }: { style: SceneStyle }) {
  return (
    <group>
      <mesh position={[-HALF_WIDTH + 4.1, 0.92, -HALF_DEPTH + 2.6]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 1.3, 1.1]} />
        <meshStandardMaterial color={style.wood} roughness={0.7} />
      </mesh>
      <mesh position={[-HALF_WIDTH + 4.1, 1.54, -HALF_DEPTH + 2.18]}>
        <boxGeometry args={[4.8, 0.08, 0.26]} />
        <meshStandardMaterial color={blendColor(style.trim, '#f8fafc', 0.72)} emissive={style.glow} emissiveIntensity={0.16} />
      </mesh>
      {[-HALF_WIDTH + 2.6, -HALF_WIDTH + 5.6].map((x) => (
        <Planter key={x} position={[x, 0, HALF_DEPTH - 2.4]} style={style} />
      ))}
      {[-1.8, 2.4].map((x, index) => (
        <group key={x} position={[x, 0, 0.4 + index * 2.8]}>
          <mesh position={[0, 0.52, 0]} castShadow>
            <cylinderGeometry args={[0.48, 0.52, 0.1, 18]} />
            <meshStandardMaterial color={style.wood} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 0.48, 12]} />
            <meshStandardMaterial color={style.metal} roughness={0.54} />
          </mesh>
          {[-0.86, 0.86].map((offset) => (
            <mesh key={offset} position={[offset, 0.42, 0]} castShadow>
              <boxGeometry args={[0.42, 0.08, 0.38]} />
              <meshStandardMaterial color={blendColor(style.trim, '#111827', 0.38)} roughness={0.68} />
            </mesh>
          ))}
        </group>
      ))}
      <LoungeSet position={[HALF_WIDTH - 5, 0, HALF_DEPTH - 3.8]} style={style} accent={style.trim} />
    </group>
  )
}

function MeetingSet({ style }: { style: SceneStyle }) {
  return (
    <group>
      <ExecutiveRug position={[HALF_WIDTH - 5.2, 0, 0.4]} size={[7.1, 5.4]} style={style} accent={style.trim} />
      <ConferenceTable position={[HALF_WIDTH - 5.2, 0, 0.4]} style={style} accent={style.trim} size="large" />
      <StrategyBoard position={[HALF_WIDTH - 5.2, 1.26, -4.05]} style={style} accent={style.trim} width={4.1} />
      <StorageCredenza position={[HALF_WIDTH - 5.2, 0, 4.15]} style={style} accent={style.trim} width={3.2} />
      <GlassPanel position={[HALF_WIDTH - 2.45, 1.16, 0.4]} size={[0.06, 2.16, 6.9]} style={style} opacity={0.1} />

      <ExecutiveRug position={[-1.25, 0, -1.15]} size={[4.9, 4.1]} style={style} accent={style.trim} />
      <ConferenceTable position={[-1.25, 0, -1.15]} style={style} accent={style.trim} size="medium" />
      <StrategyBoard position={[-1.25, 1.16, -3.9]} style={style} accent={style.trim} width={3.1} />
      <StorageCredenza position={[-1.25, 0, 1.55]} style={style} accent={style.trim} width={2.5} />
      <GlassPanel position={[1.15, 1.12, -1.15]} size={[0.06, 2.12, 4.35]} style={style} opacity={0.1} />

      <ExecutiveRug position={[-HALF_WIDTH + 3.5, 0, -4.2]} size={[3.1, 2.9]} style={style} accent={style.trim} />
      <ConferenceTable position={[-HALF_WIDTH + 3.5, 0, -4.2]} style={style} accent={style.trim} size="small" />
      <StrategyBoard position={[-HALF_WIDTH + 3.5, 1.06, -5.58]} style={style} accent={style.trim} width={2.2} />
      <GlassPanel position={[-HALF_WIDTH + 5.0, 1.06, -4.2]} size={[0.06, 2.0, 3.0]} style={style} opacity={0.12} />

      <ExecutiveRug position={[-HALF_WIDTH + 3.5, 0, 4.2]} size={[3.1, 2.9]} style={style} accent={style.trim} />
      <ConferenceTable position={[-HALF_WIDTH + 3.5, 0, 4.2]} style={style} accent={style.trim} size="small" />
      <StrategyBoard position={[-HALF_WIDTH + 3.5, 1.06, 2.82]} style={style} accent={style.trim} width={2.2} />
      <GlassPanel position={[-HALF_WIDTH + 5.0, 1.06, 4.2]} size={[0.06, 2.0, 3.0]} style={style} opacity={0.12} />
    </group>
  )
}

function ExecutiveSet({ style }: { style: SceneStyle }) {
  return (
    <group>
      <ExecutiveRug position={[0, 0, -2.2]} size={[7.4, 4.9]} style={style} accent={style.trim} />
      <ExecutiveDesk position={[0, 0, -2.15]} style={style} accent={style.trim} />
      <StorageCredenza position={[-HALF_WIDTH + 4.7, 0, -3.7]} style={style} accent={style.trim} width={3.2} />
      <ArtPanel position={[-HALF_WIDTH + 4.85, 1.4, -4.05]} style={style} accent={style.trim} />
      <ExecutiveRug position={[-HALF_WIDTH + 5.1, 0, HALF_DEPTH - 4.1]} size={[4.5, 3.1]} style={style} accent={style.trim} />
      <LoungeSet position={[-HALF_WIDTH + 5.1, 0, HALF_DEPTH - 4.1]} style={style} accent={style.trim} />
      <ExecutiveRug position={[HALF_WIDTH - 5.05, 0, 0.45]} size={[4.2, 3.4]} style={style} accent={style.trim} />
      <ConferenceTable position={[HALF_WIDTH - 5.05, 0, 0.45]} style={style} accent={style.trim} size="medium" />
      <StorageCredenza position={[HALF_WIDTH - 5.05, 0, -3.55]} style={style} accent={style.trim} width={2.9} />
      <SignatureWall
        position={[HALF_WIDTH - 4.95, 1.28, -4.08]}
        style={style}
        accent={style.trim}
        title="CEO SUITE"
        subtitle="Executive Office"
      />
      <SculpturePedestal position={[0, 0, HALF_DEPTH - 3.3]} style={style} accent={style.trim} />
      <Planter position={[-HALF_WIDTH + 2.5, 0, -HALF_DEPTH + 2.6]} style={style} scale={0.98} />
      <Planter position={[HALF_WIDTH - 2.4, 0, HALF_DEPTH - 2.25]} style={style} scale={1.08} />
    </group>
  )
}

function GlassPanel({
  position,
  size,
  style,
  opacity = 0.12,
}: {
  position: [number, number, number]
  size: [number, number, number]
  style: SceneStyle
  opacity?: number
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={style.glass} transparent opacity={opacity} />
    </mesh>
  )
}

function StorageCredenza({
  position,
  style,
  accent,
  width = 2.4,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
  width?: number
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 1.12, 0.7]} />
        <meshStandardMaterial color={blendColor(style.wood, '#111827', 0.16)} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.14, 0]} receiveShadow>
        <boxGeometry args={[width + 0.06, 0.04, 0.76]} />
        <meshStandardMaterial color={style.wood} roughness={0.68} />
      </mesh>
      {[-width / 3, 0, width / 3].map((offset) => (
        <mesh key={offset} position={[offset, 0.66, 0.37]}>
          <boxGeometry args={[0.08, 0.42, 0.02]} />
          <meshStandardMaterial color={blendColor(accent, '#f8fafc', 0.72)} emissive={style.glow} emissiveIntensity={0.08} />
        </mesh>
      ))}
    </group>
  )
}

function StrategyBoard({
  position,
  style,
  accent,
  width = 3,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
  width?: number
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, 1.86, 0.16]} />
        <meshStandardMaterial color={blendColor(style.base, '#f8fafc', 0.18)} roughness={0.74} />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[width - 0.22, 1.56, 0.03]} />
        <meshStandardMaterial color={blendColor(style.glass, '#ffffff', 0.22)} roughness={0.18} />
      </mesh>
      {[-0.72, -0.18, 0.36, 0.82].map((x, index) => (
        <mesh key={`${x}-${index}`} position={[x, 0.18 - index * 0.16, 0.1]}>
          <boxGeometry args={[0.28, 0.16, 0.01]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? accent : blendColor(accent, '#f8fafc', 0.52)}
            emissive={style.glow}
            emissiveIntensity={0.08}
          />
        </mesh>
      ))}
    </group>
  )
}

function StandingHub({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.94, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.7, 0.14, 18]} />
        <meshStandardMaterial color={style.wood} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.92, 12]} />
        <meshStandardMaterial color={style.metal} roughness={0.56} />
      </mesh>
      {[-0.92, 0.92].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.4, 0.08, 0.34]} />
            <meshStandardMaterial color={blendColor(accent, '#111827', 0.34)} roughness={0.68} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.4, 10]} />
            <meshStandardMaterial color={style.metal} roughness={0.56} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function CollaborationSet({ floorId, style }: { floorId: FloorId; style: SceneStyle }) {
  switch (floorId) {
    case '3f':
      return (
        <group>
          <ConferenceTable position={[HALF_WIDTH - 5, 0, -1.2]} style={style} accent={style.trim} size="small" />
          <StrategyBoard position={[HALF_WIDTH - 4.8, 1.16, -3.35]} style={style} accent={style.trim} width={3.2} />
          <PresentationIsland position={[1.9, 0, -0.6]} style={style} accent={style.trim} />
          <LoungeSet position={[2.6, 0, HALF_DEPTH - 3.9]} style={style} accent={style.trim} />
          <Planter position={[HALF_WIDTH - 2.4, 0, HALF_DEPTH - 2.4]} style={style} scale={1.05} />
          <Planter position={[-HALF_WIDTH + 2.4, 0, HALF_DEPTH - 2.5]} style={style} scale={0.9} />
        </group>
      )
    case '4f':
      return (
        <group>
          <ConferenceTable position={[HALF_WIDTH - 5.1, 0, -1.2]} style={style} accent={style.trim} size="small" />
          <StandingHub position={[2.2, 0, -0.9]} style={style} accent={style.trim} />
          <StorageCredenza position={[-HALF_WIDTH + 3.7, 0, -3.7]} style={style} accent={style.trim} width={2.7} />
          <GlassPanel position={[HALF_WIDTH - 5.1, 1.2, -2.3]} size={[3.5, 2.1, 0.06]} style={style} />
          <Planter position={[HALF_WIDTH - 2.3, 0, HALF_DEPTH - 2.3]} style={style} scale={1.05} />
        </group>
      )
    case '5f':
      return (
        <group>
          <ArchiveBlock position={[HALF_WIDTH - 5.6, 0, -3.35]} style={style} accent={style.trim} />
          <ArchiveBlock position={[HALF_WIDTH - 4, 0, -3.35]} style={style} accent={style.trim} />
          <ConferenceTable position={[HALF_WIDTH - 5.1, 0, 0.9]} style={style} accent={style.trim} size="small" />
          <StorageCredenza position={[1.9, 0, -1.1]} style={style} accent={style.trim} width={2.8} />
          <GlassPanel position={[2.1, 1.12, -2.6]} size={[3.2, 2.1, 0.06]} style={style} opacity={0.1} />
          <Planter position={[-HALF_WIDTH + 2.4, 0, HALF_DEPTH - 2.4]} style={style} scale={0.9} />
        </group>
      )
    case '6f':
      return (
        <group>
          <StrategyBoard position={[HALF_WIDTH - 4.9, 1.16, -3.2]} style={style} accent={style.trim} width={3.2} />
          <ConferenceTable position={[HALF_WIDTH - 5.1, 0, 0.1]} style={style} accent={style.trim} size="medium" />
          <StrategyBoard position={[2.1, 1.08, -1.9]} style={style} accent={style.trim} width={2.6} />
          <PresentationIsland position={[-HALF_WIDTH + 3.3, 0, -3.7]} style={style} accent={style.trim} />
          <Planter position={[HALF_WIDTH - 2.2, 0, HALF_DEPTH - 2.3]} style={style} scale={1.02} />
        </group>
      )
    case '7f':
      return (
        <group>
          <ServerTower position={[HALF_WIDTH - 5.6, 0, -3.35]} style={style} accent={style.trim} />
          <ServerTower position={[HALF_WIDTH - 4.45, 0, -3.35]} style={style} accent={style.trim} />
          <ServerTower position={[HALF_WIDTH - 3.3, 0, -3.35]} style={style} accent={style.trim} />
          <GlassPanel position={[HALF_WIDTH - 4.45, 1.12, -2.45]} size={[3.4, 2.1, 0.06]} style={style} opacity={0.1} />
          <GlassPanel position={[HALF_WIDTH - 2.85, 1.12, -3.4]} size={[0.06, 2.1, 1.9]} style={style} opacity={0.08} />
          <ConferenceTable position={[2.2, 0, 0.4]} style={style} accent={style.trim} size="small" />
          <StorageCredenza position={[-HALF_WIDTH + 3.6, 0, -3.75]} style={style} accent={style.trim} width={2.6} />
        </group>
      )
    case '8f':
      return (
        <group>
          <ConferenceTable position={[HALF_WIDTH - 5.1, 0, -0.95]} style={style} accent={style.trim} size="medium" />
          <StandingHub position={[2.1, 0, -0.85]} style={style} accent={style.trim} />
          <StrategyBoard position={[HALF_WIDTH - 4.9, 1.16, -3.3]} style={style} accent={style.trim} width={3} />
          <GlassPanel position={[HALF_WIDTH - 3.15, 1.15, -0.15]} size={[0.06, 2.1, 3.2]} style={style} opacity={0.08} />
          <Planter position={[-HALF_WIDTH + 2.3, 0, HALF_DEPTH - 2.4]} style={style} scale={0.92} />
        </group>
      )
    case '9f':
      return (
        <group>
          <ConferenceTable position={[HALF_WIDTH - 5.1, 0, -1.1]} style={style} accent={style.trim} size="small" />
          <StorageCredenza position={[2, 0, -0.95]} style={style} accent={style.trim} width={2.9} />
          <ArchiveBlock position={[-HALF_WIDTH + 3.5, 0, -3.8]} style={style} accent={style.trim} />
          <GlassPanel position={[HALF_WIDTH - 5, 1.16, -2.2]} size={[3.4, 2.1, 0.06]} style={style} opacity={0.1} />
          <Planter position={[HALF_WIDTH - 2.3, 0, HALF_DEPTH - 2.25]} style={style} scale={1.02} />
        </group>
      )
    case '10f':
      return (
        <group>
          <ServerTower position={[HALF_WIDTH - 5.8, 0, -3.35]} style={style} accent={style.trim} />
          <ServerTower position={[HALF_WIDTH - 4.7, 0, -3.35]} style={style} accent={style.trim} />
          <GlassPanel position={[HALF_WIDTH - 4.7, 1.12, -2.45]} size={[2.8, 2.1, 0.06]} style={style} opacity={0.1} />
          <GlassPanel position={[HALF_WIDTH - 3.35, 1.12, -3.35]} size={[0.06, 2.1, 1.85]} style={style} opacity={0.08} />
          <ConferenceTable position={[2.1, 0, 0.3]} style={style} accent={style.trim} size="small" />
          <StorageCredenza position={[-HALF_WIDTH + 3.5, 0, -3.8]} style={style} accent={style.trim} width={2.6} />
          <Planter position={[HALF_WIDTH - 2.3, 0, HALF_DEPTH - 2.25]} style={style} scale={1} />
        </group>
      )
    case '11f':
      return (
        <group>
          <ConferenceTable position={[HALF_WIDTH - 5.1, 0, -0.85]} style={style} accent={style.trim} size="medium" />
          <StorageCredenza position={[1.9, 0, -1]} style={style} accent={style.trim} width={2.8} />
          <GlassPanel position={[HALF_WIDTH - 5.05, 1.16, -2.05]} size={[3.6, 2.1, 0.06]} style={style} opacity={0.1} />
          <ArchiveBlock position={[-HALF_WIDTH + 3.6, 0, -3.8]} style={style} accent={style.trim} />
          <Planter position={[HALF_WIDTH - 2.25, 0, HALF_DEPTH - 2.25]} style={style} scale={1.08} />
        </group>
      )
    default:
      return (
        <group>
          <ConferenceTable position={[HALF_WIDTH - 5.2, 0, -0.9]} style={style} accent={style.trim} size="medium" />
          <LoungeSet position={[1.8, 0, HALF_DEPTH - 3.9]} style={style} accent={style.trim} />
          <ArchiveBlock position={[-HALF_WIDTH + 3.5, 0, -3.8]} style={style} accent={style.trim} />
          <GlassPanel position={[HALF_WIDTH - 5.1, 1.2, -1.9]} size={[3.8, 2.2, 0.06]} style={style} />
          <GlassPanel position={[HALF_WIDTH - 3.2, 1.2, -0.2]} size={[0.06, 2.2, 3.3]} style={style} opacity={0.1} />
          <mesh position={[HALF_WIDTH - 5.1, 1.16, -3.05]} castShadow receiveShadow>
            <boxGeometry args={[2.6, 1.8, 0.22]} />
            <meshStandardMaterial color={blendColor(style.wall, '#111827', 0.04)} roughness={0.92} />
          </mesh>
          <mesh position={[-HALF_WIDTH + 3.4, 1.05, -HALF_DEPTH + 3.5]} castShadow receiveShadow>
            <boxGeometry args={[3.2, 2.1, 0.24]} />
            <meshStandardMaterial color={blendColor(style.wall, '#111827', 0.08)} roughness={0.92} />
          </mesh>
          <Planter position={[HALF_WIDTH - 2.4, 0, HALF_DEPTH - 2.2]} style={style} scale={1.1} />
          <Planter position={[-HALF_WIDTH + 2.4, 0, HALF_DEPTH - 2.5]} style={style} scale={0.9} />
        </group>
      )
  }
}

function SignatureWall({
  position,
  style,
  accent,
  title,
  subtitle,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
  title: string
  subtitle: string
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.6, 2.1, 0.16]} />
        <meshStandardMaterial color={blendColor(style.base, '#050814', 0.18)} roughness={0.64} />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[3.18, 1.64, 0.02]} />
        <meshStandardMaterial color={blendColor(accent, '#dbeafe', 0.72)} emissive={style.glow} emissiveIntensity={0.12} />
      </mesh>
      <Text position={[0, 0.26, 0.11]} fontSize={0.22} color="#08101e" anchorX="center" anchorY="middle">
        {title}
      </Text>
      <Text position={[0, -0.22, 0.11]} fontSize={0.12} color="#122033" anchorX="center" anchorY="middle">
        {subtitle}
      </Text>
    </group>
  )
}

function ServerTower({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.86, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 1.72, 0.82]} />
        <meshStandardMaterial color={blendColor(style.base, '#020617', 0.08)} roughness={0.56} />
      </mesh>
      {[-0.32, 0, 0.32].map((offset) => (
        <mesh key={offset} position={[0, 0.58 + offset * 0.28, 0.42]}>
          <boxGeometry args={[0.46, 0.08, 0.02]} />
          <meshStandardMaterial color={offset === 0 ? accent : blendColor(accent, '#dbeafe', 0.54)} emissive={accent} emissiveIntensity={0.18} />
        </mesh>
      ))}
    </group>
  )
}

function ArchiveBlock({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.24, 0.72]} />
        <meshStandardMaterial color={blendColor(style.wood, '#111827', 0.2)} roughness={0.72} />
      </mesh>
      {[-0.42, 0, 0.42].map((offset) => (
        <mesh key={offset} position={[offset, 0.9, 0.38]}>
          <boxGeometry args={[0.22, 0.42, 0.02]} />
          <meshStandardMaterial color={blendColor(accent, '#f8fafc', 0.72)} emissive={style.glow} emissiveIntensity={0.08} />
        </mesh>
      ))}
    </group>
  )
}

function PresentationIsland({
  position,
  style,
  accent,
}: {
  position: [number, number, number]
  style: SceneStyle
  accent: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.68, 0.12, 18]} />
        <meshStandardMaterial color={style.wood} roughness={0.74} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.82, 0.18, 0.32]} />
        <meshStandardMaterial color={blendColor(accent, '#f8fafc', 0.78)} emissive={style.glow} emissiveIntensity={0.16} />
      </mesh>
      <mesh position={[0.22, 0.86, -0.02]}>
        <boxGeometry args={[0.2, 0.08, 0.18]} />
        <meshStandardMaterial color={blendColor(accent, '#111827', 0.24)} roughness={0.42} />
      </mesh>
    </group>
  )
}

function FloorSignature({ floorId, style }: { floorId: FloorId; style: SceneStyle }) {
  switch (floorId) {
    case '3f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="캠페인 랩" subtitle="브랜드 스튜디오" />
          <PresentationIsland position={[7.2, 0, 4.2]} style={style} accent={style.trim} />
        </group>
      )
    case '4f':
      return (
        <group>
          <SignatureWall position={[6.2, 1.28, -4.1]} style={style} accent={style.trim} title="세일즈 보드" subtitle="파이프라인 리뷰" />
          <LoungeSet position={[7.4, 0, 4.2]} style={style} accent={style.trim} />
        </group>
      )
    case '5f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="지원 허브" subtitle="대기열 대응" />
          <ArchiveBlock position={[7.2, 0, 4.4]} style={style} accent={style.trim} />
        </group>
      )
    case '6f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="로드맵 룸" subtitle="제품 계획 정렬" />
          <PresentationIsland position={[7.3, 0, 4.2]} style={style} accent={style.trim} />
        </group>
      )
    case '7f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="릴리즈 센터" subtitle="QA · DevOps" />
          <ServerTower position={[7.2, 0, 3.8]} style={style} accent={style.trim} />
          <ServerTower position={[8.3, 0, 3.8]} style={style} accent={style.trim} />
        </group>
      )
    case '8f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="개발 워룸" subtitle="스프린트 빌드" />
          <PresentationIsland position={[7.2, 0, 4.2]} style={style} accent={style.trim} />
        </group>
      )
    case '9f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="거버넌스 데스크" subtitle="정책 · 운영 정렬" />
          <ArchiveBlock position={[7.2, 0, 4.2]} style={style} accent={style.trim} />
        </group>
      )
    case '10f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="SOC 월" subtitle="보안 관제" />
          <ServerTower position={[7.1, 0, 3.8]} style={style} accent={style.trim} />
          <ServerTower position={[8.2, 0, 3.8]} style={style} accent={style.trim} />
          <ServerTower position={[9.3, 0, 3.8]} style={style} accent={style.trim} />
        </group>
      )
    case '11f':
      return (
        <group>
          <SignatureWall position={[6.1, 1.28, -4.1]} style={style} accent={style.trim} title="전략 보드" subtitle="임원 협의" />
          <LoungeSet position={[7.4, 0, 4.2]} style={style} accent={style.trim} />
        </group>
      )
    default:
      return null
  }
}

function SceneFurniture({
  floorId,
  style,
  floorAgents,
}: {
  floorId: FloorId
  style: SceneStyle
  floorAgents: Agent[]
}) {
  const deskAgents = style.kind === 'office' || style.kind === 'executive' ? floorAgents : []

  return (
    <group>
      {style.kind === 'cafe' && <CafeSet style={style} />}
      {style.kind === 'meeting' && <MeetingSet style={style} />}
      {style.kind === 'executive' && <ExecutiveSet style={style} />}
      {style.kind === 'office' && <CollaborationSet floorId={floorId} style={style} />}
      <FloorSignature floorId={floorId} style={style} />

      {deskAgents.map((agent, index) => {
        const tile = DESK_TILE_POSITIONS[agent.id] ?? resolveAgentTile(agent) ?? AGENT_TILE_POSITIONS[agent.id]
        if (!tile) return null
        return (
          <DeskStation
            key={`${floorId}-${agent.id}`}
            position={tileToWorld(tile.col, tile.row)}
            style={style}
            accent={agent.color}
            variant={index}
          />
        )
      })}
    </group>
  )
}

function AgentMesh({
  agent,
  presence,
  isSelected,
  style,
  onClick,
}: {
  agent: Agent
  presence?: AgentPresence
  isSelected: boolean
  style: SceneStyle
  onClick: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const leftArmRef = useRef<THREE.Mesh>(null)
  const rightArmRef = useRef<THREE.Mesh>(null)
  const leftLegRef = useRef<THREE.Mesh>(null)
  const rightLegRef = useRef<THREE.Mesh>(null)
  const tile = resolveAgentTile(agent) ?? AGENT_TILE_POSITIONS[agent.id] ?? { col: 13, row: 7 }
  const anchoredToDesk = isDeskScene(style.kind) && !presence
  const deskTile = DESK_TILE_POSITIONS[agent.id] ?? tile
  const baseTile = anchoredToDesk ? deskTile : tile
  const basePosition = tileToWorld(baseTile.col, baseTile.row)
  const position: [number, number, number] = anchoredToDesk
    ? [basePosition[0], basePosition[1], basePosition[2] + DESK_WORKER_OFFSET_Z]
    : basePosition
  const baseRotationY = anchoredToDesk ? Math.PI : 0
  const activeStatus = statusColor(agent.status)
  const showLabel = isSelected || agent.status !== 'idle' || Boolean(agent.message)
  const isStretching = presence?.mode === 'stretch' && agent.status === 'idle'
  const initializedRef = useRef(false)

  useEffect(() => {
    const node = groupRef.current
    if (!node || initializedRef.current) return
    node.position.set(position[0], position[1], position[2])
    initializedRef.current = true
  }, [position])

  useFrame(({ clock }, delta) => {
    const node = groupRef.current
    if (!node) return

    const t = clock.getElapsedTime()
    const walk = Math.sin(t * 6)
    const dx = position[0] - node.position.x
    const dz = position[2] - node.position.z
    const movingAcrossFloor = Math.hypot(dx, dz) > 0.04

    node.position.x = THREE.MathUtils.damp(node.position.x, position[0], 6.5, delta)
    node.position.z = THREE.MathUtils.damp(node.position.z, position[2], 6.5, delta)

    const bobbingY = agent.status === 'debating'
      ? Math.abs(Math.sin(t * 4.2)) * 0.1
      : isStretching
        ? Math.abs(Math.sin(t * 2.6)) * 0.05
      : agent.status === 'working'
        ? Math.sin(t * 5.2) * 0.03
        : Math.sin(t * 1.4) * 0.015
    node.position.y = position[1] + bobbingY

    if (movingAcrossFloor) {
      const heading = Math.atan2(dx, dz)
      node.rotation.y = THREE.MathUtils.damp(node.rotation.y, heading, 8, delta)
    } else {
      node.rotation.y = THREE.MathUtils.damp(
        node.rotation.y,
        baseRotationY + (agent.status === 'thinking' ? Math.sin(t * 1.8) * 0.18 : 0),
        7,
        delta,
      )
    }

    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = isStretching
        ? -1.05 + Math.sin(t * 2.2) * 0.16
        : agent.status === 'working'
          ? -walk * 0.18
          : 0
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = isStretching
        ? -1.05 - Math.sin(t * 2.2) * 0.16
        : agent.status === 'working'
          ? walk * 0.18
          : 0
    }
    if (leftLegRef.current) leftLegRef.current.rotation.x = agent.status === 'moving' || movingAcrossFloor ? walk * 0.28 : 0
    if (rightLegRef.current) rightLegRef.current.rotation.x = agent.status === 'moving' || movingAcrossFloor ? -walk * 0.28 : 0
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onClick()
  }

  return (
    <group ref={groupRef} onClick={handleClick}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.22, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.14} />
      </mesh>

      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.28, 0.38, 32]} />
          <meshBasicMaterial color={agent.color} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}

      <mesh position={[-0.06, 0.16, 0]} castShadow ref={leftLegRef}>
        <cylinderGeometry args={[0.03, 0.035, 0.28, 12]} />
        <meshStandardMaterial color="#1e293b" roughness={0.58} />
      </mesh>
      <mesh position={[0.06, 0.16, 0]} castShadow ref={rightLegRef}>
        <cylinderGeometry args={[0.03, 0.035, 0.28, 12]} />
        <meshStandardMaterial color="#1e293b" roughness={0.58} />
      </mesh>
      <mesh position={[-0.07, 0.01, 0.03]} castShadow>
        <boxGeometry args={[0.1, 0.05, 0.16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>
      <mesh position={[0.07, 0.01, 0.03]} castShadow>
        <boxGeometry args={[0.1, 0.05, 0.16]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.31, 0]} castShadow>
        <boxGeometry args={[0.18, 0.1, 0.14]} />
        <meshStandardMaterial color="#162033" roughness={0.55} />
      </mesh>

      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 0.4, 16]} />
        <meshStandardMaterial color={agent.color} roughness={0.46} metalness={0.03} />
      </mesh>
      <mesh position={[0, 0.64, 0]} castShadow>
        <boxGeometry args={[0.38, 0.12, 0.22]} />
        <meshStandardMaterial color={blendColor(agent.color, '#0f172a', 0.12)} roughness={0.44} />
      </mesh>
      <mesh position={[0, 0.59, 0.15]}>
        <boxGeometry args={[0.12, 0.16, 0.02]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.45, 0.15]}>
        <boxGeometry args={[0.05, 0.22, 0.018]} />
        <meshStandardMaterial color={blendColor(agent.color, '#111827', 0.28)} roughness={0.34} />
      </mesh>
      <mesh position={[-0.22, 0.52, 0]} castShadow ref={leftArmRef}>
        <cylinderGeometry args={[0.03, 0.035, 0.3, 12]} />
        <meshStandardMaterial color={agent.color} roughness={0.5} />
      </mesh>
      <mesh position={[0.22, 0.52, 0]} castShadow ref={rightArmRef}>
        <cylinderGeometry args={[0.03, 0.035, 0.3, 12]} />
        <meshStandardMaterial color={agent.color} roughness={0.5} />
      </mesh>
      <mesh position={[-0.25, 0.37, 0.02]} castShadow>
        <boxGeometry args={[0.06, 0.08, 0.08]} />
        <meshStandardMaterial color="#f3c998" roughness={0.78} />
      </mesh>
      <mesh position={[0.25, 0.37, 0.02]} castShadow>
        <boxGeometry args={[0.06, 0.08, 0.08]} />
        <meshStandardMaterial color="#f3c998" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.73, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.055, 0.08, 12]} />
        <meshStandardMaterial color="#f3c998" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.91, 0]} castShadow>
        <sphereGeometry args={[0.155, 20, 20]} />
        <meshStandardMaterial color="#f3c998" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.01, -0.01]} castShadow>
        <sphereGeometry args={[0.165, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2.15]} />
        <meshStandardMaterial color="#111827" roughness={0.72} />
      </mesh>
      <mesh position={[-0.1, 0.92, 0.13]}>
        <boxGeometry args={[0.03, 0.02, 0.01]} />
        <meshStandardMaterial color="#0f172a" roughness={0.3} />
      </mesh>
      <mesh position={[0.1, 0.92, 0.13]}>
        <boxGeometry args={[0.03, 0.02, 0.01]} />
        <meshStandardMaterial color="#0f172a" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.85, 0.145]}>
        <boxGeometry args={[0.04, 0.02, 0.01]} />
        <meshStandardMaterial color="#b45309" roughness={0.28} />
      </mesh>
      <mesh position={[0.2, 1.06, 0]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial color={activeStatus} emissive={activeStatus} emissiveIntensity={0.48} />
      </mesh>

      {showLabel && (
        <group position={[0, 1.26, 0]}>
          <mesh>
            <boxGeometry args={[1.42, 0.18, 0.08]} />
            <meshStandardMaterial color={blendColor(style.base, '#050814', 0.5)} roughness={0.64} />
          </mesh>
          <Text
            position={[0, 0, 0.05]}
            fontSize={0.11}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#050814"
          >
            {agent.name}
          </Text>
        </group>
      )}

      {agent.message && isSelected && (
        <group position={[0, 1.56, 0]}>
          <mesh>
            <boxGeometry args={[2.9, 0.34, 0.08]} />
            <meshStandardMaterial color={blendColor(style.base, '#050814', 0.32)} roughness={0.62} />
          </mesh>
          <Text
            position={[0, 0, 0.05]}
            fontSize={0.085}
            color={style.trim}
            maxWidth={2.5}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.008}
            outlineColor="#ffffff"
          >
            {truncateText(agent.message, 40)}
          </Text>
        </group>
      )}
    </group>
  )
}

function FloorSign({ floorId, style }: { floorId: FloorId; style: SceneStyle }) {
  const floor = FLOORS[floorId]

  return (
    <group position={[-HALF_WIDTH + 2.7, 1.78, -HALF_DEPTH + 2.2]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.1, 0.12]} />
        <meshStandardMaterial color={blendColor(style.base, '#050814', 0.34)} roughness={0.7} />
      </mesh>
      <Text
        position={[0, 0.15, 0.08]}
        fontSize={0.24}
        color={style.trim}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#050814"
      >
        {floor.label}
      </Text>
      <Text
        position={[0, -0.22, 0.08]}
        fontSize={0.14}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
      >
        {floor.name}
      </Text>
    </group>
  )
}

function Office3DScene() {
  const { agents, agentPresenceById, currentFloor, selectedAgent, setSelectedAgent } = useAgentStore()
  const atmosphere = FLOOR_ATMOSPHERE[currentFloor]
  const style = useMemo(
    () => createSceneStyle(currentFloor, atmosphere.accentColor, atmosphere.bg),
    [atmosphere.accentColor, atmosphere.bg, currentFloor],
  )
  const floorAgents = agents.filter((agent) => resolveAgentFloor(agent) === currentFloor)
  const backdrop = blendColor(style.sky, style.base, 0.35)

  return (
    <>
      <color attach="background" args={[backdrop]} />

      <ambientLight intensity={1.16} color="#fff8ef" />
      <directionalLight
        position={[12, 18, 8]}
        intensity={1.55}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <directionalLight position={[-10, 10, -14]} intensity={0.68} color="#bfe0ff" />
      <pointLight position={[0, 5.2, 0]} intensity={0.72} color={style.glow} />

      <OrbitControls
        enableRotate={false}
        enablePan
        enableZoom
        zoomSpeed={0.55}
        minZoom={10}
        maxZoom={18}
      />

      <WindowWall style={style} />
      <FloorTiles style={style} />
      <SceneFurniture floorId={currentFloor} style={style} floorAgents={floorAgents} />
      <FloorSign floorId={currentFloor} style={style} />

      {[
        [-HALF_WIDTH + 1.8, 0, -HALF_DEPTH + 1.8] as [number, number, number],
        [HALF_WIDTH - 1.8, 0, -HALF_DEPTH + 1.8] as [number, number, number],
        [-HALF_WIDTH + 1.8, 0, HALF_DEPTH - 1.8] as [number, number, number],
      ].map((position, index) => (
        <Planter key={index} position={position} style={style} scale={index === 1 ? 1.1 : 0.9} />
      ))}

      {floorAgents.map((agent) => (
        <AgentMesh
          key={agent.id}
          agent={agent}
          presence={agentPresenceById[agent.id]}
          isSelected={agent.id === selectedAgent}
          style={style}
          onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
        />
      ))}
    </>
  )
}

export default function Office3DView() {
  return (
    <div className="h-full w-full">
      <Canvas
        orthographic
        camera={{ zoom: 13.5, position: [22, 22, 22], near: 0.1, far: 120 }}
        shadows
        gl={{ antialias: true }}
      >
        <Office3DScene />
      </Canvas>
    </div>
  )
}
