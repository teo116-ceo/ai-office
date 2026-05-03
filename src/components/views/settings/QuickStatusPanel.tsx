interface QuickStatusPanelProps {
  connectedProviderCount: number
  totalProviders: number
  webhookEnabled: boolean
  webhookReady: boolean
  notionEnabled: boolean
  notionReady: boolean
  schedulerEnabled: boolean
  triggersEnabled: boolean
  memoryEnabled: boolean
}

function StatusTile({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string
  value: string
  hint: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl border border-office-panel/70 bg-office-panel/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-office-text/45">{label}</p>
      <p className={`mt-3 text-lg font-semibold ${accent ? 'text-office-active' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs text-office-text/60">{hint}</p>
    </div>
  )
}

export default function QuickStatusPanel({
  connectedProviderCount,
  totalProviders,
  webhookEnabled,
  webhookReady,
  notionEnabled,
  notionReady,
  schedulerEnabled,
  triggersEnabled,
  memoryEnabled,
}: QuickStatusPanelProps) {
  const automationCount = [schedulerEnabled, triggersEnabled, memoryEnabled].filter(Boolean).length

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatusTile
        label="AI 서비스"
        value={`${connectedProviderCount}/${totalProviders}`}
        hint={connectedProviderCount === totalProviders ? '모든 AI 서비스 키가 준비됐습니다.' : '일부 AI 서비스만 연결된 상태입니다.'}
        accent={connectedProviderCount > 0}
      />
      <StatusTile
        label="알림 연동"
        value={webhookEnabled ? '활성' : webhookReady ? '준비됨' : '미설정'}
        hint={webhookReady ? '유효한 Discord/Slack webhook URL입니다.' : 'URL을 입력하면 알림을 활성화할 수 있습니다.'}
        accent={webhookEnabled}
      />
      <StatusTile
        label="Notion"
        value={notionEnabled ? '활성' : notionReady ? '준비됨' : '세션 필요'}
        hint={notionReady ? '토큰과 데이터베이스 ID가 현재 세션에 있습니다.' : '보안을 위해 토큰은 새로고침 후 다시 입력해야 합니다.'}
        accent={notionEnabled}
      />
      <StatusTile
        label="자동화"
        value={`${automationCount}/3`}
        hint={`메모리 ${memoryEnabled ? '켜짐' : '꺼짐'} · 자동 전달 ${triggersEnabled ? '켜짐' : '꺼짐'} · 브리핑 ${schedulerEnabled ? '켜짐' : '꺼짐'}`}
        accent={automationCount > 0}
      />
    </div>
  )
}
