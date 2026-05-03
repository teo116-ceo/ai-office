import { useState } from 'react'
import type { NotionSettings } from '@/services/notionService'
import { testNotionConnection } from '@/services/notionService'
import { DEPARTMENTS, type DepartmentId } from '@/types'
import { SectionCard, OptionRow, ToggleButton } from './SettingsPrimitives'

const DEPT_LIST = Object.values(DEPARTMENTS) as Array<{ id: DepartmentId; name: string; color: string }>

interface Props {
  notionSettings: NotionSettings
  notionSessionReady: boolean
  setNotionSettings: (settings: Partial<NotionSettings>) => void
  resetNotionSettings: () => void
}

export default function NotionSection({ notionSettings, notionSessionReady, setNotionSettings, resetNotionSettings }: Props) {
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [showDeptDBs, setShowDeptDBs] = useState(false)

  const configuredDeptCount = Object.values(notionSettings.departmentDatabases ?? {}).filter(
    (id): id is string => Boolean(id?.trim()),
  ).length

  async function handleTest() {
    const msg = await testNotionConnection(notionSettings).catch(() => '연결 실패')
    setTestMsg(msg)
    setTimeout(() => setTestMsg(null), 4000)
  }

  const tooltip = (
    <div className="group relative">
      <span className="cursor-default select-none text-xs text-office-text/40 hover:text-office-text/70">❓</span>
      <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-office-panel/80 bg-office-sidebar p-3 text-xs text-office-text/80 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        <p className="font-semibold text-white">Notion에 저장되는 내용</p>
        <ul className="mt-2 space-y-1.5">
          <li className="flex gap-1.5"><span className="shrink-0 text-green-400">✅</span>업무가 완료되면 제목·담당 부서·결과 요약이 자동으로 페이지에 기록됩니다.</li>
          <li className="flex gap-1.5"><span className="shrink-0 text-red-400">❌</span>업무가 실패한 경우도 별도로 기록할 수 있습니다.</li>
          <li className="flex gap-1.5"><span className="shrink-0 text-office-active">🔗</span>부서별로 다른 데이터베이스에 저장할 수 있습니다.</li>
        </ul>
        <p className="mt-2 border-t border-office-panel/50 pt-2 text-office-text/50">Notion 설정 → 통합 메뉴에서 토큰을 발급받고, 저장할 데이터베이스를 해당 통합에 연결해야 합니다.</p>
      </div>
    </div>
  )

  return (
    <SectionCard
      title="Notion 연동"
      description="업무 완료 시 Notion 데이터베이스에 자동으로 페이지를 생성합니다."
      titleExtra={tooltip}
    >
      <div className="space-y-3 rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
        <OptionRow
          label="Notion 연동 활성화"
          description={notionSettings.enabled ? '완료된 업무를 Notion에 자동 저장합니다.' : '비활성화 상태입니다.'}
          actions={
            <div className="flex gap-2">
              <ToggleButton
                active={notionSettings.enabled}
                label="켜기"
                onClick={() => setNotionSettings({ enabled: true })}
                disabled={!notionSessionReady}
              />
              <ToggleButton
                active={!notionSettings.enabled}
                label="끄기"
                onClick={() => setNotionSettings({ enabled: false })}
              />
            </div>
          }
        />

        {!notionSessionReady ? (
          <p className="text-[11px] text-office-text/50">
            Notion 연동을 켜려면 아래 토큰과 데이터베이스 ID를 먼저 입력해야 합니다.
          </p>
        ) : null}

        <div>
          <p className="mb-1 text-xs text-office-text/60">
            Notion 연결 토큰 <span className="text-office-text/40">(ntn_ 또는 secret_으로 시작)</span>
          </p>
          <input
            type="password"
            value={notionSettings.token}
            onChange={(event) => setNotionSettings({ token: event.target.value })}
            placeholder="ntn_xxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/30 focus:border-office-active focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-office-text/50">
            Notion 설정의 통합 만들기에서 발급받을 수 있습니다. 보안을 위해 새로고침 후 다시 입력해야 합니다.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs text-office-text/60">
            기본 데이터베이스 ID <span className="text-office-text/40">(부서별 ID 미설정 시 공통으로 사용)</span>
          </p>
          <input
            type="text"
            value={notionSettings.databaseId}
            onChange={(event) => setNotionSettings({ databaseId: event.target.value })}
            placeholder="32자리 영문·숫자 (예: 02e94c44...)"
            className="w-full rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-office-text placeholder-office-text/30 focus:border-office-active focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-office-text/50">
            Notion에서 저장할 데이터베이스 페이지를 열고, 브라우저 주소창 URL의 마지막 경로를 확인하세요.
            <br />
            예: <span className="font-mono text-office-text/70">notion.so/내워크스페이스/<mark className="rounded bg-office-active/20 px-0.5 text-office-active">abc123...32자리</mark>?v=...</span>
            <br />
            <span className="text-office-text/40">하이픈 없이 영문·숫자 32자리만 복사해서 붙여넣으면 됩니다.</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {([
            { key: 'onTaskComplete', label: '완료 시 저장' },
            { key: 'onTaskFail', label: '실패 시 저장' },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-office-text">
              <input
                type="checkbox"
                checked={notionSettings[key]}
                onChange={(event) => setNotionSettings({ [key]: event.target.checked })}
                className="accent-office-active"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={!notionSessionReady}
            className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            연결 테스트
          </button>
          <button
            type="button"
            onClick={resetNotionSettings}
            className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
          >
            초기화
          </button>
          {testMsg ? (
            <span className={`text-sm ${testMsg.includes('성공') ? 'text-office-active' : 'text-red-400'}`}>
              {testMsg}
            </span>
          ) : null}
        </div>

        {/* 부서별 데이터베이스 설정 */}
        <div className="border-t border-office-panel/40 pt-3">
          <button
            type="button"
            onClick={() => setShowDeptDBs((v) => !v)}
            className="flex items-center gap-2 text-xs text-office-text/50 transition-colors hover:text-white"
          >
            <span>{showDeptDBs ? '▲' : '▼'}</span>
            <span>
              부서별 데이터베이스 설정
              {configuredDeptCount > 0
                ? ` · ${configuredDeptCount}개 부서 설정됨`
                : ' (선택 사항)'}
            </span>
          </button>
          <p className="mt-1 text-[11px] text-office-text/40">
            부서에 ID를 설정하면 해당 부서 업무 결과가 지정 데이터베이스에 저장됩니다. 설정 없는 부서는 기본 데이터베이스에 저장됩니다.
          </p>

          {showDeptDBs && (
            <div className="mt-3 space-y-2">
              {DEPT_LIST.map(({ id, name }) => (
                <div key={id} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-[11px] text-office-text/60">
                    {name}
                  </span>
                  <input
                    type="text"
                    value={notionSettings.departmentDatabases?.[id] ?? ''}
                    onChange={(event) =>
                      setNotionSettings({
                        departmentDatabases: {
                          ...notionSettings.departmentDatabases,
                          [id]: event.target.value,
                        },
                      })
                    }
                    placeholder="데이터베이스 ID (32자리)"
                    className="min-w-0 flex-1 rounded border border-office-panel/50 bg-office-panel px-2 py-1 text-xs text-office-text placeholder-office-text/25 focus:border-office-active focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
