import { useState } from 'react'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { DEPARTMENTS, WorkspaceView } from '@/types'
import { getAgentRoleCompactLabel } from '@/utils/agentRoleMeta'

const NAV_ITEMS = [
  { id: 'dashboard', label: '대시보드', icon: '📊', tooltip: '전체 현황과 최근 움직임을 확인합니다.' },
  { id: 'tasks', label: '작업 관리', icon: '📝', tooltip: '업무 목록과 진행 상태를 확인합니다.' },
  { id: 'chat', label: '팀 채팅', icon: '💬', tooltip: '부서와 팀의 최근 메시지를 확인합니다.' },
  { id: 'agents', label: '에이전트', icon: '🤖', tooltip: '에이전트 이름, 역할, 모델을 관리합니다.' },
  { id: 'files', label: '결과 파일', icon: '📁', tooltip: '에이전트가 만든 결과 파일을 확인합니다.' },
  { id: 'settings', label: '설정', icon: '⚙️', tooltip: '연동과 응답 설정을 관리합니다.' },
] satisfies Array<{ id: WorkspaceView; label: string; icon: string; tooltip: string }>

export default function Sidebar() {
  const { agents, selectedAgent, activeView, setSelectedAgent, setActiveView } = useAgentStore(
    useShallow((s) => ({
      agents: s.agents,
      selectedAgent: s.selectedAgent,
      activeView: s.activeView,
      setSelectedAgent: s.setSelectedAgent,
      setActiveView: s.setActiveView,
    }))
  )
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sidebar-collapsed', String(next))
      } catch (_e) { /* localStorage unavailable */ }
      return next
    })
  }

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-office-panel bg-office-sidebar transition-all duration-200 md:flex ${
        collapsed ? 'w-12' : 'w-56'
      }`}
    >
      <div className="flex items-center justify-between border-b border-office-panel p-3">
        {!collapsed ? (
          <img
            src="/logo.png"
            alt="지음과깃듬"
            className="h-6 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1) sepia(1) saturate(3) hue-rotate(140deg)' }}
          />
        ) : null}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? '사이드바 열기' : '사이드바 닫기'}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-office-text transition-colors hover:bg-office-panel/60 hover:text-white ${
            collapsed ? 'mx-auto' : 'ml-auto'
          }`}
          title={collapsed ? '사이드바를 열어 메뉴 이름까지 봅니다.' : '사이드바를 접어 작업 공간을 넓게 봅니다.'}
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>

      <nav className="border-b border-office-panel p-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.tooltip}
            onClick={() => setActiveView(item.id)}
            className={`w-full rounded px-2 py-2 text-sm transition-colors ${
              activeView === item.id
                ? 'bg-office-panel text-office-active'
                : 'text-office-text hover:bg-office-panel/50'
            } ${collapsed ? 'flex justify-center' : 'flex items-center gap-3'}`}
          >
            <span className="shrink-0 text-[11px] font-semibold tracking-wide">{item.icon}</span>
            {!collapsed ? <span>{item.label}</span> : null}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-2">
        {!collapsed ? (
          <p className="px-3 py-2 text-xs uppercase tracking-wider text-office-text/60">
            AI 에이전트
          </p>
        ) : null}
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            title={`${agent.name} (${getAgentRoleCompactLabel(agent)}) · ${DEPARTMENTS[agent.departmentId].name} 정보 보기`}
            onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
            className={`w-full rounded px-2 py-2 text-sm transition-colors ${
              selectedAgent === agent.id ? 'bg-office-panel' : 'hover:bg-office-panel/50'
            } ${collapsed ? 'flex justify-center' : 'flex items-center gap-2'}`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: agent.color }} />
            {!collapsed ? (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs text-office-text" title={agent.name}>{agent.name}</p>
                <p className="truncate text-[10px] text-office-text/50" title={agent.role}>{getAgentRoleCompactLabel(agent)}</p>
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </aside>
  )
}
