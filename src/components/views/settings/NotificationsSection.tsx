import { useState } from 'react'
import type { WebhookSettings } from '@/services/webhookService'
import { requestNotificationPermission } from '@/services/webhookService'
import { apiHeaders } from '@/utils/apiHeaders'
import { DEPARTMENTS, type DepartmentId } from '@/types'
import { SectionCard, OptionRow } from './SettingsPrimitives'

const DEPT_LIST = Object.values(DEPARTMENTS) as Array<{ id: DepartmentId; name: string; color: string }>

interface Props {
  webhookSettings: WebhookSettings
  webhookUrlError: string | null
  setWebhookSettings: (settings: Partial<WebhookSettings>) => void
  resetWebhookSettings: () => void
}

export default function NotificationsSection({ webhookSettings, webhookUrlError, setWebhookSettings, resetWebhookSettings }: Props) {
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [showDeptWebhooks, setShowDeptWebhooks] = useState(false)
  const [deptTestState, setDeptTestState] = useState<Record<string, 'sending' | 'ok' | 'error'>>({})

  const configuredDeptCount = Object.values(webhookSettings.departmentWebhooks ?? {}).filter(
    (url): url is string => Boolean(url?.trim()),
  ).length

  async function handleDeptTest(deptId: DepartmentId, url: string) {
    setDeptTestState((prev) => ({ ...prev, [deptId]: 'sending' }))
    try {
      const isDiscord = url.includes('discord.com')
      const payload = isDiscord
        ? { content: `✅ [${DEPARTMENTS[deptId].name}] AI Office 연결 테스트 메시지입니다.` }
        : { text: `✅ [${DEPARTMENTS[deptId].name}] AI Office 연결 테스트 메시지입니다.` }

      const res = await fetch('/api/webhook-proxy', {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url, payload }),
      })
      setDeptTestState((prev) => ({ ...prev, [deptId]: res.ok ? 'ok' : 'error' }))
    } catch {
      setDeptTestState((prev) => ({ ...prev, [deptId]: 'error' }))
    }
    setTimeout(() => setDeptTestState((prev) => {
      const next = { ...prev }
      delete next[deptId]
      return next
    }), 3000)
  }

  async function handleWebhookTest() {
    if (webhookUrlError) {
      setTestMsg(webhookUrlError)
      return
    }

    try {
      const isDiscord = webhookSettings.url.includes('discord.com')
      const testPayload = isDiscord
        ? { content: '✅ AI Office 연결 테스트 메시지입니다.' }
        : { text: '✅ AI Office 연결 테스트 메시지입니다.' }

      const res = await fetch('/api/webhook-proxy', {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url: webhookSettings.url, payload: testPayload }),
      })
      const data = await res.json().catch(() => ({ error: '발송 실패' })) as { error?: string }
      setTestMsg(res.ok ? '발송 성공!' : (data.error ?? '발송 실패 — URL을 확인하세요.'))
    } catch {
      setTestMsg('발송 실패 — 서버 연결을 확인하세요.')
    }

    setTimeout(() => setTestMsg(null), 3000)
  }

  return (
    <SectionCard
      title="알림 설정"
      description="작업 완료·실패 알림을 브라우저 또는 Discord·Slack으로 보냅니다."
    >
      <OptionRow
        label="브라우저 알림"
        description={notifGranted ? '브라우저 알림 권한이 허용되어 있습니다.' : '권한을 허용하면 작업 완료 시 알림을 받을 수 있습니다.'}
        actions={
          notifGranted ? (
            <span className="rounded-full bg-office-active/20 px-3 py-1.5 text-sm text-office-active">허용됨</span>
          ) : (
            <button
              type="button"
              onClick={() => void requestNotificationPermission().then((ok) => setNotifGranted(ok))}
              className="rounded-full border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              권한 요청
            </button>
          )
        }
      />

      <div className="space-y-3 rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">외부 알림 연결</p>
            <div className="group relative">
              <span className="cursor-default select-none text-xs text-office-text/40 hover:text-office-text/70">❓</span>
              <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-office-panel/80 bg-office-sidebar p-3 text-xs text-office-text/80 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                <p className="font-semibold text-white">연결하면 이런 알림이 옵니다</p>
                <ul className="mt-2 space-y-1.5">
                  <li className="flex gap-1.5"><span className="shrink-0 text-green-400">✅</span>업무가 완료되면 결과 요약과 담당 부서를 전송합니다.</li>
                  <li className="flex gap-1.5"><span className="shrink-0 text-red-400">❌</span>업무가 실패하면 실패 내용을 즉시 알려줍니다.</li>
                  <li className="flex gap-1.5"><span className="shrink-0 text-office-active">📋</span>매일 정해진 시각에 당일 업무 현황 브리핑을 보냅니다.</li>
                </ul>
                <p className="mt-2 border-t border-office-panel/50 pt-2 text-office-text/50">Discord와 Slack 모두 지원합니다. 부서별로 채널을 따로 지정할 수도 있습니다.</p>
              </div>
            </div>
          </div>
          <p className="mt-1 text-xs text-office-text/60">
            Discord나 Slack의 알림 주소를 입력하면 작업 결과를 자동으로 전송합니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href="https://support.discord.com/hc/ko/articles/228383668"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-office-panel/70 bg-office-panel/60 px-2.5 py-1 text-[11px] text-office-text/70 transition-colors hover:border-office-active hover:text-white"
              title="Discord 웹훅 설정 방법 보기"
            >
              <span>Discord 연결 방법 ↗</span>
            </a>
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-office-panel/70 bg-office-panel/60 px-2.5 py-1 text-[11px] text-office-text/70 transition-colors hover:border-office-active hover:text-white"
              title="Slack 웹훅 설정 방법 보기"
            >
              <span>Slack 연결 방법 ↗</span>
            </a>
          </div>
        </div>
        <input
          type="url"
          value={webhookSettings.url}
          onChange={(event) => setWebhookSettings({ url: event.target.value })}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/30 focus:border-office-active focus:outline-none"
        />
        <p className={`text-[11px] ${webhookSettings.url.trim() && webhookUrlError ? 'text-red-400' : 'text-office-text/50'}`}>
          {webhookSettings.url.trim() && webhookUrlError
            ? webhookUrlError
            : 'Discord, Slack, 또는 보안 연결(https://)을 지원하는 주소를 입력하세요'}
        </p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { key: 'enabled', label: '웹훅 활성화', disabled: Boolean(webhookUrlError) },
              { key: 'onTaskComplete', label: '완료 시 전송', disabled: false },
              { key: 'onTaskFail', label: '실패 시 전송', disabled: false },
              { key: 'onDailyBriefing', label: '일일 브리핑 전송', disabled: false },
            ] as Array<{ key: keyof WebhookSettings & string; label: string; disabled: boolean }>
          ).map(({ key, label, disabled }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-office-text">
              <input
                type="checkbox"
                checked={Boolean(webhookSettings[key])}
                disabled={disabled}
                onChange={(event) => setWebhookSettings({ [key]: event.target.checked })}
                className="accent-office-active"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleWebhookTest()}
            className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            테스트 발송
          </button>
          <button
            type="button"
            onClick={resetWebhookSettings}
            className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
          >
            초기화
          </button>
          {testMsg ? <span className="text-sm text-office-active">{testMsg}</span> : null}
        </div>

        {/* 부서별 채널 설정 */}
        <div className="border-t border-office-panel/40 pt-3">
          <button
            type="button"
            onClick={() => setShowDeptWebhooks((v) => !v)}
            className="flex items-center gap-2 text-xs text-office-text/50 transition-colors hover:text-white"
          >
            <span>{showDeptWebhooks ? '▲' : '▼'}</span>
            <span>
              부서별 채널 설정
              {configuredDeptCount > 0
                ? ` · ${configuredDeptCount}개 부서 설정됨`
                : ' (선택 사항)'}
            </span>
          </button>
          <p className="mt-1 text-[11px] text-office-text/40">
            부서에 주소를 설정하면 해당 부서 업무 결과가 지정 채널로 전송됩니다. 설정 없는 부서는 기본 주소로 전송됩니다.
          </p>

          {showDeptWebhooks && (
            <div className="mt-3 space-y-2">
              {DEPT_LIST.map(({ id, name }) => {
                const deptUrl = webhookSettings.departmentWebhooks?.[id]?.trim() ?? ''
                const state = deptTestState[id]
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-[11px] text-office-text/60">
                      {name}
                    </span>
                    <input
                      type="url"
                      value={webhookSettings.departmentWebhooks?.[id] ?? ''}
                      onChange={(event) =>
                        setWebhookSettings({
                          departmentWebhooks: {
                            ...webhookSettings.departmentWebhooks,
                            [id]: event.target.value,
                          },
                        })
                      }
                      placeholder="https://discord.com/api/webhooks/..."
                      className="min-w-0 flex-1 rounded border border-office-panel/50 bg-office-panel px-2 py-1 text-xs text-office-text placeholder-office-text/25 focus:border-office-active focus:outline-none"
                    />
                    {deptUrl && (
                      <button
                        type="button"
                        disabled={state === 'sending'}
                        onClick={() => void handleDeptTest(id, deptUrl)}
                        title={`${name} 채널로 테스트 메시지 발송`}
                        className={`shrink-0 rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                          state === 'ok'
                            ? 'border-green-500/50 text-green-400'
                            : state === 'error'
                              ? 'border-red-400/50 text-red-400'
                              : 'border-office-panel/70 text-office-text/50 hover:border-office-active hover:text-white'
                        }`}
                      >
                        {state === 'sending' ? '…' : state === 'ok' ? '✓' : state === 'error' ? '✗' : '테스트'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
