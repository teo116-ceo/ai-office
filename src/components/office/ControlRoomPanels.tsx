import { DEPARTMENTS, type Agent, type Message, type Task } from '@/types'
import { formatTime } from '@/utils/dateFormat'
import { getAgentRoleCompactLabel, getAgentRoleSummary } from '@/utils/agentRoleMeta'

export type ZoneSignal = 'steady' | 'watch' | 'focus'

export type ZoneCardData = {
  name: string
  description: string
  accent: string
  signal: ZoneSignal
  occupancy: number
  load: number
}

export type DepartmentCardData = {
  departmentId: string
  departmentName: string
  color: string
  agentCount: number
  activeCount: number
  taskCount: number
  messageCount: number
}

const STATUS_META = {
  idle: { label: '대기', dot: 'bg-white/25', tone: 'text-office-text/60' },
  working: { label: '업무 중', dot: 'bg-cyan-400', tone: 'text-cyan-300' },
  thinking: { label: '검토 중', dot: 'bg-violet-400', tone: 'text-violet-300' },
  debating: { label: '논의 중', dot: 'bg-amber-400', tone: 'text-amber-300' },
  moving: { label: '이동 중', dot: 'bg-emerald-400', tone: 'text-emerald-300' },
} as const

const TASK_STATUS_LABELS = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
  awaiting_approval: '확인 대기',
  failed: '실패',
} as const

export function MetricCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string
  value: string
  sub: string
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-office-panel/70 bg-office-panel/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-office-text/45">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: accent }}>
        {sub}
      </p>
    </div>
  )
}

export function ActionPill({
  label,
  onClick,
  accent,
}: {
  label: string
  onClick: () => void
  accent: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
      style={{ borderColor: `${accent}55`, backgroundColor: `${accent}12`, color: accent }}
    >
      {label}
    </button>
  )
}

export function AlertRow({
  title,
  detail,
  accent,
}: {
  title: string
  detail: string
  accent: string
}) {
  return (
    <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-office-text/60">{detail}</p>
    </div>
  )
}

