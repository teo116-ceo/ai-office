import { useRef, useState } from 'react'
import { SectionCard } from './SettingsPrimitives'
import { exportBackup, importBackup, sendBackupToServer } from '@/services/backupService'
import { apiHeaders } from '@/utils/apiHeaders'

interface Props {
  clearMessages: () => void
  clearTasks: () => void
  resetWebhookSettings: () => void
  resetNotionSettings: () => void
}

export default function DataManagementSection({ clearMessages, clearTasks, resetWebhookSettings, resetNotionSettings }: Props) {
  const [handoverDone, setHandoverDone] = useState(false)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function showMsg(ok: boolean, text: string) {
    setBackupMsg({ ok, text })
    setTimeout(() => setBackupMsg(null), 4000)
  }

  function handleExport() {
    try {
      exportBackup()
      showMsg(true, '백업 파일을 다운로드했습니다.')
    } catch (error) {
      showMsg(false, error instanceof Error ? error.message : '내보내기 실패')
    }
  }

  async function handleServerBackup() {
    const result = await sendBackupToServer()
    showMsg(result.ok, result.ok ? '서버에 백업을 저장했습니다.' : (result.error ?? '서버 백업 실패'))
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      await importBackup(file)
      showMsg(true, '복원이 완료되었습니다. 잠시 후 페이지를 새로고칩니다.')
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      showMsg(false, error instanceof Error ? error.message : '복원 실패')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <>
      <SectionCard
        title="데이터 백업 / 복원"
        description="대화, 업무, 메모리 등 현재 데이터를 저장하거나 불러옵니다. 자동 백업은 30분마다 서버에 저장됩니다."
      >
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            title="현재 데이터를 백업 파일로 내 컴퓨터에 저장합니다."
            className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            내 컴퓨터에 저장
          </button>
          <button
            type="button"
            onClick={() => { void handleServerBackup() }}
            title="현재 데이터를 서버에 즉시 저장합니다."
            className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            지금 서버에 저장
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title="저장된 백업 파일을 선택해 데이터를 복원합니다."
            className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-red-400/60 hover:text-red-300 disabled:opacity-50"
          >
            {importing ? '복원 중...' : '백업 파일로 복원'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={(event) => { void handleImport(event) }}
            className="hidden"
          />
        </div>

        {backupMsg ? (
          <div className={`rounded-lg px-3 py-2 text-xs ${
            backupMsg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {backupMsg.text}
          </div>
        ) : null}

        <p className="text-xs text-office-text/50">
          복원하면 현재 데이터가 백업 파일로 교체됩니다. 먼저 현재 데이터를 저장해 두는 것을 권장합니다.
        </p>
      </SectionCard>

      <SectionCard
        title="기록 정리"
        description="현재 세션에 쌓인 대화와 업무 기록을 개별적으로 정리합니다."
      >
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={clearMessages}
            title="저장된 대화 메시지를 모두 삭제합니다."
            className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            대화 비우기
          </button>
          <button
            type="button"
            onClick={clearTasks}
            title="현재 업무 목록과 기록을 모두 비웁니다."
            className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            업무 목록 비우기
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="인수인계 초기화"
        description="다른 사용자에게 넘기기 전에 개인 연동 정보와 기록을 한 번에 삭제합니다."
      >
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-office-text/60 space-y-1">
          <p className="font-semibold text-red-400">삭제되는 항목</p>
          <ul className="space-y-0.5 pl-1">
            <li>· Discord / Slack 웹훅 URL 및 부서별 채널</li>
            <li>· Notion 데이터베이스 ID 및 부서별 설정</li>
            <li>· Claude / OpenAI / Gemini API 키 (.env 포함)</li>
            <li>· 대화 기록 / 업무 기록</li>
          </ul>
          <p className="text-office-text/40 pt-1">에이전트 설정과 테마는 유지됩니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              resetWebhookSettings()
              resetNotionSettings()
              clearMessages()
              clearTasks()
              void fetch('/api/provider-keys', {
                method: 'DELETE',
                headers: apiHeaders(),
              })
              setHandoverDone(true)
              setTimeout(() => setHandoverDone(false), 4000)
            }}
            className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20"
          >
            인수인계 초기화 실행
          </button>
          {handoverDone && (
            <span className="text-sm text-emerald-400">삭제 완료되었습니다.</span>
          )}
        </div>
      </SectionCard>
    </>
  )
}
