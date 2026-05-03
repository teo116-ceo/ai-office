import { Component, lazy, ReactNode, Suspense, useEffect, useRef, useState } from 'react'
import { startAmbientBehavior, stopAmbientBehavior } from '@/services/agentBehavior'
import { startScheduler, stopScheduler, syncSchedulerToServer } from '@/services/schedulerService'
import { connectSSE } from '@/services/sseService'
import { useAgentStore } from '@/store/agentStore'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import OfficeCanvas from '@/components/office/OfficeCanvas'
import FloorNav from '@/components/office/FloorNav'
import CommunicationPanel from '@/components/layout/CommunicationPanel'
import MobileTaskInputBar from '@/components/layout/MobileTaskInputBar'
import ToastContainer from '@/components/ui/ToastContainer'
import ApiKeySetup from '@/components/ui/ApiKeySetup'
import {
  startSession,
  validateExistingSession,
  isLoginRequired,
  registerSessionExpiredHandler,
} from '@/services/sessionService'
import type { WorkspaceView } from '@/types'
import { startAutoBackup, stopAutoBackup } from '@/services/backupService'
import { initServerSync } from '@/services/stateSync'
import { enableAutoButtonTitles } from '@/utils/autoButtonTitle'
import { apiHeaders } from '@/utils/apiHeaders'

const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

const DashboardView = lazy(() => import('@/components/views/DashboardView'))
const TasksView = lazy(() => import('@/components/views/TasksView'))
const TeamChatView = lazy(() => import('@/components/views/TeamChatView'))
const AgentsView = lazy(() => import('@/components/views/AgentsView'))
const FilesView = lazy(() => import('@/components/views/FilesView'))
const SettingsView = lazy(() => import('@/components/views/SettingsView'))

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error: `${error.message}\n${error.stack}` }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            color: '#ff4466',
            background: '#1a1a2e',
            minHeight: '100dvh',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            fontSize: 13,
          }}
        >
          <b>React 오류 발생:</b>
          {'\n'}
          {this.state.error}
        </div>
      )
    }

    return this.props.children
  }
}

type SessionState = 'loading' | 'login' | 'ready'
type ApiKeyState = 'checking' | 'needed' | 'done'

