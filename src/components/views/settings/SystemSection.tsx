import { useEffect, useState } from 'react'
import { SectionCard, OptionRow, ToggleButton } from './SettingsPrimitives'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron

export default function SystemSection() {
  const [loginItem, setLoginItemState] = useState(false)
  const [loginItemLoading, setLoginItemLoading] = useState(false)

  useEffect(() => {
    if (!isElectron) return
    void window.electronAPI!.getLoginItem().then(setLoginItemState)
  }, [])

  async function handleToggleLoginItem() {
    if (!isElectron) return
    setLoginItemLoading(true)
    const next = !loginItem
    await window.electronAPI!.setLoginItem(next)
    setLoginItemState(next)
    setLoginItemLoading(false)
  }

  return (
    <>
      <SectionCard
        title="시스템 트레이 상주"
        description="창을 닫아도 앱이 종료되지 않고 트레이에서 계속 실행됩니다. 더블클릭으로 창을 열고 닫을 수 있습니다."
      >
        <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4 text-sm text-office-text/80">
          <p className="font-semibold text-white mb-2">동작 방식</p>
          <ul className="space-y-1.5 text-xs text-office-text/60">
            <li>· 창 닫기 버튼 → 트레이로 최소화 (앱 계속 실행)</li>
            <li>· 트레이 아이콘 더블클릭 → 창 표시/숨김 전환</li>
            <li>· 트레이 우클릭 메뉴 → "종료" 선택 시 완전 종료</li>
          </ul>
        </div>
      </SectionCard>

      <SectionCard
        title="전역 단축키"
        description="앱이 백그라운드에 있어도 즉시 창을 열고 닫을 수 있습니다."
      >
        <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">창 열기 / 닫기</p>
              <p className="mt-1 text-xs text-office-text/60">
                다른 앱 작업 중에도 즉시 AI 오피스로 전환합니다
              </p>
            </div>
            <kbd className="rounded border border-office-panel bg-office-sidebar px-3 py-1.5 text-sm font-mono text-office-active">
              Ctrl + Alt + A
            </kbd>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="시작 시 자동 실행"
        description="Windows 로그인 시 AI 오피스를 자동으로 실행합니다. 트레이에서 조용히 대기합니다."
      >
        {isElectron ? (
          <OptionRow
            label="Windows 시작 시 자동 실행"
            description={loginItem ? '로그인 시 자동으로 트레이에서 시작합니다.' : '수동으로 앱을 실행해야 합니다.'}
            actions={
              <ToggleButton
                active={loginItem}
                label={loginItem ? '켜짐' : '꺼짐'}
                onClick={() => { void handleToggleLoginItem() }}
                disabled={loginItemLoading}
              />
            }
          />
        ) : (
          <p className="text-xs text-office-text/50">
            이 설정은 Electron 앱에서만 사용할 수 있습니다.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="태스크 완료 알림"
        description="AI 에이전트가 태스크를 완료하면 Windows 알림으로 알려줍니다."
      >
        <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4 text-xs text-office-text/60 space-y-1">
          <p>· 앱이 백그라운드에 있어도 알림이 표시됩니다.</p>
          <p>· Windows 알림 설정에서 AI 오피스가 허용되어 있어야 합니다.</p>
        </div>
      </SectionCard>
    </>
  )
}
