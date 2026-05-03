import { useState } from 'react'
import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, WorkspaceView } from '@/types'

const NAV_ITEMS = [
  { id: 'dashboard', label: '대시보드', icon: '⊞' },
  { id: 'office', label: 'AI 오피스', icon: '⊟' },
  { id: 'tasks', label: '작업 관리', icon: '≡' },
  { id: 'chat', label: '팀 채팅', icon: '□' },
  { id: 'settings', label: '설정', icon: '⚙' },
] satisfies Array<{ id: WorkspaceView; label: string; icon: string }>

export default function Sidebar() {
  const { agents, selectedAgent, activeView, setSelectedAgent, setActiveView } = useAgentStore()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`bg-office-sidebar flex flex-col border-r border-office-panel shrink-0 transition-all duration-200 ${
        collapsed ? 'w-12' : 'w-56'
      }`}
    >
      {/* 로고 + 토글 버튼 */}
      <div className="p-3 border-b border-office-panel flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-office-active shrink-0" />
            <span className="text-sm font-semibold text-white truncate">TEoVerse</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-6 h-6 flex items-center justify-center rounded text-office-text hover:text-white hover:bg-office-panel/60 transition-colors shrink-0 ${collapsed ? 'mx-auto' : ''}`}
          title={collapsed ? '사이드바 열기' : '사이드바 접기'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="p-2 border-b border-office-panel">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            title={collapsed ? item.label : undefined}
            onClick={() => setActiveView(item.id)}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded text-sm transition-colors ${
              activeView === item.id
                ? 'bg-office-panel text-office-active'
                : 'text-office-text hover:bg-office-panel/50'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* AI 에이전트 목록 */}
      <div className="flex-1 overflow-y-auto p-2">
        {!collapsed && (
          <p className="text-xs text-office-text/60 px-3 py-2 uppercase tracking-wider">
            AI 에이전트
          </p>
        )}
        {agents.map((agent) => (
          <button
            key={agent.id}
            title={collapsed ? `${agent.name} · ${DEPARTMENTS[agent.departmentId].name}` : undefined}
            onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
            className={`w-full flex items-center px-2 py-2 rounded text-sm transition-colors ${
              selectedAgent === agent.id ? 'bg-office-panel' : 'hover:bg-office-panel/50'
            } ${collapsed ? 'justify-center' : 'gap-2'}`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: agent.color }}
            />
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-office-text truncate text-xs">{agent.name}</p>
                <p className="text-office-text/50 truncate" style={{ fontSize: '10px' }}>{agent.role}</p>
              </div>
            )}
          </button>
        ))}
      </div>
    </aside>
  )
}
