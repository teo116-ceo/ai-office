import { useEffect, useState } from 'react'
import { validateWebhookUrl } from '@/services/webhookService'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import type { ProviderId } from '@/types'
import { apiHeaders } from '@/utils/apiHeaders'
import QuickStatusPanel from './settings/QuickStatusPanel'
import AppearanceSection from './settings/AppearanceSection'
import MemorySection from './settings/MemorySection'
import TriggersSection from './settings/TriggersSection'
import ApprovalSection from './settings/ApprovalSection'
import TokenUsageSection from './settings/TokenUsageSection'
import DirectivesSection from './settings/DirectivesSection'
import NotificationsSection from './settings/NotificationsSection'
import NotionSection from './settings/NotionSection'
import SchedulerSection from './settings/SchedulerSection'
import DataManagementSection from './settings/DataManagementSection'
import ApiKeysSection from './settings/ApiKeysSection'

type SettingsTab = 'appearance' | 'ai' | 'integrations' | 'data'

const TABS: Array<{ id: SettingsTab; label: string; description: string }> = [
  { id: 'appearance', label: '화면', description: '화면 테마와 표시 방식을 조정합니다.' },
  { id: 'ai', label: 'AI 동작', description: '메모리, 승인, 자동 전달, 브리핑 등 AI 동작 방식을 설정합니다.' },
  { id: 'integrations', label: '외부 연동', description: 'Discord, Slack, Notion 같은 외부 연동을 관리합니다.' },
  { id: 'data', label: '데이터', description: '사용량, 백업, 복원, 기록 정리를 관리합니다.' },
]

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const {
    themeMode, fontFamily, fontSize, responseLanguage,
    memoryEnabled, memories,
    approvalRequired, approvalPolicies,
    webhookSettings, schedulerSettings,
    directives, usageByProvider,
    notionSettings, triggersEnabled, triggers,
    dailyTokenBudget,
    debateEnabled,
    setThemeMode, setFontFamily, setFontSize, setResponseLanguage,
    setMemoryEnabled, clearMemories,
    setApprovalRequired, setApprovalPolicies,
    setWebhookSettings, resetWebhookSettings, setSchedulerSettings,
    setNotionSettings, resetNotionSettings, setTriggers, setTriggersEnabled,
    setDebateEnabled,
    clearDirectives, clearMessages, clearTasks,
    resetProviderUsage, setActiveView, setDailyTokenBudget,
  } = useAgentStore(
    useShallow((s) => ({
      themeMode: s.themeMode,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      responseLanguage: s.responseLanguage,
      memoryEnabled: s.memoryEnabled,
      memories: s.memories,
      approvalRequired: s.approvalRequired,
      approvalPolicies: s.approvalPolicies,
      webhookSettings: s.webhookSettings,
      schedulerSettings: s.schedulerSettings,
      directives: s.directives,
      usageByProvider: s.usageByProvider,
      notionSettings: s.notionSettings,
      triggersEnabled: s.triggersEnabled,
      triggers: s.triggers,
      dailyTokenBudget: s.dailyTokenBudget,
      debateEnabled: s.debateEnabled,
      setThemeMode: s.setThemeMode,
      setFontFamily: s.setFontFamily,
      setFontSize: s.setFontSize,
      setResponseLanguage: s.setResponseLanguage,
      setMemoryEnabled: s.setMemoryEnabled,
      clearMemories: s.clearMemories,
      setApprovalRequired: s.setApprovalRequired,
      setApprovalPolicies: s.setApprovalPolicies,
      setWebhookSettings: s.setWebhookSettings,
      resetWebhookSettings: s.resetWebhookSettings,
      setSchedulerSettings: s.setSchedulerSettings,
      setNotionSettings: s.setNotionSettings,
      resetNotionSettings: s.resetNotionSettings,
      setTriggers: s.setTriggers,
      setTriggersEnabled: s.setTriggersEnabled,
      setDebateEnabled: s.setDebateEnabled,
      clearDirectives: s.clearDirectives,
      clearMessages: s.clearMessages,
      clearTasks: s.clearTasks,
      resetProviderUsage: s.resetProviderUsage,
      setActiveView: s.setActiveView,
      setDailyTokenBudget: s.setDailyTokenBudget,
    }))
  )

  const [providerKeyStatus, setProviderKeyStatus] = useState<Record<ProviderId, boolean>>({
    anthropic: false,
    openai: false,
    gemini: false,
  })

  useEffect(() => {
    let cancelled = false

    void fetch('/api/provider-status', { headers: apiHeaders() })
      .then(async (response) => (
        response.ok ? await response.json() as { providers?: Record<ProviderId, boolean> } : null
      ))
      .then((data) => {
        if (!cancelled && data?.providers) {
          setProviderKeyStatus(data.providers)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const webhookUrlError = validateWebhookUrl(webhookSettings.url)
  const webhookReady = !webhookUrlError && webhookSettings.url.trim().length > 0
  const notionSessionReady = notionSettings.token.trim().length > 0 && notionSettings.databaseId.trim().length > 0
  const connectedProviderCount = (Object.values(providerKeyStatus) as boolean[]).filter(Boolean).length

  useEffect(() => {
    if (webhookSettings.enabled && webhookUrlError) {
      setWebhookSettings({ enabled: false })
    }
  }, [setWebhookSettings, webhookSettings.enabled, webhookUrlError])

  useEffect(() => {
    if (notionSettings.enabled && !notionSessionReady) {
      setNotionSettings({ enabled: false })
    }
  }, [notionSessionReady, notionSettings.enabled, setNotionSettings])

  const currentTab = TABS.find((tab) => tab.id === activeTab)!

  return (
    <section className="flex-1 overflow-y-auto bg-office-bg p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-office-active">설정</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">워크스페이스 설정</h2>
            <p className="mt-2 text-sm text-office-text/60">{currentTab.description}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveView('office')}
            title="설정을 닫고 AI 오피스 화면으로 돌아갑니다."
            className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            AI 오피스로 이동
          </button>
        </div>

        <QuickStatusPanel
          connectedProviderCount={connectedProviderCount}
          totalProviders={3}
          webhookEnabled={webhookSettings.enabled}
          webhookReady={webhookReady}
          notionEnabled={notionSettings.enabled}
          notionReady={notionSessionReady}
          schedulerEnabled={schedulerSettings.enabled}
          triggersEnabled={triggersEnabled}
          memoryEnabled={memoryEnabled}
        />

        <div className="flex gap-1 rounded-xl border border-office-panel/50 bg-office-sidebar p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.description}
              className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                activeTab === tab.id
                  ? 'bg-office-active/20 text-office-active'
                  : 'text-office-text/60 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'appearance' ? (
          <AppearanceSection
            themeMode={themeMode} setThemeMode={setThemeMode}
            fontFamily={fontFamily} setFontFamily={setFontFamily}
            fontSize={fontSize} setFontSize={setFontSize}
          />
        ) : null}

        {activeTab === 'ai' ? (
          <>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-office-text/40">AI 기본 동작</p>
              <p className="mb-4 text-xs text-office-text/50">
                AI가 업무를 처리하고 기억하는 방식과 승인 정책을 조정합니다.
              </p>
            </div>

            {/* 응답 언어 */}
            <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
              <p className="text-sm font-semibold text-white">응답 언어</p>
              <p className="mt-1 text-xs text-office-text/50">
                AI 에이전트가 답변할 때 사용할 언어를 고정합니다. 자동은 입력 언어를 따릅니다.
              </p>
              <div className="mt-4 flex gap-2">
                {(
                  [
                    { id: 'auto', label: '자동', desc: '입력 따라감' },
                    { id: 'ko',   label: '한국어',  desc: '항상 한국어' },
                    { id: 'en',   label: 'English', desc: 'Always English' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setResponseLanguage(opt.id)}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                      responseLanguage === opt.id
                        ? 'border-office-active bg-office-active/20 text-office-active'
                        : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
                    }`}
                  >
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className="text-[10px] opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <MemorySection
              memoryEnabled={memoryEnabled}
              memories={memories}
              setMemoryEnabled={setMemoryEnabled}
              clearMemories={clearMemories}
            />
            <ApprovalSection
              approvalRequired={approvalRequired}
              approvalPolicies={approvalPolicies}
              setApprovalRequired={setApprovalRequired}
              setApprovalPolicies={setApprovalPolicies}
            />
            <DirectivesSection directives={directives} clearDirectives={clearDirectives} />

            <div className="mt-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-office-text/40">토론 분석</p>
              <p className="mb-4 text-xs text-office-text/50">
                복잡한 업무를 다층 토론으로 처리합니다. 활성화 시 복잡도에 따라 부서 내부 토론 → 부서 간 종합 → 모델 토론(Claude·GPT·Gemini)을 자동 실행합니다.
              </p>
            </div>
            <div className="rounded-2xl border border-office-panel bg-office-sidebar p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">3레이어 토론 분석</p>
                  <p className="mt-1 text-xs text-office-text/50">
                    @간단 태그로 단순 처리, @심층 태그로 강제 복합 토론을 요청할 수 있습니다.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-office-panel/70 bg-office-panel/50 px-2.5 py-1 text-[11px] text-office-text/60">
                      간단 → 단일 실행
                    </span>
                    <span className="rounded-full border border-office-panel/70 bg-office-panel/50 px-2.5 py-1 text-[11px] text-office-text/60">
                      보통 → Claude·GPT 2자 토론
                    </span>
                    <span className="rounded-full border border-office-panel/70 bg-office-panel/50 px-2.5 py-1 text-[11px] text-office-text/60">
                      복합 → Claude·GPT·Gemini 3자 토론
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDebateEnabled(!debateEnabled)}
                  title={debateEnabled ? '토론 분석 비활성화' : '토론 분석 활성화'}
                  className={`mt-0.5 shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    debateEnabled
                      ? 'border-office-active/60 bg-office-active/20 text-office-active hover:bg-office-active/30'
                      : 'border-office-panel/70 bg-office-panel text-office-text/50 hover:border-office-active hover:text-white'
                  }`}
                >
                  {debateEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="mt-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-office-text/40">자동화</p>
              <p className="mb-4 text-xs text-office-text/50">
                조건 충족 시 다음 부서에 자동으로 업무를 전달하고, 정해진 시각에 자동 브리핑을 생성합니다.
              </p>
            </div>
            <TriggersSection
              triggers={triggers}
              triggersEnabled={triggersEnabled}
              setTriggers={setTriggers}
              setTriggersEnabled={setTriggersEnabled}
            />
            <SchedulerSection
              schedulerSettings={schedulerSettings}
              setSchedulerSettings={setSchedulerSettings}
            />
          </>
        ) : null}

        {activeTab === 'integrations' ? (
          <>
            <ApiKeysSection
              providerKeyStatus={providerKeyStatus}
              onStatusChange={setProviderKeyStatus}
            />
            <NotificationsSection
              webhookSettings={webhookSettings}
              webhookUrlError={webhookUrlError}
              setWebhookSettings={setWebhookSettings}
              resetWebhookSettings={resetWebhookSettings}
            />
            <NotionSection
              notionSettings={notionSettings}
              notionSessionReady={notionSessionReady}
              setNotionSettings={setNotionSettings}
              resetNotionSettings={resetNotionSettings}
            />
          </>
        ) : null}

        {activeTab === 'data' ? (
          <>
            <TokenUsageSection
              usageByProvider={usageByProvider}
              providerKeyStatus={providerKeyStatus}
              resetProviderUsage={resetProviderUsage}
              dailyTokenBudget={dailyTokenBudget}
              setDailyTokenBudget={setDailyTokenBudget}
            />
            <DataManagementSection
              clearMessages={clearMessages}
              clearTasks={clearTasks}
              resetWebhookSettings={resetWebhookSettings}
              resetNotionSettings={resetNotionSettings}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
