import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, DepartmentId } from '@/types'
import { callLLM } from './multiProviderApi'
import { AGENT_PROMPTS, AGENT_GROUND_RULES } from './claudeApi'
import { buildWebhookSettings, sendWebhook, buildBriefingWebhookPayload, sendBrowserNotification } from './webhookService'

export interface SchedulerSettings {
  enabled: boolean
  hourUTC: number   // 0-23 (로컬 시간으로 변환해서 비교)
  minute: number    // 0-59
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null
let lastBriefingDate: string | null = null  // 'YYYY-MM-DD' 형식

const BRIEFING_DEPARTMENTS: DepartmentId[] = ['ceo', 'security', 'development', 'planning']

async function runDailyBriefing() {
  const store = useAgentStore.getState()
  const ceo = store.agents.find((a) => a.departmentId === 'ceo')
  if (!ceo) return

  store.updateAgentStatus(ceo.id, 'thinking', '일일 브리핑 준비 중...')

  const briefingParts: string[] = []

  // 각 부서에서 오늘의 점검 항목 수집
  for (const deptId of BRIEFING_DEPARTMENTS) {
    const agent = store.agents.find((a) => a.departmentId === deptId)
    if (!agent) continue

    try {
      const content = await callLLM({
        model: agent.model,
        maxTokens: 200,
        system: [
          AGENT_PROMPTS[deptId],
          AGENT_GROUND_RULES,
          '오늘 하루 시작 전, 담당 분야에서 먼저 점검해야 할 항목 2~3가지를 간단히 보고하세요.',
          '확정된 사실이 없으면 준비 체크리스트 형태로만 작성하세요.',
        ].join('\n\n'),
        messages: [{ role: 'user', content: `${DEPARTMENTS[deptId].name} 팀 오늘의 점검 포인트를 보고하세요.` }],
      })
      briefingParts.push(`[${DEPARTMENTS[deptId].name}]\n${content}`)
      store.updateAgentStatus(agent.id, 'idle')
    } catch (err) {
      console.error('[scheduler] 부서 브리핑 실패:', deptId, err)
      store.updateAgentStatus(agent.id, 'idle')
    }
  }

  if (briefingParts.length === 0) {
    store.updateAgentStatus(ceo.id, 'idle')
    return
  }

  // CEO가 종합
  try {
    const now = new Date()
    const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    const combined = briefingParts.join('\n\n')

    const summary = await callLLM({
      model: ceo.model,
      maxTokens: 400,
      system: [
        AGENT_PROMPTS['ceo'],
        AGENT_GROUND_RULES,
        '각 부서의 오늘 점검 포인트를 종합해 경영진 일일 브리핑 형태로 정리하세요.',
        '우선순위 순서로 간결하게 작성하고, 확정된 사실과 준비 항목을 구분하세요.',
      ].join('\n\n'),
      messages: [{
        role: 'user',
        content: `${dateStr} 일일 브리핑\n\n${combined}`,
      }],
    })

    const fullContent = `📋 ${dateStr} 일일 브리핑\n\n${summary}\n\n[부서별 상세]\n${combined}`

    store.addMessage({
      sender: ceo.id,
      senderName: `${ceo.name} (일일 브리핑)`,
      content: fullContent,
      type: 'system',
      departmentIds: BRIEFING_DEPARTMENTS,
    })
    store.updateAgentStatus(ceo.id, 'idle')

    // 웹훅 + 브라우저 알림
    const webhookSettings = buildWebhookSettings(store)
    if (webhookSettings.onDailyBriefing) {
      sendWebhook(webhookSettings, buildBriefingWebhookPayload(summary)).catch((err) => console.error('[scheduler] 브리핑 웹훅 실패:', err))
    }
    sendBrowserNotification('AI 오피스 일일 브리핑', summary.slice(0, 100))
  } catch (err) {
    console.error('[scheduler] CEO 브리핑 종합 실패:', err)
    store.updateAgentStatus(ceo.id, 'idle')
  }
}

function checkAndRunBriefing(settings: SchedulerSettings) {
  if (!settings.enabled) return

  const now = new Date()
  const todayKey = now.toISOString().slice(0, 10)
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  // 오늘 이미 실행했으면 스킵
  if (lastBriefingDate === todayKey) return

  // 설정 시간에 도달했는지 확인 (분 단위 오차 허용)
  if (currentHour === settings.hourUTC && currentMinute >= settings.minute && currentMinute < settings.minute + 2) {
    lastBriefingDate = todayKey
    runDailyBriefing().catch((err) => console.error('[scheduler] 브리핑 실행 실패:', err))
  }
}

export function startScheduler(settings: SchedulerSettings) {
  stopScheduler()
  if (!settings.enabled) return
  // 1분마다 시간 체크
  schedulerInterval = setInterval(() => {
    const store = useAgentStore.getState()
    const currentSettings = store.schedulerSettings
    checkAndRunBriefing(currentSettings)
  }, 60_000)
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}

// 즉시 브리핑 수동 실행
export function triggerBriefingNow() {
  lastBriefingDate = null  // 오늘치 리셋해서 재실행 허용
  runDailyBriefing().catch((err) => console.error('[scheduler] 수동 브리핑 실패:', err))
}
