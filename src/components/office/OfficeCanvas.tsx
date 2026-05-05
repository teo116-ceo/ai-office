import { useMemo } from 'react'
import { resolveAgentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { DEPARTMENTS, FLOORS } from '@/types'
import { FLOOR_ATMOSPHERE } from './officeLayout'
import OrganizationControlRoom from './OrganizationControlRoom'

type OfficeCanvasProps = {
  isCommunicationPanelOpen: boolean
  onToggleCommunicationPanel: () => void
}

export default function OfficeCanvas({
  isCommunicationPanelOpen,
  onToggleCommunicationPanel,
}: OfficeCanvasProps) {
  const { currentFloor, agents, themeMode } = useAgentStore(
    useShallow((s) => ({
      currentFloor: s.currentFloor,
      agents: s.agents,
      themeMode: s.themeMode,
    }))
  )

  const isLight = themeMode !== 'dark'
  const floor = FLOORS[currentFloor]
  const atmosphere = FLOOR_ATMOSPHERE[currentFloor]
  const floorAgents = agents.filter((agent) => resolveAgentFloor(agent) === currentFloor)
  const currentPeopleCount = floorAgents.length
  const activeAgents = floorAgents.filter((agent) => agent.status !== 'idle').length

  const summaryLabel = useMemo(() => {
    if (currentFloor === '1f') {
      return '회의 일정과 참석 흐름을 한눈에 보는 공용 층'
    }

    if (currentFloor === '2f') {
      return '마케팅과 리서치 진행 상황을 함께 보는 업무 층'
    }

    return floor.departments
      .map((departmentId) => DEPARTMENTS[departmentId]?.name ?? departmentId)
      .join(' · ')
  }, [currentFloor, floor.departments])

  return (
    <section className="flex-1 overflow-hidden bg-office-bg p-1 sm:p-4 lg:p-5">
      <div
        className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border shadow-[0_24px_80px_rgba(0,0,0,0.16)] sm:rounded-[28px] ${
          isLight ? 'border-slate-300/80' : 'border-white/10'
        }`}
        style={{
          background: isLight
            ? [
                `radial-gradient(circle at top right, ${atmosphere.accentColor}12, transparent 26%)`,
                'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.38))',
                'rgb(var(--office-sidebar-rgb))',
              ].join(', ')
            : [
                `radial-gradient(circle at top right, ${atmosphere.accentColor}24, transparent 28%)`,
                'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))',
                'linear-gradient(180deg, #0d1626 0%, #09111f 100%)',
              ].join(', '),
        }}
      >
        {!isLight ? (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_70%)] opacity-40" />
          </>
        ) : null}

        <header className={`relative z-10 flex items-center justify-between gap-2 border-b px-3 py-2 sm:flex-wrap sm:items-start sm:gap-4 sm:px-5 sm:py-4 lg:px-6 ${isLight ? 'border-slate-300/80' : 'border-white/10'}`}>
          <div className="min-w-0">
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.32em] text-office-active/70 sm:block">
              조직 관제실
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:mt-2 sm:gap-3">
              <h2 className={`text-sm font-semibold sm:text-2xl ${isLight ? 'text-office-text' : 'text-white'}`}>
                {floor.label} {floor.name}
              </h2>
              <span
                className="hidden rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] sm:inline-block"
                style={{
                  borderColor: `${atmosphere.accentColor}55`,
                  backgroundColor: `${atmosphere.accentColor}12`,
                  color: atmosphere.accentColor,
                }}
              >
                운영 화면
              </span>
            </div>
            <p className={`mt-1 hidden max-w-3xl text-sm sm:block ${isLight ? 'text-office-text/60' : 'text-white/60'}`}>
              {summaryLabel}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:flex-wrap sm:gap-3">
            <div className="hidden sm:contents">
              <MetricChip label="현재 인원" value={`${currentPeopleCount}명`} accent={atmosphere.accentColor} isLight={isLight} />
              <MetricChip label="활성 인원" value={`${activeAgents}명`} accent={atmosphere.accentColor} isLight={isLight} />
            </div>
            <button
              type="button"
              onClick={onToggleCommunicationPanel}
              className="rounded-full px-2 py-1 text-xs font-semibold transition-all duration-200 sm:px-3 sm:py-1.5"
              style={{
                backgroundColor: isCommunicationPanelOpen
                  ? `${atmosphere.accentColor}16`
                  : (isLight ? 'rgba(255,255,255,0.66)' : 'rgba(255,255,255,0.04)'),
                border: `1px solid ${isCommunicationPanelOpen ? `${atmosphere.accentColor}55` : (isLight ? 'rgba(148,163,184,0.55)' : 'rgba(255,255,255,0.1)')}`,
                color: isCommunicationPanelOpen ? atmosphere.accentColor : (isLight ? 'rgb(51 65 85)' : 'rgba(255,255,255,0.8)'),
                boxShadow: isCommunicationPanelOpen ? `0 0 18px ${atmosphere.accentColor}16` : 'none',
              }}
            >
              {isCommunicationPanelOpen ? '채팅창 닫기' : '채팅창 열기'}
            </button>
          </div>
        </header>

        <div className="relative z-10 min-h-0 flex-1 p-1 sm:p-3 lg:p-4">
          <div
            className={`relative h-full overflow-hidden rounded-[24px] border ${isLight ? 'border-slate-300/70' : 'border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'}`}
            style={{
              background: isLight
                ? [
                    `radial-gradient(circle at 15% 18%, ${atmosphere.accentColor}10, transparent 22%)`,
                    'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(248,250,252,0.98))',
                  ].join(', ')
                : [
                    'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0))',
                    `radial-gradient(circle at 15% 18%, ${atmosphere.accentColor}18, transparent 24%)`,
                    'linear-gradient(180deg, #08111e 0%, #050b14 100%)',
                  ].join(', '),
            }}
          >
            <OrganizationControlRoom accentColor={atmosphere.accentColor} />
          </div>
        </div>
      </div>
    </section>
  )
}

function MetricChip({
  label,
  value,
  accent,
  isLight,
}: {
  label: string
  value: string
  accent: string
  isLight: boolean
}) {
  return (
    <div
      className="rounded-2xl px-3.5 py-2 text-right backdrop-blur"
      style={{
        border: `1px solid ${isLight ? 'rgba(148,163,184,0.5)' : 'rgba(255,255,255,0.1)'}`,
        backgroundColor: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.2)',
      }}
    >
      <p className={`text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-office-text/45' : 'text-white/45'}`}>{label}</p>
      <p className="mt-1 text-sm font-semibold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}