export default function App() {
  const [apiKeyState, setApiKeyState] = useState<ApiKeyState>('checking')
  const [sessionState, setSessionState] = useState<SessionState>('loading')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [remember, setRemember] = useState(true)
  const [rememberEmail, setRememberEmail] = useState(() => localStorage.getItem('ai-office-remember-email') === 'true')
  const [isCommunicationPanelOpen, setIsCommunicationPanelOpen] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const { activeView, themeMode, fontFamily, fontSize, schedulerSettings, setActiveView } = useAgentStore()

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setSessionExpired(true)
      setSessionState('login')
      setApiKeyState('checking')
    })

    void (async () => {
      const stillValid = await validateExistingSession()
      if (stillValid) {
        setSessionState('ready')
        return
      }

      const needsLogin = await isLoginRequired()
      setSessionState(needsLogin ? 'login' : 'ready')
    })()
  }, [])

  useEffect(() => {
    if (sessionState !== 'login') return
    const saved = localStorage.getItem('ai-office-remember-email') === 'true'
      ? localStorage.getItem('ai-office-last-email')
      : null
    if (saved && emailRef.current) emailRef.current.value = saved
  }, [sessionState])

  useEffect(() => {
    if (sessionState !== 'ready') return

    void (async () => {
      try {
        if (isElectron && window.electronAPI) {
          const has = await window.electronAPI.hasApiKeys()
          setApiKeyState(has ? 'done' : 'needed')
          return
        }

        const response = await fetch('/api/provider-status', {
          headers: apiHeaders(),
        })
        if (!response.ok) {
          setApiKeyState('needed')
          return
        }

        const data = await response.json() as {
          providers?: { anthropic?: boolean; openai?: boolean; gemini?: boolean }
        }
        const providers = data.providers
        const hasKey = Boolean(providers?.anthropic || providers?.openai || providers?.gemini)
        setApiKeyState(hasKey ? 'done' : 'needed')
      } catch {
        setApiKeyState('needed')
      }
    })()
  }, [sessionState])

  useEffect(() => enableAutoButtonTitles(), [])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    const email = emailRef.current?.value.trim() ?? ''
    const password = passwordRef.current?.value ?? ''
    if (!email || !password) return

    setLoginLoading(true)
    setLoginError(null)

    const result = await startSession(email, password, remember)
    if (result.ok) {
      const LAST_EMAIL_KEY = 'ai-office-last-email'
      const lastEmail = localStorage.getItem(LAST_EMAIL_KEY)
      if (lastEmail && lastEmail !== email.toLowerCase()) {
        const store = useAgentStore.getState()
        store.setWebhookSettings({ url: '', enabled: false, onTaskComplete: true, onTaskFail: false, onDailyBriefing: false, departmentWebhooks: {} })
        store.setNotionSettings({ token: '', databaseId: '', enabled: false, departmentDatabases: {}, onTaskComplete: true, onTaskFail: false })
      }
      localStorage.setItem(LAST_EMAIL_KEY, email.toLowerCase())
      if (rememberEmail) {
        localStorage.setItem('ai-office-remember-email', 'true')
      } else {
        localStorage.removeItem('ai-office-remember-email')
      }
      setSessionExpired(false)
      setSessionState('ready')
    } else {
      setLoginError(result.error ?? '로그인에 실패했습니다.')
    }

    setLoginLoading(false)
  }

  useEffect(() => {
    if (sessionState !== 'ready' || apiKeyState !== 'done') return
    setActiveView('dashboard')
  }, [sessionState, apiKeyState, setActiveView])

  useEffect(() => {
    if (sessionState !== 'ready' || apiKeyState !== 'done') return
    void initServerSync()
    startAmbientBehavior()
    startAutoBackup()
    return () => {
      stopAmbientBehavior()
      stopAutoBackup()
    }
  }, [sessionState, apiKeyState])

  useEffect(() => {
    if (sessionState !== 'ready' || apiKeyState !== 'done') return
    return connectSSE()
  }, [sessionState, apiKeyState])

  useEffect(() => {
    if (sessionState !== 'ready' || apiKeyState !== 'done') return
    startScheduler(schedulerSettings)
    return () => stopScheduler()
  }, [sessionState, apiKeyState, schedulerSettings])

  useEffect(() => {
    if (sessionState !== 'ready' || apiKeyState !== 'done') return
    void syncSchedulerToServer(schedulerSettings)
  }, [sessionState, apiKeyState, schedulerSettings])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  useEffect(() => {
    const fontMap: Record<string, string> = {
      'system':           "'Segoe UI', sans-serif",
      'noto-sans-kr':     "'Noto Sans KR', sans-serif",
      'ibm-plex-sans-kr': "'IBM Plex Sans KR', sans-serif",
      'gowun-dodum':      "'Gowun Dodum', sans-serif",
      'press-start-2p':   "'Press Start 2P', monospace",
    }
    document.body.style.fontFamily = fontMap[fontFamily] ?? fontMap['system']
  }, [fontFamily])

  useEffect(() => {
    const sizeMap: Record<string, string> = {
      small:  '13px',
      medium: '16px',
      large:  '18px',
      xlarge: '20px',
    }
    document.documentElement.style.fontSize = sizeMap[fontSize] ?? '16px'
  }, [fontSize])

  useEffect(() => {
    if (activeView === 'office') return
    setIsCommunicationPanelOpen(false)
  }, [activeView])

  useEffect(() => {
    if (!isCommunicationPanelOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCommunicationPanelOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCommunicationPanelOpen])

  if (sessionState === 'loading') {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#0d0d1a]">
        <div className="text-sm text-white/40">연결 중...</div>
      </div>
    )
  }

  if (sessionState === 'login') {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#0d0d1a]">
        <form
          onSubmit={(event) => { void handleLogin(event) }}
          className="flex w-80 flex-col gap-4 rounded-2xl border border-white/10 bg-[#141428] p-8"
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-white">AI 오피스</div>
            <div className="mt-1 text-xs text-white/40">
              {sessionExpired
                ? '세션이 만료되었습니다. 다시 로그인하세요.'
                : '이메일과 비밀번호를 입력하세요.'}
            </div>
          </div>

          {sessionExpired && (
            <div className="rounded-lg bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
              서버가 재시작되었거나 24시간이 지나 세션이 초기화되었습니다.
            </div>
          )}

          <input
            ref={emailRef}
            type="email"
            autoFocus
            placeholder="이메일"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30"
          />
          <input
            ref={passwordRef}
            type="password"
            placeholder="비밀번호"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30"
          />

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(event) => setRememberEmail(event.target.checked)}
                className="h-4 w-4 rounded accent-[#ff2d55]"
              />
              <span className="text-xs text-white/50">이메일 저장</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 rounded accent-[#ff2d55]"
              />
              <span className="text-xs text-white/50">로그인 유지 (브라우저를 닫아도 유지)</span>
            </label>
          </div>

          {loginError && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={loginLoading}
            className="rounded-lg bg-[#ff2d55] py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loginLoading ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    )
  }

  if (apiKeyState === 'checking') {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#0d0d1a]">
        <div className="text-sm text-white/40">API 키 상태 확인 중...</div>
      </div>
    )
  }

  if (apiKeyState === 'needed') {
    return <ApiKeySetup onSaved={() => setApiKeyState('done')} />
  }

  return (
    <ErrorBoundary>
      <div className="flex h-dvh w-screen overflow-hidden bg-office-bg">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex min-h-0 flex-1 overflow-hidden">
            {activeView === 'office' ? (
              <>
                {/* 데스크톱: 항상 나란히 */}
                <div className="hidden min-h-0 flex-1 overflow-hidden md:flex">
                  <OfficeCanvas
                    isCommunicationPanelOpen={isCommunicationPanelOpen}
                    onToggleCommunicationPanel={() => setIsCommunicationPanelOpen((current) => !current)}
                  />
                  <FloorNav />
                  {isCommunicationPanelOpen && (
                    <CommunicationPanel onClose={() => setIsCommunicationPanelOpen(false)} />
                  )}
                </div>
                {/* 모바일: 채팅창 닫힘 = 캔버스+층탐색 / 열림 = 층탐색+채팅 */}
                <div className="flex min-h-0 flex-1 overflow-hidden md:hidden">
                  {isCommunicationPanelOpen ? (
                    <>
                      <FloorNav />
                      <CommunicationPanel onClose={() => setIsCommunicationPanelOpen(false)} />
                    </>
                  ) : (
                    <>
                      <OfficeCanvas
                        isCommunicationPanelOpen={false}
                        onToggleCommunicationPanel={() => setIsCommunicationPanelOpen(true)}
                      />
                      <FloorNav />
                    </>
                  )}
                </div>
              </>
            ) : activeView === 'dashboard' ? (
              <Suspense fallback={<ViewLoadingState />}>
                <DashboardView />
              </Suspense>
            ) : activeView === 'tasks' ? (
              <Suspense fallback={<ViewLoadingState />}>
                <TasksView />
              </Suspense>
            ) : activeView === 'chat' ? (
              <Suspense fallback={<ViewLoadingState />}>
                <TeamChatView />
              </Suspense>
            ) : activeView === 'agents' ? (
              <Suspense fallback={<ViewLoadingState />}>
                <AgentsView />
              </Suspense>
            ) : activeView === 'files' ? (
              <Suspense fallback={<ViewLoadingState />}>
                <FilesView />
              </Suspense>
            ) : (
              <Suspense fallback={<ViewLoadingState />}>
                <SettingsView />
              </Suspense>
            )}
          </main>
          {/* 모바일 업무 입력 영역 */}
          <MobileTaskInputBar />
          {/* 모바일 하단 탭바 */}
          <MobileBottomNav activeView={activeView} setActiveView={setActiveView} />
        </div>
      </div>
      <ToastContainer />
    </ErrorBoundary>
  )
}

function ViewLoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center bg-office-bg px-6">
      <div className="rounded-2xl border border-office-panel/70 bg-office-sidebar/90 px-5 py-4 text-sm text-office-text/70">
        화면을 불러오는 중...
      </div>
    </div>
  )
}

const MOBILE_NAV = [
  { id: 'dashboard', label: '현황',     icon: '📊' },
  { id: 'office',    label: '오피스',   icon: '🏢' },
  { id: 'tasks',     label: '작업',     icon: '📋' },
  { id: 'chat',      label: '채팅',     icon: '💬' },
  { id: 'agents',    label: '에이전트', icon: '🤖' },
  { id: 'files',     label: '파일',     icon: '📁' },
] satisfies Array<{ id: WorkspaceView; label: string; icon: string }>

function MobileBottomNav({
  activeView,
  setActiveView,
}: {
  activeView: WorkspaceView
  setActiveView: (view: WorkspaceView) => void
}) {
  return (
    <nav className="md:hidden shrink-0 border-t border-office-panel bg-office-sidebar">
      <div className="flex items-stretch">
        {MOBILE_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveView(item.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${
              activeView === item.id
                ? 'text-office-active'
                : 'text-office-text/50 hover:text-office-text'
            }`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="text-[9px]">{item.label}</span>
            {activeView === item.id && (
              <span className="h-0.5 w-4 rounded-full bg-office-active" />
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
