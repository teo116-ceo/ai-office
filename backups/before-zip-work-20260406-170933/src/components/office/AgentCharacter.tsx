import { Agent } from '@/types'
import { useAgentStore } from '@/store/agentStore'

interface Props {
  agent: Agent
}

const STATUS_LABEL: Record<Agent['status'], string> = {
  idle: '대기',
  working: '작업 중',
  thinking: '생각 중...',
  debating: '토론 중',
  moving: '이동 중',
}

export default function AgentCharacter({ agent }: Props) {
  const { setSelectedAgent, selectedAgent } = useAgentStore()
  const isSelected = selectedAgent === agent.id

  return (
    <div
      className="absolute cursor-pointer transition-transform hover:scale-110"
      style={{ left: agent.position.x, top: agent.position.y }}
      onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
    >
      {/* 말풍선 */}
      {agent.message && (
        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-office-panel border border-office-active/30 rounded px-2 py-1 text-xs text-white whitespace-nowrap max-w-32 truncate z-10">
          {agent.message}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-office-panel" />
        </div>
      )}

      {/* 픽셀 캐릭터 (임시 도형) */}
      <div className="relative flex flex-col items-center">
        {/* 머리 */}
        <div
          className="w-6 h-6 rounded-sm border-2"
          style={{ backgroundColor: agent.color + '33', borderColor: agent.color }}
        />
        {/* 몸 */}
        <div
          className="w-5 h-7 rounded-sm mt-0.5"
          style={{ backgroundColor: agent.color + '55' }}
        />
        {/* 상태 표시 */}
        <div
          className={`w-2 h-2 rounded-full absolute -top-1 -right-1 ${
            agent.status === 'idle' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'
          }`}
        />
      </div>

      {/* 이름 태그 */}
      <div className="mt-1 text-center">
        <p className="text-xs text-white font-medium leading-none">{agent.name}</p>
        {agent.status !== 'idle' && (
          <p className="text-xs text-office-active/70 leading-none mt-0.5">
            {STATUS_LABEL[agent.status]}
          </p>
        )}
      </div>

      {/* 선택 표시 */}
      {isSelected && (
        <div
          className="absolute inset-0 -m-2 rounded border-2 border-office-active/60 animate-pulse pointer-events-none"
        />
      )}
    </div>
  )
}
