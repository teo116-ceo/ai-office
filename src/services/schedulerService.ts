import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, DepartmentId } from '@/types'
import { apiHeaders } from '@/utils/apiHeaders'

export interface SchedulerSettings {
  enabled: boolean
  hourUTC: number
  minute: number
}

const BRIEFING_DEPARTMENTS: DepartmentId[] = ['ceo', 'security', 'development', 'devops', 'qa', 'compliance', 'management']

function buildBriefingBody() {
  const store = useAgentStore.getState()
  const ceoAgent = store.agents.find((agent) => agent.departmentId === 'ceo')
  if (!ceoAgent) return null

  const departments = BRIEFING_DEPARTMENTS
    .filter((deptId) => deptId !== 'ceo')
    .map((deptId) => {
      const agent = store.agents.find((item) => item.departmentId === deptId)
      if (!agent) return null
      return {
        deptId,
        agentName: agent.name,
        agentRole: agent.role,
        model: agent.model,
        prompt: `${DEPARTMENTS[deptId].name} 팀은 오늘의 핵심 점검 사항을 짧게 보고하세요.`,
      }
    })
    .filter(Boolean)

  return {
    departments,
    ceo: { id: ceoAgent.id, name: ceoAgent.name, role: ceoAgent.role, model: ceoAgent.model },
    webhookUrl: store.webhookSettings.url,
    webhookEnabled: store.webhookSettings.enabled && store.webhookSettings.onDailyBriefing,
  }
}

export async function syncSchedulerToServer(settings: SchedulerSettings) {
  try {
    await fetch('/api/scheduler', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ enabled: settings.enabled, hour: settings.hourUTC, minute: settings.minute }),
    })
  } catch (err) {
    console.error('[schedulerService] 서버 동기화 실패:', err)
  }
}

export async function triggerBriefingNow() {
  const store = useAgentStore.getState()
  const ceoAgent = store.agents.find((agent) => agent.departmentId === 'ceo')
  const body = buildBriefingBody()
  if (!body || !ceoAgent) return

  store.updateAgentStatus(ceoAgent.id, 'thinking', '일일 브리핑을 준비하는 중...')

  try {
    const res = await fetch('/api/briefing/run', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })

    const data = await res.json() as { result?: string; error?: string }
    if (data.result) {
      store.addMessage({
        sender: ceoAgent.id,
        senderName: `${ceoAgent.name} (일일 브리핑)`,
        content: data.result,
        type: 'system',
        departmentIds: BRIEFING_DEPARTMENTS,
      })
    }
  } catch (err) {
    console.error('[schedulerService] 브리핑 실행 실패:', err)
  } finally {
    store.updateAgentStatus(ceoAgent.id, 'idle')
  }
}

export function startScheduler(settings: SchedulerSettings) {
  void syncSchedulerToServer(settings)
}

export function stopScheduler() {
  // 서버 사이드 스케줄러를 사용하므로 클라이언트에서 중지할 타이머가 없다.
}
