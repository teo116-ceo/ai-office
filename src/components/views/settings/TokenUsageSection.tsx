import type { DailyTokenBudget, ProviderId, ProviderUsageStats } from '@/types'
import { SectionCard, UsageRow } from './SettingsPrimitives'

const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: 'Claude',
  openai: 'GPT',
  gemini: 'Gemini',
}

const PROVIDER_USAGE_URL: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/usage',
  openai: 'https://platform.openai.com/usage',
  gemini: 'https://aistudio.google.com/apikey',
}

interface Props {
  usageByProvider: Record<ProviderId, ProviderUsageStats>
  providerKeyStatus: Record<ProviderId, boolean>
  resetProviderUsage: (provider?: ProviderId) => void
  dailyTokenBudget: DailyTokenBudget
  setDailyTokenBudget: (settings: Partial<DailyTokenBudget>) => void
}

export default function TokenUsageSection({
  usageByProvider,
  providerKeyStatus,
  resetProviderUsage,
  dailyTokenBudget,
  setDailyTokenBudget,
}: Props) {
  const usedPercent = dailyTokenBudget.limitTokens > 0
    ? Math.min(100, Math.round((dailyTokenBudget.usedToday / dailyTokenBudget.limitTokens) * 100))
    : 0
  const isNearLimit = usedPercent >= 80

  return (
    <>
      {/* ─── 일별 토큰 예산 ─────────────────────────────────────────────────── */}
      <SectionCard
        title="일별 사용량 한도"
        description="하루에 AI가 처리할 수 있는 최대 양을 설정합니다. 토큰은 AI가 읽고 쓰는 텍스트 단위로, 1,000 토큰이 대략 A4 반 페이지 분량입니다. 한도 초과 시 당일 새 요청이 차단됩니다."
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={dailyTokenBudget.enabled}
            onChange={(e) => setDailyTokenBudget({ enabled: e.target.checked })}
            className="h-4 w-4 rounded accent-office-active"
          />
          <span className="text-sm text-office-text">일별 예산 한도 활성화</span>
        </label>

        {dailyTokenBudget.enabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="w-28 text-sm text-office-text/70">하루 최대 토큰</label>
              <input
                type="number"
                min={1000}
                step={10000}
                value={dailyTokenBudget.limitTokens}
                onChange={(e) => setDailyTokenBudget({ limitTokens: Math.max(1000, Number(e.target.value)) })}
                className="w-36 rounded border border-office-panel/70 bg-office-panel px-3 py-1.5 text-sm text-white outline-none focus:border-office-active"
              />
              <span className="text-xs text-office-text/50">토큰</span>
            </div>

            <div className="rounded-lg border border-office-panel/70 bg-office-panel/40 p-3 space-y-2">
              <div className="flex justify-between text-xs text-office-text/70">
                <span>오늘 사용: {dailyTokenBudget.usedToday.toLocaleString('ko-KR')}</span>
                <span className={isNearLimit ? 'text-red-400' : ''}>
                  {usedPercent}% / 한도 {dailyTokenBudget.limitTokens.toLocaleString('ko-KR')}
                </span>
              </div>
              <div className="h-2 rounded-full bg-office-panel overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isNearLimit ? 'bg-red-500' : 'bg-office-active'}`}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-office-text/50">
                리셋 날짜: {dailyTokenBudget.resetDate} (매일 자정 자동 초기화)
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDailyTokenBudget({ usedToday: 0, resetDate: new Date().toISOString().slice(0, 10) })}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              오늘 사용량 수동 초기화
            </button>
          </div>
        )}
      </SectionCard>

      {/* ─── 공급자별 사용량 ────────────────────────────────────────────────── */}
      <SectionCard
        title="AI 사용량 현황"
        description="이번 세션(브라우저 탭을 연 이후)에 AI가 처리한 누적 사용량을 표시합니다. 잔여량은 각 AI 서비스 정책상 이 화면에서 직접 조회할 수 없습니다."
      >
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => resetProviderUsage()}
            className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            세션 사용량 초기화
          </button>
        </div>

        <p className="text-xs text-office-text/50">
          연결 상태는 브라우저 설정이 아닌 서버에 등록된 API 키 기준으로 표시됩니다.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(PROVIDER_LABEL) as ProviderId[]).map((provider) => (
            <ProviderCard
              key={provider}
              provider={provider}
              label={PROVIDER_LABEL[provider]}
              usage={usageByProvider[provider]}
              keyReady={providerKeyStatus[provider]}
              onReset={() => resetProviderUsage(provider)}
            />
          ))}
        </div>
      </SectionCard>
    </>
  )
}

interface ProviderCardProps {
  provider: ProviderId
  label: string
  usage: ProviderUsageStats
  keyReady: boolean
  onReset: () => void
}

function ProviderCard({ provider, label, usage, keyReady, onReset }: ProviderCardProps) {
  const updatedStr = usage.updatedAt
    ? usage.updatedAt.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '없음'

  return (
    <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <span className={`rounded-full px-2 py-1 text-[11px] ${
          keyReady ? 'bg-office-active/20 text-office-active' : 'bg-office-panel text-office-text/60'
        }`}>
          {keyReady ? '연결됨' : '미연결'}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <UsageRow label="요청 수" value={`${usage.requestCount}회`} />
        <UsageRow label="입력 토큰" value={usage.inputTokens.toLocaleString('ko-KR')} />
        <UsageRow label="출력 토큰" value={usage.outputTokens.toLocaleString('ko-KR')} />
        <UsageRow label="총 사용 토큰" value={usage.totalTokens.toLocaleString('ko-KR')} />
        <UsageRow
          label="남은 토큰"
          value={
            <a
              href={PROVIDER_USAGE_URL[provider]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-office-active underline hover:opacity-80"
            >
              사용량 페이지 →
            </a>
          }
        />
      </div>

      <div className="mt-4 space-y-1 text-[11px] text-office-text/50">
        <p>마지막 모델: {usage.lastModel ?? '없음'}</p>
        <p>마지막 집계: {updatedStr}</p>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
      >
        {label} 사용량 초기화
      </button>
    </div>
  )
}
