import { useMemo } from 'react'
import { resolveAgentFloor } from '@/services/directives'
import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, FLOORS } from '@/types'
import { FLOOR_ATMOSPHERE } from './officeLayout'
import PixiOffice from './PixiOffice'
import Office3DView from './Office3DView'

type ViewMode = '3d' | '2d'

export default function OfficeCanvas() {
  const { officeViewMode, setOfficeViewMode, currentFloor, agents } = useAgentStore()
  const floor = FLOORS[currentFloor]
  const atmosphere = FLOOR_ATMOSPHERE[currentFloor]
  const floorAgents = agents.filter((agent) => resolveAgentFloor(agent) === currentFloor)
  const activeAgents = floorAgents.filter((agent) => agent.status !== 'idle').length

  const departmentLabel = useMemo(() => {
    if (currentFloor === '1f') {
      return '카페와 라운지가 함께 있는 공용 휴식 공간'
    }

    if (currentFloor === '2f') {
      return '회의와 브리핑이 우선되는 공용 협업 층'
    }

    return floor.departments
      .map((departmentId) => DEPARTMENTS[departmentId]?.name ?? departmentId)
      .join(' · ')
  }, [currentFloor, floor.departments])

  return (
    <section className="flex-1 overflow-hidden bg-office-bg p-4 lg:p-5">
      <div
        className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#09111f] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        style={{
          backgroundImage: [
            `radial-gradient(circle at top right, ${atmosphere.accentColor}24, transparent 28%)`,
            'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))',
            'linear-gradient(180deg, #0d1626 0%, #09111f 100%)',
          ].join(', '),
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_70%)] opacity-40" />

        <header className="relative z-10 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4 lg:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-office-active/70">
              Office View
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold text-white">
                {floor.label} {floor.name}
              </h2>
              <span
                className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  borderColor: `${atmosphere.accentColor}55`,
                  backgroundColor: `${atmosphere.accentColor}18`,
                  color: atmosphere.accentColor,
                }}
              >
                {officeViewMode === '3d' ? '3D Isometric' : '2D Pixel Board'}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-white/60">{departmentLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <MetricChip label="현재 인원" value={`${floorAgents.length}명`} accent={atmosphere.accentColor} />
            <MetricChip label="활동 인원" value={`${activeAgents}명`} accent={atmosphere.accentColor} />
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1 backdrop-blur">
              <ModeButton
                mode="3d"
                active={officeViewMode === '3d'}
                accent={atmosphere.accentColor}
                onClick={() => setOfficeViewMode('3d')}
              />
              <ModeButton
                mode="2d"
                active={officeViewMode === '2d'}
                accent={atmosphere.accentColor}
                onClick={() => setOfficeViewMode('2d')}
              />
            </div>
          </div>
        </header>

        <div className="relative z-10 min-h-0 flex-1 p-3 lg:p-4">
          <div
            className="relative h-full overflow-hidden rounded-[24px] border border-white/10 bg-[#050b14] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            style={{
              backgroundImage: [
                'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0))',
                `radial-gradient(circle at 15% 18%, ${atmosphere.accentColor}18, transparent 24%)`,
                'linear-gradient(180deg, #08111e 0%, #050b14 100%)',
              ].join(', '),
            }}
          >
            {officeViewMode === '3d' ? <Office3DView /> : <PixiOffice />}
          </div>
        </div>
      </div>
    </section>
  )
}

function MetricChip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2 text-right backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-semibold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}

function ModeButton({
  mode,
  active,
  accent,
  onClick,
}: {
  mode: ViewMode
  active: boolean
  accent: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3.5 py-2 text-sm font-semibold transition-all duration-200"
      style={{
        backgroundColor: active ? `${accent}22` : 'transparent',
        border: `1px solid ${active ? `${accent}66` : 'transparent'}`,
        color: active ? accent : 'rgba(255,255,255,0.65)',
        boxShadow: active ? `0 0 18px ${accent}20` : 'none',
      }}
    >
      {mode === '3d' ? '3D 보기' : '2D 보기'}
    </button>
  )
}
