import { useAgentStore } from '@/store/agentStore'
import { buildWebhookSettings, buildTaskWebhookPayload, sendWebhook, sendBrowserNotification } from './webhookService'
import { buildNotionSettings, createNotionPage } from './notionService'
import { evaluateAndFireTriggers } from './triggerEngine'
import { callLLM } from './multiProviderApi'
import type { Task, DepartmentId, TaskApprovalReason } from '@/types'
import { DEPARTMENTS } from '@/types'

type FinalStatus = Task['status']

export function fireApprovalToast(
  store: ReturnType<typeof useAgentStore.getState>,
  taskId: string,
  allApprovalReasons: TaskApprovalReason[],
) {
  const pendingTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
  store.addToast(
    'approval',
    pendingTask?.title ?? '업무 결과 검토 필요',
    '승인하면 외부 알림·저장·자동 후속이 실행됩니다.',
    undefined,
    taskId,
    allApprovalReasons,
  )
}

export function fireWebhookAndNotion(taskId: string, finalStatus: FinalStatus): void {
  const finalTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
  if (!finalTask) return

  const currentState = useAgentStore.getState()
  const isEffectivelyComplete = finalStatus === 'completed' || finalStatus === 'awaiting_approval'

  // 앱 내 토스트 알림 — 어떤 화면을 열어도 우측 하단에 뜸
  {
    const title = isEffectivelyComplete ? `✅ 완료: ${finalTask.title}` : `❌ 실패: ${finalTask.title}`
    const body = finalTask.result?.slice(0, 80) ?? ''
    useAgentStore.getState().addToast(
      isEffectivelyComplete ? 'success' : 'error',
      title,
      body || undefined,
      6000,
    )
  }

  const ws = buildWebhookSettings(currentState)
  const shouldNotify = isEffectivelyComplete ? ws.onTaskComplete : ws.onTaskFail
  if (shouldNotify) {
    sendWebhook(ws, buildTaskWebhookPayload(finalTask), finalTask.assignedTo).catch((err) => {
      console.error('[taskPostProcess] 웹훅 전송 실패:', err)
      useAgentStore.getState().addToast('error', '웹훅 전송 실패', err instanceof Error ? err.message : '설정 > 알림에서 URL을 확인하세요.', 5000)
    })
    sendBrowserNotification(
      isEffectivelyComplete ? `✅ 완료: ${finalTask.title}` : `❌ 실패: ${finalTask.title}`,
      finalTask.result?.slice(0, 80) ?? '',
    )
  }

  const ns = buildNotionSettings(currentState)
  const shouldNotion = isEffectivelyComplete ? ns.onTaskComplete : ns.onTaskFail
  if (ns.enabled && shouldNotion) {
    createNotionPage(finalTask, ns).catch((err) => {
      console.error('[taskPostProcess] Notion 전송 실패:', err)
      useAgentStore.getState().addToast('error', 'Notion 저장 실패', err instanceof Error ? err.message : '설정 > Notion에서 연결을 확인하세요.', 5000)
    })
  }
}

export function fireBriefingSummary(
  taskId: string,
  taskTitle: string,
  rawResult: string,
  assignedDepts: DepartmentId[],
  needsApproval: boolean,
): void {
  const store = useAgentStore.getState()
  const secAgent = store.agents.find((a) => a.id === 'ceo-sec')
  if (!secAgent) return

  const deptNames = assignedDepts.map((d) => DEPARTMENTS[d]?.name ?? d).join(', ')
  const approvalNote = needsApproval
    ? '\n이 업무는 대표 승인이 필요합니다. 판단 선택지와 추천안을 반드시 포함하세요.'
    : ''

  const systemPrompt =
    '당신은 강비서(CEO 직속 비서)입니다. ' +
    'AI 에이전트의 원문 보고서를 받아 대표가 읽어야 할 핵심만 추려 아래 형식으로 정리하세요. ' +
    '형식을 반드시 지키고 각 항목은 간결하게 작성하세요.'

  const userPrompt = [
    `[완료 업무] ${taskTitle}`,
    `[담당 부서] ${deptNames}`,
    approvalNote,
    '',
    '[원문 결과]',
    rawResult.slice(0, 2000) + (rawResult.length > 2000 ? '\n...(이하 생략)' : ''),
    '',
    '아래 형식으로 정리하세요:',
    '**완료:** [업무명]',
    '**핵심 결과** (3줄 이내):',
    '- ',
    '**즉시 실행 항목:** [있으면 1~2개, 없으면 "없음"]',
    needsApproval
      ? '**대표 판단 필요:**\n- A안: [내용] — [장단점]\n- B안: [내용] — [장단점]\n- 추천: [A안 또는 B안] — [이유 한 줄]'
      : '**대표 판단 필요:** 없음',
    '**리스크:** [있으면 한 줄, 없으면 생략]',
  ].filter(Boolean).join('\n')

  callLLM({
    model: secAgent.model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 600,
  }).then((summary) => {
    useAgentStore.getState().addMessage({
      sender: secAgent.id,
      senderName: `${secAgent.name} (비서 보고)`,
      content: summary,
      type: 'system',
      taskId,
      departmentIds: ['ceo'],
    })
  }).catch((err) => {
    console.warn('[fireBriefingSummary] 비서 요약 실패:', err)
  })
}

export function fireTriggers(
  taskId: string,
  assignedDepts: DepartmentId[],
  result: string,
  savedFiles: string[],
): void {
  evaluateAndFireTriggers(taskId, assignedDepts, result, savedFiles).catch((e: unknown) => {
    console.warn('[taskPostProcess] 트리거 평가 실패:', e)
    useAgentStore.getState().addToast('warn', '자율 트리거 실패', e instanceof Error ? e.message : '트리거 평가 중 오류 발생', 4000)
  })
}
