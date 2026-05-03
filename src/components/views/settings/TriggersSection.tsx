import type { AgentTrigger, DepartmentId, TriggerMode } from '@/types'
import { DEPARTMENTS } from '@/types'
import { SectionCard, OptionRow, ToggleButton } from './SettingsPrimitives'

interface Props {
  triggers: AgentTrigger[]
  triggersEnabled: boolean
  setTriggers: (triggers: AgentTrigger[]) => void
  setTriggersEnabled: (enabled: boolean) => void
}

export default function TriggersSection({ triggers, triggersEnabled, setTriggers, setTriggersEnabled }: Props) {
  return (
    <SectionCard
      title="자동 전달"
      description="업무 완료 후 조건에 맞으면 연관 부서에 자동으로 다음 업무를 전달합니다. 각 항목을 개별적으로 켜고 끌 수 있습니다."
    >
      <OptionRow
        label="자동 전달"
        description={triggersEnabled
          ? '활성화됨 — 조건 충족 시 다음 부서에 자동으로 업무가 전달됩니다.'
          : '비활성화 — 업무 완료 후 다음 부서로 전달되지 않습니다.'}
        actions={
          <div className="flex gap-2">
            <ToggleButton active={triggersEnabled} label="켜기" onClick={() => setTriggersEnabled(true)} />
            <ToggleButton active={!triggersEnabled} label="끄기" onClick={() => setTriggersEnabled(false)} />
          </div>
        }
      />
      <div className="space-y-3">
        {triggers.map((trigger) => (
          <TriggerRow
            key={trigger.id}
            trigger={trigger}
            onToggle={() => setTriggers(
              triggers.map((t) => t.id === trigger.id ? { ...t, enabled: !t.enabled } : t)
            )}
            onModeChange={(mode: TriggerMode) => setTriggers(
              triggers.map((t) => t.id === trigger.id ? { ...t, mode } : t)
            )}
          />
        ))}
      </div>
    </SectionCard>
  )
}

function TriggerRow({
  trigger,
  onToggle,
  onModeChange,
}: {
  trigger: AgentTrigger
  onToggle: () => void
  onModeChange: (mode: TriggerMode) => void
}) {
  const conditionText = trigger.condition === 'always'
    ? '항상 실행'
    : trigger.condition === 'keywords'
    ? `키워드 감지: ${trigger.keywords?.join(', ')}`
    : '파일 저장 시'

  const deptNames = trigger.toDepts.map((d: DepartmentId) => DEPARTMENTS[d].name).join(', ')
  const currentMode = trigger.mode ?? 'task'

  return (
    <div className={`rounded-xl border px-4 py-4 transition-colors ${
      trigger.enabled ? 'border-office-active/30 bg-office-active/5' : 'border-office-panel/70 bg-office-panel/40'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{trigger.label}</p>
          <p className="mt-1 text-xs text-office-text/60">{conditionText} → {deptNames}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
            trigger.enabled
              ? 'border-office-active bg-office-active/20 text-office-active'
              : 'border-office-panel/70 bg-office-panel text-office-text/60 hover:border-office-active hover:text-white'
          }`}
        >
          {trigger.enabled ? '활성' : '비활성'}
        </button>
      </div>
      {/* 모드 선택 */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] text-office-text/50">실행 방식</span>
        <button
          type="button"
          onClick={() => onModeChange('task')}
          title="완료 후 새 업무를 별도로 만듭니다."
          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
            currentMode === 'task'
              ? 'border-office-active/60 bg-office-active/15 text-office-active'
              : 'border-office-panel/60 text-office-text/40 hover:text-office-text'
          }`}
        >
          새 업무 생성
        </button>
        <button
          type="button"
          onClick={() => onModeChange('review')}
          title="원본 업무에 검토 의견을 추가합니다. 새 업무는 만들지 않습니다."
          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
            currentMode === 'review'
              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-400'
              : 'border-office-panel/60 text-office-text/40 hover:text-office-text'
          }`}
        >
          교차 검토
        </button>
      </div>
    </div>
  )
}
