import { useAgentStore } from '@/store/agentStore'
import { fireWebhookAndNotion, fireTriggers } from './taskPostProcess'

export async function approveAndFinalize(taskId: string): Promise<void> {
  const store = useAgentStore.getState()
  store.approveTask(taskId)

  const task = store.tasks.find((t) => t.id === taskId)
  if (!task || !task.result) return

  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')

  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '대표'} (승인)`,
    content: `✅ "${task.title}" 작업이 승인되어 완료 처리되었습니다.`,
    type: 'system',
    taskId,
    departmentIds: task.assignedTo,
  })

  fireWebhookAndNotion(taskId, 'completed')
  fireTriggers(taskId, task.assignedTo, task.result, [])
}

export async function rejectAndNotify(taskId: string, reason?: string): Promise<void> {
  const store = useAgentStore.getState()
  store.rejectTask(taskId)

  const task = store.tasks.find((t) => t.id === taskId)
  if (!task) return

  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')
  const reasonText = reason?.trim()

  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '대표'} (거절)`,
    content: [
      `❌ "${task.title}" 작업이 거절되어 실패 처리되었습니다.`,
      reasonText ? `거절 사유: ${reasonText}` : '',
    ].filter(Boolean).join('\n'),
    type: 'system',
    taskId,
    departmentIds: task.assignedTo,
  })

  fireWebhookAndNotion(taskId, 'failed')
}
