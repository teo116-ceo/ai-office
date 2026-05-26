import { Component, lazy, ReactNode, Suspense, useEffect, useRef, useState } from 'react'
import { startAmbientBehavior, stopAmbientBehavior } from '@/services/agentBehavior'
import { startScheduler, stopScheduler, syncSchedulerToServer } from '@/services/schedulerService'
import { connectSSE } from '@/services/sseService'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
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
import { registerUpdaterListeners } from '@/utils/updaterListeners'
import { UpdateBanner } from '@/components/ui/UpdateBanner'

const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

const DashboardView = lazy(() => import('@/components/views/DashboardView'))
const TasksView = lazy(() => import('@/components/views/TasksView'))
const TeamChatView = lazy(() => import('@/components/views/TeamChatView'))
const AgentsView = lazy(() => import('@/components/views/AgentsView'))
const FilesView = lazy(() => import('@/components/views/FilesView'))
const SettingsView = lazy(() => import('@/components/views/SettingsView'))
const ErrorLogView = lazy(() => import('@/components/views/ErrorLogView'))

class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      const isDev = import.meta.env.DEV
      return (
        <div
          style={{
            padding: 32,
            background: '#1a1a2e',
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <p style={{ color: '#ff4466', fontWeight: 700, fontSize: 16 }}>
            예기치 못한 오류가 발생했습니다
          </p>
          {isDev ? (
            <pre
              style={{
                color: '#ff8899',
                background: '#0d0d1a',
                padding: 16,
                borderRadius: 8,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                maxWidth: 720,
                width: '100%',
                overflowX: 'auto',
              }}
            >
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          ) : (
            <p style={{ color: '#aaa', fontSize: 13 }}>
              {this.state.error.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              background: '#0057ff',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
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
  const [rememberEmail, setRememberEmail] = useState(() => localStorage.getItem('ai-office-remember-email') === 'true')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const { activeView, themeMode, fontFamily, fontSize, schedulerSettings, setActiveView } = useAgentStore(
    useShallow((s) => ({
      activeView: s.activeView,
      themeMode: s.themeMode,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      schedulerSettings: s.schedulerSettings,
      setActiveView: s.setActiveView,
    }))
  )

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setSessionExpired(true)
      setSessionState('login')
      setApiKeyState('checking')
    })

    void (async () => {
      if (isElectron && window.electronAPI) {
        // API 키 저장 후 재시작 시 세션 토큰 복원 (로그인 화면 건너뜀)
        const relaunchToken = await window.electronAPI.getSessionForRelaunch()
        if (relaunchToken) {
          sessionStorage.setItem('ai-office-session-token', relaunchToken)
        }

        // 첫 설치 감지: API 키가 없으면 세션만 초기화 (작업 데이터는 유지)
        const has = await window.electronAPI.hasApiKeys()
        if (!has) {
          sessionStorage.clear()
        }
      }

      const stillValid = await validateExistingSession()
      if (stillValid) {
        setSessionState('ready')
        return
      }

      const needsLogin = await isLoginRequired()
      setSessionState(needsLogin ? 'login' : 'ready')
    })()
  }, [])
  // 이메일 저장 기능: API 키가 있는 기존 설치에서만 이메일 pre-fill
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
          if (!has) {
            // API 키가 없으면 무조건 입력 화면
            setApiKeyState('needed')
            return
          }
          // API 키가 있어도 설정 완료 마커가 없으면 입력 화면 표시
          // (이전 버전 잔류 데이터, 언인스톨 후 재설치 등 처리)
          const confirmed = await window.electronAPI.hasConfirmedSetup()
          setApiKeyState(confirmed ? 'done' : 'needed')
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

  useEffect(() => {
    if (isElectron) registerUpdaterListeners()
  }, [])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    const email = emailRef.current?.value.trim() ?? ''
    const password = passwordRef.current?.value ?? ''
    if (!email || !password) return

    setLoginLoading(true)
    setLoginError(null)

    const result = await startSession(email, password)
    if (result.ok) {
      // 이메일 저장 처리
      const LAST_EMAIL_KEY = 'ai-office-last-email'
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

          <label className="flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
              className="h-4 w-4 rounded accent-[#ff2d55]"
            />
            <span className="text-xs text-white/50">이메일 저장</span>
          </label>

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
    <ErrorBoundary resetKey={activeView}>
      <div className="flex h-dvh w-screen overflow-hidden bg-office-bg">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <UpdateBanner />
          <Header />
          <main className="flex min-h-0 flex-1 overflow-hidden">
            {activeView === 'dashboard' ? (
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
            ) : activeView === 'errors' ? (
              <Suspense fallback={<ViewLoadingState />}>
                <ErrorLogView />
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
    <nav className="md:hidden shrink-0 border-t border-office-panel bg-office-sidebar" aria-label="하단 탐색">
      <div className="flex items-stretch" role="tablist">
        {MOBILE_NAV.map((item) => {
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${item.label} 화면으로 이동`}
              onClick={() => setActiveView(item.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors ${
                isActive
                  ? 'text-office-active'
                  : 'text-office-text/50 hover:text-office-text'
              }`}
            >
              <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
              <span className="text-[9px]">{item.label}</span>
              {isActive && (
                <span className="h-0.5 w-4 rounded-full bg-office-active" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
