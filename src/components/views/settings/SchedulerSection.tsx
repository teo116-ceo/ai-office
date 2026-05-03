import type { SchedulerSettings } from '@/services/schedulerService'
import { triggerBriefingNow } from '@/services/schedulerService'
import { SectionCard, OptionRow, ToggleButton } from './SettingsPrimitives'

interface Props {
  schedulerSettings: SchedulerSettings
  setSchedulerSettings: (settings: Partial<SchedulerSettings>) => void
}

export default function SchedulerSection({ schedulerSettings, setSchedulerSettings }: Props) {
  const timeDesc = schedulerSettings.enabled
    ? `매일 ${schedulerSettings.hourUTC}시 ${schedulerSettings.minute.toString().padStart(2, '0')}분에 자동 실행됩니다.`
    : '비활성화 상태입니다.'

  return (
    <SectionCard
      title="일일 브리핑 스케줄러"
      description="매일 정해진 시간에 AI가 자동으로 각 부서 점검 항목을 모아 브리핑을 생성합니다."
    >
      <OptionRow
        label="자동 브리핑"
        description={timeDesc}
        actions={
          <div className="flex gap-2">
            <ToggleButton active={schedulerSettings.enabled} label="켜기" onClick={() => setSchedulerSettings({ enabled: true })} />
            <ToggleButton active={!schedulerSettings.enabled} label="끄기" onClick={() => setSchedulerSettings({ enabled: false })} />
          </div>
        }
      />
      <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4 space-y-3">
        <p className="text-sm font-semibold text-white">브리핑 시간 설정</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button"
            onClick={() => triggerBriefingNow()}
            className="whitespace-nowrap self-start rounded border border-office-active/40 bg-office-active/10 px-4 py-2 text-sm text-office-active transition-colors hover:bg-office-active/20">
            지금 브리핑 실행
          </button>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={23} value={schedulerSettings.hourUTC}
              onChange={(e) => setSchedulerSettings({ hourUTC: Number(e.target.value) })}
              className="w-14 rounded border border-office-panel/50 bg-office-panel px-2 py-2 text-center text-sm text-white focus:border-office-active focus:outline-none" />
            <span className="text-sm text-office-text/70">시</span>
            <input type="number" min={0} max={59} value={schedulerSettings.minute}
              onChange={(e) => setSchedulerSettings({ minute: Number(e.target.value) })}
              className="w-14 rounded border border-office-panel/50 bg-office-panel px-2 py-2 text-center text-sm text-white focus:border-office-active focus:outline-none" />
            <span className="text-sm text-office-text/70">분</span>
            <span className="ml-1 text-xs text-office-text/40">24h · 로컬</span>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
