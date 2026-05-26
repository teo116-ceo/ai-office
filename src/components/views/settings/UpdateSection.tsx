import { useEffect, useState } from 'react'
import { SectionCard } from './SettingsPrimitives'
import { useUpdateStore } from '@/hooks/useUpdater'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron

const STATUS_LABEL: Record<string, string> = {
  idle:       '–',
  checking:   '확인 중…',
  'up-to-date': '최신 버전입니다',
  available:  '다운로드 대기',
  downloading:'다운로드 중',
  downloaded: '재시작 대기',
  error:      '오류',
}

const STATUS_COLOR: Record<string, string> = {
  idle:         'text-office-text/40',
  checking:     'text-office-text/60',
  'up-to-date': 'text-emerald-400',
  available:    'text-office-active',
  downloading:  'text-office-active',
  downloaded:   'text-emerald-400',
  error:        'text-red-400',
}

export default function UpdateSection() {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [installing, setInstalling] = useState(false)

  const { status, info, progress, error, checkForUpdates, installUpdate } = useUpdateStore()

  useEffect(() => {
    if (!isElectron) return
    void window.electronAPI!.getAppVersion().then(setAppVersion)
  }, [])

  // 업데이트가 감지되면 릴리즈 노트 자동 펼치기
  useEffect(() => {
    if (status === 'available' || status === 'downloading' || status === 'downloaded') {
      setShowNotes(true)
    }
  }, [status])

  const handleInstall = async () => {
    setInstalling(true)
    await installUpdate()
  }

  const releaseNotes = info?.releaseNotes?.trim()
  const hasUpdate = ['available', 'downloading', 'downloaded'].includes(status)

  return (
    <SectionCard
      title="앱 업데이트"
      description="현재 버전을 확인하고 새 업데이트를 설치합니다."
    >
      {/* 버전 + 상태 행 */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-office-text/50">현재 버전</p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {appVersion ? `v${appVersion}` : '–'}
            </p>
          </div>
          {info?.version && (
            <>
              <span className="text-office-text/20">→</span>
              <div>
                <p className="text-xs text-office-text/50">새 버전</p>
                <p className="mt-0.5 text-sm font-semibold text-office-active">v{info.version}</p>
              </div>
            </>
          )}
        </div>
        <span className={`text-xs font-semibold ${STATUS_COLOR[status] ?? 'text-office-text/40'}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* 다운로드 진행 바 */}
      {status === 'downloading' && (
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-xs text-office-text/50">
            <span>다운로드 중…</span>
            <span className="tabular-nums text-office-active">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-office-panel/60">
            <div
              className="h-full rounded-full bg-office-active transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 오류 메시지 — 핵심만 한 줄로 */}
      {status === 'error' && error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-semibold text-red-400">업데이트 확인 실패</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-red-300/70">
            {error.split('\n')[0]}
          </p>
        </div>
      )}

      {/* 업데이트 내용 (릴리즈 노트) — 업데이트 있으면 자동 표시 */}
      {releaseNotes && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="flex w-full items-center justify-between rounded-t-xl border border-office-panel/70 bg-office-panel/50 px-4 py-2.5 text-left transition-colors hover:bg-office-panel/70"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-office-text/80">업데이트 내용</span>
              {info?.version && (
                <span className="rounded-full bg-office-active/20 px-1.5 py-0.5 text-[10px] font-medium text-office-active">
                  v{info.version}
                </span>
              )}
              {info?.releaseDate && (
                <span className="text-[10px] text-office-text/40">
                  {new Date(info.releaseDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                </span>
              )}
            </div>
            <span className="text-[10px] text-office-text/40">{showNotes ? '▲ 접기' : '▼ 펼치기'}</span>
          </button>
          {showNotes && (
            <div className="max-h-48 overflow-y-auto rounded-b-xl border border-t-0 border-office-panel/70 bg-office-panel/20 px-4 py-3">
              <pre className="whitespace-pre-wrap font-inherit text-xs leading-relaxed text-office-text/75">
                {releaseNotes}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 업데이트 없고 릴리즈 노트도 없을 때 빈 안내 */}
      {!releaseNotes && !hasUpdate && status !== 'error' && (
        <div className="mt-3 rounded-xl border border-dashed border-office-panel/50 px-4 py-3 text-center">
          <p className="text-xs text-office-text/30">업데이트 확인 후 변경 내용이 여기에 표시됩니다.</p>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {isElectron && status !== 'downloading' && status !== 'downloaded' && (
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={status === 'checking'}
            className="rounded-lg border border-office-panel/70 bg-office-panel px-3 py-1.5 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-50"
          >
            {status === 'checking' ? '확인 중…' : '업데이트 확인'}
          </button>
        )}
        {status === 'downloaded' && (
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing}
            className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {installing ? '재시작 중…' : '지금 재시작하여 설치'}
          </button>
        )}
      </div>

      {!isElectron && (
        <p className="mt-3 text-xs text-office-text/40">
          자동 업데이트는 Electron 앱에서만 사용할 수 있습니다.
        </p>
      )}
    </SectionCard>
  )
}
