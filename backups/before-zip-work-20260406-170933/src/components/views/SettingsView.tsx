import { type ReactNode, useState } from 'react'
import { triggerBriefingNow } from '@/services/schedulerService'
import { requestNotificationPermission } from '@/services/webhookService'
import { useAgentStore } from '@/store/agentStore'
import { ProviderId } from '@/types'

const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: 'Claude',
  openai: 'GPT',
  gemini: 'Gemini',
}

export default function SettingsView() {
  const {
    themeMode,
    officeViewMode,
    autoBehaviorEnabled,
    webhookSettings,
    schedulerSettings,
    directives,
    usageByProvider,
    setThemeMode,
    setOfficeViewMode,
    setAutoBehaviorEnabled,
    setWebhookSettings,
    setSchedulerSettings,
    clearDirectives,
    clearMessages,
    clearTasks,
    resetProviderUsage,
    setActiveView,
  } = useAgentStore()

  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  )
  const [webhookTestMsg, setWebhookTestMsg] = useState<string | null>(null)

  const providerKeyStatus: Record<ProviderId, boolean> = {
    anthropic: Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY),
    openai: Boolean(import.meta.env.VITE_OPENAI_API_KEY),
    gemini: Boolean(import.meta.env.VITE_GEMINI_API_KEY),
  }

  return (
    <section className="flex-1 overflow-y-auto bg-office-bg p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-office-active">설정</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">워크스페이스 제어</h2>
            <p className="mt-2 text-sm text-office-text/60">
              헤더 버튼과 오피스 보기를 포함한 전반적인 동작을 여기서 조정할 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveView('office')}
            className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            AI 오피스로 이동
          </button>
        </div>

        <SectionCard
          title="화면 스타일"
          description="헤더의 테마 버튼과 같은 상태를 제어합니다."
        >
          <OptionRow
            label="테마"
            description={themeMode === 'dark' ? '현재 다크 테마' : '현재 라이트 테마'}
            actions={
              <div className="flex gap-2">
                <ToggleButton active={themeMode === 'dark'} label="다크" onClick={() => setThemeMode('dark')} />
                <ToggleButton active={themeMode === 'light'} label="라이트" onClick={() => setThemeMode('light')} />
              </div>
            }
          />
          <OptionRow
            label="오피스 보기"
            description={officeViewMode === '3d' ? '현재 3D 아이소 뷰' : '현재 2D 픽셀 뷰'}
            actions={
              <div className="flex gap-2">
                <ToggleButton active={officeViewMode === '3d'} label="3D" onClick={() => setOfficeViewMode('3d')} />
                <ToggleButton active={officeViewMode === '2d'} label="2D" onClick={() => setOfficeViewMode('2d')} />
              </div>
            }
          />
        </SectionCard>

        <SectionCard
          title="자동 동작"
          description="에이전트 자율 메모 생성 여부를 제어합니다."
        >
          <OptionRow
            label="자율 메모"
            description={autoBehaviorEnabled ? '15초 후 시작해 45초 간격으로 자동 메모를 생성합니다.' : '자동 메모 생성을 중지합니다.'}
            actions={
              <div className="flex gap-2">
                <ToggleButton active={autoBehaviorEnabled} label="켜기" onClick={() => setAutoBehaviorEnabled(true)} />
                <ToggleButton active={!autoBehaviorEnabled} label="끄기" onClick={() => setAutoBehaviorEnabled(false)} />
              </div>
            }
          />
        </SectionCard>

        <SectionCard
          title="토큰 현황"
          description="정확한 잔여 토큰은 현재 API 연동 방식에서 직접 조회할 수 없어, 이번 세션 누적 사용량을 표시합니다."
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

          <div className="grid gap-4 lg:grid-cols-3">
            {(Object.keys(PROVIDER_LABEL) as ProviderId[]).map((provider) => {
              const usage = usageByProvider[provider]
              const keyReady = providerKeyStatus[provider]

              return (
                <div
                  key={provider}
                  className="rounded-xl border border-office-panel/70 bg-office-panel/40 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{PROVIDER_LABEL[provider]}</p>
                    <span className={`rounded-full px-2 py-1 text-[11px] ${
                      keyReady ? 'bg-office-active/20 text-office-active' : 'bg-office-panel text-office-text/60'
                    }`}>
                      {keyReady ? 'API 연결됨' : '키 없음'}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <UsageRow label="요청 수" value={`${usage.requestCount}회`} />
                    <UsageRow label="입력 토큰" value={formatNumber(usage.inputTokens)} />
                    <UsageRow label="출력 토큰" value={formatNumber(usage.outputTokens)} />
                    <UsageRow label="총 사용 토큰" value={formatNumber(usage.totalTokens)} />
                    <UsageRow
                      label="남은 토큰"
                      value="현재 API 미제공"
                      emphasize
                    />
                  </div>

                  <div className="mt-4 space-y-1 text-[11px] text-office-text/50">
                    <p>마지막 모델: {usage.lastModel ?? '없음'}</p>
                    <p>
                      마지막 집계: {usage.updatedAt
                        ? usage.updatedAt.toLocaleString('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '없음'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => resetProviderUsage(provider)}
                    className="mt-4 rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
                  >
                    {PROVIDER_LABEL[provider]} 사용량 초기화
                  </button>
                </div>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="활성 전사 공지"
          description="현재 이후 업무와 자율 행동에 반영되는 공지와 지시입니다."
        >
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => clearDirectives('meeting')}
              className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              회의 지시 해제
            </button>
            <button
              type="button"
              onClick={() => clearDirectives()}
              className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              전체 공지 해제
            </button>
          </div>

          {directives.length > 0 ? (
            <div className="space-y-3">
              {[...directives].reverse().map((directive) => (
                <div
                  key={directive.id}
                  className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{directive.title}</p>
                      <p className="mt-1 text-xs text-office-text/60">
                        {directive.kind === 'meeting' ? '회의 지시' : '전사 공지'}
                      </p>
                    </div>
                    <p className="text-xs text-office-text/40">
                      {directive.createdAt.toLocaleString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-office-text">{directive.summary}</p>
                  <p className="mt-2 text-xs text-office-text/60">{directive.behaviorInstruction}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-office-text/50">현재 적용 중인 전사 공지가 없습니다.</p>
          )}
        </SectionCard>

        <SectionCard
          title="알림 설정"
          description="작업 완료·실패 시 Discord/Slack 웹훅 발송 및 브라우저 알림을 설정합니다."
        >
          {/* 브라우저 알림 */}
          <OptionRow
            label="브라우저 알림"
            description={notifGranted ? '브라우저 알림 권한이 허용되어 있습니다.' : '권한을 허용하면 작업 완료 시 알림을 받을 수 있습니다.'}
            actions={
              notifGranted ? (
                <span className="rounded-full bg-office-active/20 px-3 py-1.5 text-sm text-office-active">허용됨</span>
              ) : (
                <button type="button"
                  onClick={() => void requestNotificationPermission().then((ok) => setNotifGranted(ok))}
                  className="rounded-full border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text hover:border-office-active hover:text-white transition-colors">
                  권한 요청
                </button>
              )
            }
          />
          {/* 웹훅 URL */}
          <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-white">웹훅 URL (Discord / Slack)</p>
              <p className="mt-1 text-xs text-office-text/60">작업 완료·실패 시 해당 URL로 자동 발송합니다.</p>
            </div>
            <input
              type="url"
              value={webhookSettings.url}
              onChange={(e) => setWebhookSettings({ url: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/30 focus:outline-none focus:border-office-active"
            />
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-office-text cursor-pointer">
                <input type="checkbox" checked={webhookSettings.enabled}
                  onChange={(e) => setWebhookSettings({ enabled: e.target.checked })}
                  className="accent-office-active" />
                웹훅 활성화
              </label>
              <label className="flex items-center gap-2 text-sm text-office-text cursor-pointer">
                <input type="checkbox" checked={webhookSettings.onTaskComplete}
                  onChange={(e) => setWebhookSettings({ onTaskComplete: e.target.checked })}
                  className="accent-office-active" />
                완료 시 발송
              </label>
              <label className="flex items-center gap-2 text-sm text-office-text cursor-pointer">
                <input type="checkbox" checked={webhookSettings.onTaskFail}
                  onChange={(e) => setWebhookSettings({ onTaskFail: e.target.checked })}
                  className="accent-office-active" />
                실패 시 발송
              </label>
              <label className="flex items-center gap-2 text-sm text-office-text cursor-pointer">
                <input type="checkbox" checked={webhookSettings.onDailyBriefing}
                  onChange={(e) => setWebhookSettings({ onDailyBriefing: e.target.checked })}
                  className="accent-office-active" />
                일일 브리핑 발송
              </label>
            </div>
            <div className="flex gap-2 items-center">
              <button type="button"
                onClick={async () => {
                  if (!webhookSettings.url) { setWebhookTestMsg('URL을 입력하세요.'); return }
                  try {
                    await fetch(webhookSettings.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: '✅ AI 오피스 웹훅 테스트 메시지입니다.' }) })
                    setWebhookTestMsg('발송 성공!')
                  } catch { setWebhookTestMsg('발송 실패 — URL을 확인하세요.') }
                  setTimeout(() => setWebhookTestMsg(null), 3000)
                }}
                className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text hover:border-office-active hover:text-white transition-colors">
                테스트 발송
              </button>
              {webhookTestMsg && <span className="text-sm text-office-active">{webhookTestMsg}</span>}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="일일 브리핑 스케줄러"
          description="매일 정해진 시간에 AI가 자동으로 각 부서 점검 항목을 모아 브리핑을 생성합니다."
        >
          <OptionRow
            label="자동 브리핑"
            description={schedulerSettings.enabled ? `매일 ${schedulerSettings.hourUTC}시 ${schedulerSettings.minute.toString().padStart(2,'0')}분에 자동 실행됩니다.` : '비활성화 상태입니다.'}
            actions={
              <div className="flex gap-2">
                <ToggleButton active={schedulerSettings.enabled} label="켜기" onClick={() => setSchedulerSettings({ enabled: true })} />
                <ToggleButton active={!schedulerSettings.enabled} label="끄기" onClick={() => setSchedulerSettings({ enabled: false })} />
              </div>
            }
          />
          <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4 space-y-3">
            <p className="text-sm font-semibold text-white">브리핑 시간 설정</p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-office-text/70">시</label>
              <input type="number" min={0} max={23} value={schedulerSettings.hourUTC}
                onChange={(e) => setSchedulerSettings({ hourUTC: Number(e.target.value) })}
                className="w-20 rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-white focus:outline-none focus:border-office-active" />
              <label className="text-sm text-office-text/70">분</label>
              <input type="number" min={0} max={59} value={schedulerSettings.minute}
                onChange={(e) => setSchedulerSettings({ minute: Number(e.target.value) })}
                className="w-20 rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-white focus:outline-none focus:border-office-active" />
              <span className="text-xs text-office-text/40">(로컬 시간 기준)</span>
            </div>
            <button type="button"
              onClick={() => triggerBriefingNow()}
              className="rounded border border-office-active/40 bg-office-active/10 px-4 py-2 text-sm text-office-active hover:bg-office-active/20 transition-colors">
              지금 브리핑 실행
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="기록 정리"
          description="현재 세션에 쌓인 대화와 업무 기록을 개별로 정리합니다."
        >
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={clearMessages}
              className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              대화 비우기
            </button>
            <button
              type="button"
              onClick={clearTasks}
              className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              업무 목록 비우기
            </button>
          </div>
        </SectionCard>
      </div>
    </section>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-office-text/60">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  )
}

function OptionRow({
  label,
  description,
  actions,
}: {
  label: string
  description: string
  actions: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-1 text-xs text-office-text/60">{description}</p>
      </div>
      {actions}
    </div>
  )
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
        active
          ? 'border-office-active bg-office-active/20 text-office-active'
          : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function UsageRow({
  label,
  value,
  emphasize = false,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-office-text/60">{label}</span>
      <span className={emphasize ? 'text-office-active' : 'text-white'}>{value}</span>
    </div>
  )
}

function formatNumber(value: number) {
  return value.toLocaleString('ko-KR')
}
