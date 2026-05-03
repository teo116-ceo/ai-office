import { useAgentStore } from '@/store/agentStore'
import type { DepartmentId } from '@/types'
import { DEPARTMENTS } from '@/types'
import { evaluateApprovalReasons } from './approvalPolicy'
import { executeDepartmentTeam, type ChainResult } from './agentExecution'
import { buildChainContext } from './taskExecutionPrompts'
import { buildTriggeredTaskTitle } from '@/utils/taskTitle'

// 승인 트리거 평가 및 발사: 완료된 태스크 결과를 기반으로 조건에 맞는 트리거를 실행
export async function evaluateAndFireTriggers(
  originTaskId: string,
  completedDepts: DepartmentId[],
  taskResult: string,
  savedFiles: string[],
): Promise<void> {
  const store = useAgentStore.getState()
  if (!store.triggersEnabled) return

  const resultLower = taskResult.toLowerCase()
  const firedToDepts = new Set<string>()

  for (const trigger of store.triggers) {
    if (!trigger.enabled) continue
    if (!completedDepts.includes(trigger.fromDept)) continue

    // 조건 평가
    let matches = false
    if (trigger.condition === 'always') {
      matches = true
    } else if (trigger.condition === 'keywords' && trigger.keywords && trigger.keywords.length > 0) {
      matches = trigger.keywords.some((kw) => resultLower.includes(kw.toLowerCase()))
    } else if (trigger.condition === 'file_saved') {
      matches = savedFiles.length > 0
    }

    if (!matches) continue

    // 동일 대상 부서로 중복 트리거 방지
    const toDeptsKey = trigger.toDepts.sort().join(',')
    if (firedToDepts.has(toDeptsKey)) continue
    firedToDepts.add(toDeptsKey)

    // 트리거 메시지 구성
    const fileContext = savedFiles.length > 0
      ? `\n\n[참고 파일]\n${savedFiles.map((f) => `- ${f}`).join('\n')}`
      : ''
    const triggerMessage = `${trigger.messageTemplate}${fileContext}\n\n[원본 업무 결과 요약]\n${taskResult.slice(0, 500)}`

    const modeLabel = trigger.mode === 'review' ? '교차 검토' : '연쇄 태스크'
    store.addExecutionLog(
      'system',
      `자율 트리거 실행 (${modeLabel}): ${trigger.label}`,
      `→ ${trigger.toDepts.map((d) => store.agents.find((a) => a.departmentId === d)?.name ?? d).join(', ')}`,
    )

    await new Promise<void>((resolve) => setTimeout(resolve, 800))

    if (trigger.mode === 'review') {
      // 교차 검토 모드: 원본 태스크에 검토 코멘트 추가
      await runReviewTask(triggerMessage, trigger.toDepts, originTaskId, trigger.id)
    } else {
      // 기본 모드: 별도 연쇄 태스크 생성
      await runTriggeredTask(triggerMessage, trigger.toDepts, originTaskId)
    }
  }
}

// 교차 검토 모드: 지정 부서가 원본 결과를 검토하고 코멘트를 원본 태스크에 추가
export async function runReviewTask(
  reviewPrompt: string,
  reviewerDepts: DepartmentId[],
  originTaskId: string,
  triggerId: string,
): Promise<void> {
  const store = useAgentStore.getState()
  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')

  // 검토 시작 알림 메시지
  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '대표'} (교차 검토)`,
    content: `[교차 검토 시작] ${reviewerDepts.map((d) => DEPARTMENTS[d].name).join(', ')}이(가) 결과를 검토합니다.`,
    type: 'system',
    taskId: originTaskId,
    departmentIds: reviewerDepts,
  })

  for (const deptId of reviewerDepts) {
    const reviewAgent = store.agents.find((a) => a.departmentId === deptId)
    if (!reviewAgent) continue

    store.updateAgentStatus(reviewAgent.id, 'thinking', '교차 검토 중...')

    // originTaskId를 그대로 넘겨야 메시지가 실제 태스크에 연결됨
    const teamResult = await executeDepartmentTeam({
      deptId,
      executionPrompt: reviewPrompt,
      chainContext: '',
      taskId: originTaskId,
      hasAttachments: false,
      priorTaskFiles: [],
    })

    store.updateAgentStatus(reviewAgent.id, 'idle')

    if (teamResult.summary) {
      useAgentStore.getState().addTaskReview(originTaskId, {
        reviewerId: deptId,
        reviewerName: `${teamResult.summary.agent.name} / ${DEPARTMENTS[deptId].name}`,
        content: teamResult.summary.content,
        triggerId,
      })
    }
  }
}

// 연쇄 태스크 모드: 별도의 새 태스크를 생성해 대상 부서에 전달
export async function runTriggeredTask(
  message: string,
  targetDepts: DepartmentId[],
  triggeredBy: string,
): Promise<void> {
  const store = useAgentStore.getState()
  const taskId = crypto.randomUUID()
  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')
  const approvalReasons = evaluateApprovalReasons({
    userMessage: message,
    approvalRequired: store.approvalRequired,
    approvalPolicies: store.approvalPolicies,
  })

  store.addTask({
    id: taskId,
    title: buildTriggeredTaskTitle(message),
    description: message,
    assignedTo: targetDepts,
    status: 'in_progress',
    approvalReasons,
    triggeredBy,
  })

  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '임태오'} (자율 트리거)`,
    content: `[자동 트리거] ${targetDepts.map((d) => store.agents.find((a) => a.departmentId === d)?.name ?? d).join(', ')}에 연쇄 업무가 전달됩니다.`,
    type: 'system',
    taskId,
    departmentIds: targetDepts,
  })

  const chain: ChainResult[] = []
  const taskSavedFiles: string[] = []

  for (const deptId of targetDepts) {
    const teamResult = await executeDepartmentTeam({
      deptId,
      executionPrompt: message,
      chainContext: buildChainContext(chain),
      taskId,
      hasAttachments: false,
      priorTaskFiles: [...taskSavedFiles],
    })

    taskSavedFiles.push(...(teamResult.savedFiles ?? []))

    if (teamResult.summary) {
      chain.push({
        dept: deptId,
        agentName: `${teamResult.summary.agent.name} / 팀 종합`,
        content: teamResult.summary.content,
      })
    }
  }

  const succeeded = chain.length > 0
  const finalResult = succeeded ? chain.map((c) => c.content).join('\n\n---\n\n') : undefined
  const finalStatus = succeeded
    ? (store.approvalRequired || approvalReasons.length > 0 ? 'awaiting_approval' : 'completed')
    : 'failed'

  store.updateTask(taskId, {
    status: finalStatus,
    result: finalResult,
    approvalReasons,
  })

  if (finalStatus === 'awaiting_approval') {
    const pendingTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
    store.addToast('approval', pendingTask?.title ?? '업무 결과 검토 필요', '승인하면 외부 알림·저장·자동 후속이 실행됩니다.', undefined, taskId, approvalReasons)
  }
}