export function ZoneBoard({ zones }: { zones: ZoneCardData[] }) {
  return (
    <section className="rounded-2xl border border-office-panel/70 bg-office-sidebar/80 p-5">
      <div>
        <p className="text-sm font-semibold text-white">공간 현황</p>
        <p className="mt-1 text-xs text-office-text/55">사람이 몰리는 구역과 집중도가 높은 구역을 나눠 보여줍니다.</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {zones.map((zone) => (
          <div key={zone.name} className="rounded-2xl border border-office-panel/60 bg-office-panel/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{zone.name}</p>
                <p className="mt-1 text-xs text-office-text/55">{zone.description}</p>
              </div>
              <SignalBadge signal={zone.signal} accent={zone.accent} />
            </div>
            <div className="mt-4 space-y-3">
              <Meter label="바쁜 정도" value={zone.load} accent={zone.accent} />
              <div className="flex items-center justify-between text-xs text-office-text/55">
                <span>머무는 인원</span>
                <span>{zone.occupancy}명</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function DepartmentStatusPanel({
  departments,
  onOpenChat,
}: {
  departments: DepartmentCardData[]
  onOpenChat: () => void
}) {
  return (
    <div className="rounded-2xl border border-office-panel/70 bg-office-sidebar/80 p-5">
      <p className="text-sm font-semibold text-white">부서 상태</p>
      <div className="mt-4 space-y-3">
        {departments.length > 0 ? departments.map((department) => (
          <button
            key={department.departmentId}
            type="button"
            onClick={onOpenChat}
            className="w-full rounded-xl border border-office-panel/60 bg-office-panel/35 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{department.departmentName}</p>
                <p className="mt-1 text-xs text-office-text/55">
                  인원 {department.agentCount}명 · 최근 대화 {department.messageCount}건
                </p>
              </div>
              <span
                className="rounded-full px-2 py-1 text-[11px] font-semibold"
                style={{ backgroundColor: `${department.color}22`, color: department.color }}
              >
                활동 {department.activeCount}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/6">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, 18 + department.taskCount * 16)}%`, backgroundColor: department.color }}
              />
            </div>
          </button>
        )) : (
          <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-5 text-sm text-office-text/45">
            이 층은 부서보다 공용 공간 중심으로 운영됩니다.
          </div>
        )}
      </div>
    </div>
  )
}

export function TaskQueuePanel({
  tasks,
  onOpenTasks,
}: {
  tasks: Task[]
  onOpenTasks: () => void
}) {
  return (
    <div className="rounded-2xl border border-office-panel/70 bg-office-sidebar/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">업무 목록</p>
        <button type="button" onClick={onOpenTasks} className="text-xs text-office-active transition-colors hover:text-white">
          전체 보기
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.slice(0, 6).map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-5 text-sm text-office-text/45">
            이 층에 연결된 업무가 없습니다.
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function RecentMessagesPanel({
  messages,
  onOpenChat,
}: {
  messages: Message[]
  onOpenChat: () => void
}) {
  return (
    <div className="rounded-2xl border border-office-panel/70 bg-office-sidebar/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">최근 대화</p>
        <button type="button" onClick={onOpenChat} className="text-xs text-office-active transition-colors hover:text-white">
          대화 보기
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {messages.slice(0, 6).map((message) => (
          <button
            key={message.id}
            type="button"
            onClick={onOpenChat}
            className="w-full rounded-xl border border-office-panel/60 bg-office-panel/35 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/50"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-semibold text-office-active">{message.senderName}</p>
              <p className="text-[11px] text-office-text/35">{formatTime(message.timestamp)}</p>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-office-text/80">{message.content}</p>
          </button>
        ))}
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-5 text-sm text-office-text/45">
            최근 대화가 없습니다.
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AgentMatrixPanel({
  agents,
  onOpenAgents,
}: {
  agents: Agent[]
  onOpenAgents: () => void
}) {
  return (
    <section className="rounded-2xl border border-office-panel/70 bg-office-sidebar/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">인원 현황</p>
          <p className="mt-1 text-xs text-office-text/55">누가 무엇을 하고 있는지 빠르게 확인합니다.</p>
        </div>
        <span className="rounded-full border border-office-panel/70 bg-office-panel/40 px-3 py-1 text-xs text-office-text/55">
          총 {agents.length}명
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => {
          const statusMeta = STATUS_META[agent.status]
          return (
            <button
              key={agent.id}
              type="button"
              onClick={onOpenAgents}
              className="rounded-xl border border-office-panel/60 bg-office-panel/35 px-4 py-3 text-left transition-colors hover:border-office-active hover:bg-office-panel/50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
                  <p className="mt-1 text-xs text-office-text/55">{DEPARTMENTS[agent.departmentId]?.name ?? agent.departmentId}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${statusMeta.tone}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${statusMeta.dot}`} />
                  {statusMeta.label}
                </span>
              </div>
              <p className="mt-3 min-h-[2.5rem] line-clamp-2 text-xs text-office-text/65">
                {agent.message ?? getAgentRoleSummary(agent) ?? `${getAgentRoleCompactLabel(agent)} 역할로 현재 상황을 확인 중입니다.`}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="rounded-xl border border-office-panel/60 bg-office-panel/35 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{task.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-office-text/55">{task.description}</p>
        </div>
        <span className="rounded-full bg-office-active/10 px-2 py-1 text-[11px] text-office-active">
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-office-text/35">
        {task.assignedTo.map((departmentId) => DEPARTMENTS[departmentId]?.name ?? departmentId).join(', ')}
      </p>
    </div>
  )
}

function SignalBadge({ signal, accent }: { signal: ZoneSignal; accent: string }) {
  const label = signal === 'focus' ? '집중' : signal === 'watch' ? '주의' : '안정'
  return (
    <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${accent}22`, color: accent }}>
      {label}
    </span>
  )
}

function Meter({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-office-text/45">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/6">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: accent }} />
      </div>
    </div>
  )
}
