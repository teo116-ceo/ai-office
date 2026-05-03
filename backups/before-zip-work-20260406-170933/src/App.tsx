import { Component, ReactNode, useEffect } from 'react'
import { startAgentBehavior, stopAgentBehavior } from '@/services/agentBehavior'
import { startScheduler, stopScheduler } from '@/services/schedulerService'
import { useAgentStore } from '@/store/agentStore'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import OfficeCanvas from '@/components/office/OfficeCanvas'
import FloorNav from '@/components/office/FloorNav'
import CommunicationPanel from '@/components/layout/CommunicationPanel'
import DashboardView from '@/components/views/DashboardView'
import TasksView from '@/components/views/TasksView'
import TeamChatView from '@/components/views/TeamChatView'
import SettingsView from '@/components/views/SettingsView'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message + '\n' + e.stack }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#ff4466', background: '#1a1a2e', minHeight: '100vh', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 13 }}>
          <b>React 에러 발생:</b>{'\n'}{this.state.error}
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { activeView, themeMode, autoBehaviorEnabled, schedulerSettings } = useAgentStore()

  useEffect(() => {
    if (autoBehaviorEnabled) {
      startAgentBehavior(45000)
      return () => stopAgentBehavior()
    }
    stopAgentBehavior()
    return undefined
  }, [autoBehaviorEnabled])

  useEffect(() => {
    startScheduler(schedulerSettings)
    return () => stopScheduler()
  }, [schedulerSettings.enabled, schedulerSettings.hourUTC, schedulerSettings.minute])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden bg-office-bg">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex flex-1 overflow-hidden">
            {activeView === 'office' ? (
              <>
                <OfficeCanvas />
                <FloorNav />
                <CommunicationPanel />
              </>
            ) : activeView === 'dashboard' ? (
              <DashboardView />
            ) : activeView === 'tasks' ? (
              <TasksView />
            ) : activeView === 'chat' ? (
              <TeamChatView />
            ) : (
              <SettingsView />
            )}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
