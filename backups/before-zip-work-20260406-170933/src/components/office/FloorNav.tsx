import { resolveAgentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { FLOORS, FloorId } from '@/types'

const FLOOR_ORDER: FloorId[] = ['12f','11f','10f','9f','8f','7f','6f','5f','4f','3f','2f','1f']

export default function FloorNav() {
  const { currentFloor, setCurrentFloor, agents } = useAgentStore()

  const agentCountByFloor = (floorId: FloorId) =>
    agents.filter((agent) => resolveAgentFloor(agent) === floorId).length

  return (
    <div className="flex flex-col items-center gap-0.5 py-3 px-1.5 bg-office-sidebar border-l border-office-panel shrink-0 overflow-y-auto">
      {/* 엘리베이터 아이콘 */}
      <div className="text-office-text/40 text-xs mb-2 writing-mode-vertical tracking-widest">
        ▲ ELEV
      </div>

      {FLOOR_ORDER.map((floorId) => {
        const floor = FLOORS[floorId]
        const isActive = currentFloor === floorId
        const count = agentCountByFloor(floorId)
        const isCafe = floorId === '1f'
        const isMeeting = floorId === '2f'

        return (
          <button
            key={floorId}
            onClick={() => setCurrentFloor(floorId)}
            title={floor.name}
            className={`w-12 flex flex-col items-center py-1.5 px-1 rounded transition-all text-center ${
              isActive
                ? 'bg-office-active/20 border border-office-active'
                : 'hover:bg-office-panel/60 border border-transparent'
            }`}
          >
            <span
              className={`text-xs font-bold font-mono ${
                isActive ? 'text-office-active' : 'text-office-text/70'
              }`}
            >
              {floor.label}
            </span>
            <span className="text-office-text/40 leading-tight" style={{ fontSize: '9px' }}>
              {isCafe ? '☕' : isMeeting ? '🗣' : count > 0 ? `${count}명` : '—'}
            </span>
          </button>
        )
      })}

      <div className="text-office-text/40 text-xs mt-2 tracking-widest">
        ▼
      </div>
    </div>
  )
}
