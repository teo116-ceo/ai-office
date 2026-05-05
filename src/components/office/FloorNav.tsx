import { resolveAgentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { FLOORS, FloorId } from '@/types'

const FLOOR_ORDER: FloorId[] = ['11f', '10f', '9f', '8f', '7f', '6f', '5f', '4f', '3f', '2f', '1f']

export default function FloorNav() {
  const { currentFloor, setCurrentFloor, agents } = useAgentStore(
    useShallow((s) => ({
      currentFloor: s.currentFloor,
      setCurrentFloor: s.setCurrentFloor,
      agents: s.agents,
    }))
  )

  const agentCountByFloor = (floorId: FloorId) =>
    agents.filter((agent) => resolveAgentFloor(agent) === floorId).length

  return (
    <div
      className="border-l border-office-panel bg-office-sidebar overflow-hidden self-stretch"
      style={{ width: 44, flexShrink: 0, display: 'grid', gridTemplateRows: '20px 1fr 20px' }}
    >
      <div
        className="text-center text-[8px] tracking-widest text-office-text/40"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        ELEV
      </div>

      <div style={{ display: 'grid', gridTemplateRows: 'repeat(11, 1fr)', minHeight: 0, overflow: 'hidden' }}>
        {FLOOR_ORDER.map((floorId) => {
          const floor = FLOORS[floorId]
          const isActive = currentFloor === floorId
          const count = agentCountByFloor(floorId)
          const subtitle = floorId === '1f'
            ? '회의'
            : count > 0
              ? `${count}명`
              : '--'

          return (
            <button
              key={floorId}
              type="button"
              onClick={() => setCurrentFloor(floorId)}
              title={floor.name}
              style={{ minHeight: 0, overflow: 'hidden' }}
              className={`flex flex-col items-center justify-center rounded px-0.5 text-center transition-all ${
                isActive
                  ? 'border border-office-active bg-office-active/20'
                  : 'border border-transparent hover:bg-office-panel/60'
              }`}
            >
              <span className={`font-mono text-[10px] font-bold leading-none ${isActive ? 'text-office-active' : 'text-office-text/70'}`}>
                {floor.label}
              </span>
              <span className="mt-0.5 text-[8px] leading-none text-office-text/40">
                {subtitle}
              </span>
            </button>
          )
        })}
      </div>

      <div
        className="text-center text-[8px] tracking-widest text-office-text/40"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        LOBBY
      </div>
    </div>
  )
}
