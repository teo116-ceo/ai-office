import { useAgentStore } from '@/store/agentStore'
import type { DepartmentId, UploadedFile } from '@/types'
import { DEPARTMENTS } from '@/types'
import {
  looksLikeContinuationRequest,
  findContinuationTargetTask,
  buildManualContinuationPrompt,
} from './continuationService'
import {
  routeByLLM,
  fireRelatedReactions,
} from './agentRouting'
import {
  applyDirective,
  buildDirectiveRegistrationMessage,
  clearDirectives,
  resolveDirectiveCommand,
  resolveDepartmentFloor,
  syncDirectiveAgentMessages,
} from './directives'
import { evaluateApprovalReasons } from './approvalPolicy'
import { extractAndSaveMemory, searchRelevantMemories, buildMemoryContext } from './memoryService'
import {
  buildCoordinatorMessage,
  resolveMeetingPlan,
} from './taskRouting'
import { evaluateOutputApprovalReasons } from './approvalPolicy'
import { buildTaskTitle } from '@/utils/taskTitle'
import { callLLM, beginTaskTokenTracking, finishTaskTokenTracking } from './multiProviderApi'
import {
  buildTaskPrompt,
  buildChainContext,
  uniqueDepartments,
} from './taskExecutionPrompts'
import {
  executeDepartmentTeam,
  buildThreadContext,
  type ChainResult,
} from './agentExecution'
import { fireApprovalToast, fireWebhookAndNotion, fireTriggers, fireBriefingSummary } from './taskPostProcess'

export { approveAndFinalize, rejectAndNotify } from './taskLifecycle'

const DEBATE_TAG = '@토론'
const DEBATE_PREFIX = '토론:'

// 특정 부서 채널에 직접 메시지를 보내고 해당 팀에게만 응답을 받는 함수
export async function runChannelMessage(
  deptId: DepartmentId,
  userMessage: string,
  attachments: UploadedFile[] = [],
): Promise<void> {
  const trimmed = userMessage.trim()
  if (trimmed.length === 0 && attachments.length === 0) return

  const store = useAgentStore.getState()
  const channelFloorId = resolveDepartmentFloor(deptId)
  const taskId = crypto.randomUUID()
  const continuationTarget = attachments.length === 0 && looksLikeContinuationRequest(trimmed)
    ? findContinuationTargetTask(deptId)
    : null
  const linkedThreadId = continuationTarget?.threadId ?? continuationTarget?.id
  const submittedContent = trimmed || '분석할 파일을 업로드했습니다.'

  store.addMessage({
    sender: 'user',
    senderName: '사용자',
    content: submittedContent,
    type: 'task',
    attachments,
    taskId,
    departmentIds: [deptId],
    channelFloorId,
  })

  const executionPrompt = continuationTarget
    ? buildManualContinuationPrompt(continuationTarget, trimmed)
    : buildTaskPrompt(trimmed, attachments, 'full')

  store.addTask({
    id: taskId,
    title: continuationTarget ? `이어서 진행: ${continuationTarget.title}` : buildTaskTitle(trimmed, attachments),
    description: executionPrompt,
    attachments,
    assignedTo: [deptId],
    status: 'in_progress',
    approvalReasons: [],
    threadId: linkedThreadId,
  })

  beginTaskTokenTracking(taskId)

  const approvalReasons = evaluateApprovalReasons({
    userMessage: trimmed,
    attachments,
    approvalRequired: store.approvalRequired,
    approvalPolicies: store.approvalPolicies,
  })

  store.updateTask(taskId, { approvalReasons })

  if (continuationTarget) {
    const continuationAgent = store.agents.find((agent) => agent.departmentId === deptId)
    if (!continuationAgent) {
      store.updateTask(taskId, { status: 'failed' })
      return
    }

    try {
      store.updateAgentStatus(continuationAgent.id, 'thinking', '이전 결과 이어쓰기 중...')
      const result = await callLLM({
        model: continuationAgent.model,
        system: [
          `${DEPARTMENTS[deptId].name} 담당자입니다.`,
          '이 요청은 새 업무 검토가 아니라 기존 답변의 이어쓰기입니다.',
          '이전 내용을 반복하지 말고 마지막 지점 다음부터 이어지는 본문만 작성하세요.',
        ].join('\n'),
        messages: [{ role: 'user', content: executionPrompt }],
        maxTokens: 8000,
      })

      store.addMessage({
        sender: continuationAgent.id,
        senderName: `${continuationAgent.name} (${DEPARTMENTS[deptId].name})`,
        content: `[이어쓰기 결과]\n${result}`,
        type: 'result',
        taskId,
        departmentIds: [deptId],
        channelFloorId,
      })

      const outputApprovalReasons = evaluateOutputApprovalReasons(result, store.approvalPolicies, approvalReasons)
      const allApprovalReasons = [...approvalReasons, ...outputApprovalReasons]
      const finalStatus = store.approvalRequired || allApprovalReasons.length > 0 ? 'awaiting_approval' : 'completed'

      const contTokenUsage = finishTaskTokenTracking(taskId) ?? undefined

      store.updateTask(taskId, {
        status: finalStatus,
        result,
        approvalReasons: allApprovalReasons,
        departmentResults: [{ deptId, agentName: continuationAgent.name, content: result }],
        tokenUsage: contTokenUsage,
      })

      if (finalStatus === 'awaiting_approval') {
        fireApprovalToast(store, taskId, allApprovalReasons)
      }

      fireWebhookAndNotion(taskId, finalStatus)
    } catch (error) {
      finishTaskTokenTracking(taskId)
      store.updateTask(taskId, { status: 'failed' })
      store.addToast('error', '이어쓰기 실패', error instanceof Error ? error.message : '이전 결과를 이어서 작성하지 못했습니다.', 5000)
    } finally {
      store.updateAgentStatus(continuationAgent.id, 'idle')
    }
    return
  }

  const teamResult = await executeDepartmentTeam({
    deptId,
    executionPrompt,
    chainContext: '',
    taskId,
    channelFloorId,
    hasAttachments: attachments.length > 0,
    priorTaskFiles: [],
  })

  const result = teamResult.summary?.content
  const { approvalRequired, approvalPolicies } = useAgentStore.getState()
  const outputApprovalReasons = result
    ? evaluateOutputApprovalReasons(result, approvalPolicies, approvalReasons)
    : []
  const allApprovalReasons = [...approvalReasons, ...outputApprovalReasons]

  const finalStatus = teamResult.summary
    ? (approvalRequired || allApprovalReasons.length > 0 ? 'awaiting_approval' : 'completed')
    : 'failed'

  const chanTokenUsage = finishTaskTokenTracking(taskId) ?? undefined

  store.updateTask(taskId, {
    status: finalStatus,
    result,
    approvalReasons: allApprovalReasons,
    tokenUsage: chanTokenUsage,
  })
  syncDirectiveAgentMessages()

  if (finalStatus === 'awaiting_approval') {
    fireApprovalToast(store, taskId, allApprovalReasons)
  }

  fireWebhookAndNotion(taskId, finalStatus)

  if (teamResult.summary && result) {
    fireTriggers(taskId, [deptId], result, teamResult.savedFiles ?? [])
  }

  if (teamResult.summary && result) {
    fireRelatedReactions(deptId, trimmed, result, channelFloorId, taskId).catch((e: unknown) => {
      console.warn('[agentOrchestrator] 관련 부서 반응 실패:', e)
    })
  }

  // 강비서 브리핑: 채널 메시지도 완료 시 CEO에게 핵심 요약 전달
  if (finalStatus !== 'failed' && result) {
    const chanTaskTitle = useAgentStore.getState().tasks.find((t) => t.id === taskId)?.title ?? trimmed.slice(0, 40)
    fireBriefingSummary(taskId, chanTaskTitle, result, [deptId], finalStatus === 'awaiting_approval')
  }
}

export async function runTask(
  userMessage: string,
  attachments: UploadedFile[] = [],
  threadId?: string,
  options?: { revisionOf?: string },
) {
  const trimmedMessage = userMessage.trim()
  if (trimmedMessage.length === 0 && attachments.length === 0) return

  const isExplicitDebate = trimmedMessage.includes(DEBATE_TAG) || trimmedMessage.toLowerCase().startsWith(DEBATE_PREFIX.toLowerCase())

  const { classifyComplexity } = await import('./taskComplexity')
  const complexity = isExplicitDebate ? ('complex' as const) : classifyComplexity(trimmedMessage)

  const { debateEnabled } = useAgentStore.getState()
  // 사용자가 @토론을 명시하면 debateEnabled 설정과 무관하게 토론 실행
  if ((debateEnabled || isExplicitDebate) && complexity !== 'simple') {
    const { runDeptInternalDebate, synthesizeDeptOpinions, runCrossDeptDebate } = await import('./debateService')
    const debateTaskId = crypto.randomUUID()
    const store0 = useAgentStore.getState()
    const ceo0 = store0.agents.find((a) => a.departmentId === 'ceo')
    const resolvedThreadId0: string | undefined = threadId ?? store0.activeThreadId ?? undefined

    store0.addMessage({
      sender: 'user',
      senderName: '사용자',
      content: trimmedMessage || '분석할 파일을 업로드했습니다.',
      type: 'task',
      attachments,
      taskId: debateTaskId,
      departmentIds: ['ceo'],
    })

    const debateApprovalReasons = evaluateApprovalReasons({
      userMessage: trimmedMessage,
      attachments,
      approvalRequired: store0.approvalRequired,
      approvalPolicies: store0.approvalPolicies,
    })

    store0.addTask({
      id: debateTaskId,
      title: buildTaskTitle(trimmedMessage, attachments),
      description: trimmedMessage,
      attachments,
      assignedTo: ['ceo'],
      status: 'in_progress',
      approvalReasons: debateApprovalReasons,
      threadId: resolvedThreadId0,
      revisionOf: options?.revisionOf,
    })
    beginTaskTokenTracking(debateTaskId)

    // ── Layer 1: 부서 라우팅 + 각 부서 내부 검토 ─────────────────────────────
    const routingTopic = buildTaskPrompt(trimmedMessage, attachments, 'summary')
    const assignedDepts0 = await routeByLLM(routingTopic)

    store0.updateTask(debateTaskId, { assignedTo: assignedDepts0 })

    store0.addMessage({
      sender: ceo0?.id ?? 'ceo-01',
      senderName: `${ceo0?.name ?? '대표'} (${ceo0?.role ?? 'CEO'})`,
      content: [
        `[${complexity === 'complex' ? '복합' : '중간'} 난이도] 부서 협업 검토를 시작합니다.`,
        `담당 부서: ${assignedDepts0.map((d) => DEPARTMENTS[d].name).join(' · ')}`,
        '1단계: 각 부서 내부 검토 → 2단계: 부서 간 상호 토론 → 3단계: 최종 결론',
        '각 팀원이 역할별로 의견을 내고, 팀장이 부서 입장을 정리합니다.',
      ].join('\n'),
      type: 'system',
      taskId: debateTaskId,
      departmentIds: ['ceo', ...assignedDepts0],
    })

    const deptOpinionResults = await Promise.all(
      assignedDepts0.map(async (dept) => {
        const content = await runDeptInternalDebate(dept, routingTopic)
        return content ? { dept, content } : null
      }),
    )
    const deptOpinions = deptOpinionResults.filter(
      (r): r is { dept: DepartmentId; content: string } => r !== null,
    )

    // ── Layer 2: 부서 간 쟁점 종합 (complex 전용) ────────────────────────────
    if (complexity === 'complex' && deptOpinions.length >= 2) {
      await synthesizeDeptOpinions(routingTopic, deptOpinions)
    }

    // ── Layer 3: 부서 간 상호 토론 — 실제 부원이 타 부서 의견에 반론 ──────────
    const debateResult = await runCrossDeptDebate(routingTopic, deptOpinions, debateTaskId)

    const debateFinalStatus = debateResult
      ? (store0.approvalRequired || debateApprovalReasons.length > 0 ? 'awaiting_approval' : 'completed')
      : 'failed'

    store0.updateTask(debateTaskId, {
      status: debateFinalStatus,
      result: debateResult ?? undefined,
      approvalReasons: debateApprovalReasons,
      departmentResults: deptOpinions.map(({ dept, content }) => ({
        deptId: dept,
        agentName: DEPARTMENTS[dept].name,
        content,
      })),
      tokenUsage: finishTaskTokenTracking(debateTaskId) ?? undefined,
    })

    if (debateFinalStatus === 'awaiting_approval') {
      fireApprovalToast(store0, debateTaskId, debateApprovalReasons)
    }

    fireWebhookAndNotion(debateTaskId, debateFinalStatus)

    if (debateResult) {
      fireTriggers(debateTaskId, assignedDepts0, debateResult, [])
      const debateTaskTitle = useAgentStore.getState().tasks.find((t) => t.id === debateTaskId)?.title ?? trimmedMessage.slice(0, 40)
      fireBriefingSummary(debateTaskId, debateTaskTitle, debateResult, assignedDepts0, debateFinalStatus === 'awaiting_approval')

      const debateCompletedTask = useAgentStore.getState().tasks.find((t) => t.id === debateTaskId)
      if (debateCompletedTask) {
        extractAndSaveMemory(debateCompletedTask).catch((err) => {
          console.warn('[agentOrchestrator] 토론 메모리 저장 실패:', err)
        })
      }
    }
    return
  }

  const store = useAgentStore.getState()
  const meetingPlan = resolveMeetingPlan(trimmedMessage, store.currentFloor)
  const directiveCommand = resolveDirectiveCommand(trimmedMessage, attachments, meetingPlan)
  const taskId = crypto.randomUUID()
  const submittedContent = trimmedMessage || '분석할 파일을 업로드했습니다.'
  const ceoAgent = store.agents.find((agent) => agent.departmentId === 'ceo')

  if (directiveCommand?.action === 'set' && directiveCommand.directive.channelFloorId) {
    store.setCurrentFloor(directiveCommand.directive.channelFloorId)
  } else if (meetingPlan) {
    store.setCurrentFloor(meetingPlan.channelFloorId)
  }

  // 라우팅 완료 전에도 CEO 채널에서 즉시 보이도록 departmentIds 선설정
  const initialDeptIds: DepartmentId[] =
    directiveCommand?.action === 'clear' ? directiveCommand.departmentIds
    : directiveCommand?.action === 'set' ? directiveCommand.directive.departmentIds
    : meetingPlan?.departmentIds ?? ['ceo']

  const userMessageId = store.addMessage({
    sender: 'user',
    senderName: '사용자',
    content: submittedContent,
    type: 'task',
    attachments,
    taskId,
    departmentIds: initialDeptIds,
    channelFloorId: directiveCommand?.action === 'clear'
      ? directiveCommand.channelFloorId
      : directiveCommand?.action === 'set'
        ? directiveCommand.directive.channelFloorId
        : meetingPlan?.channelFloorId,
  })

  if (directiveCommand?.action === 'clear') {
    store.updateMessage(userMessageId, {
      departmentIds: directiveCommand.departmentIds,
      channelFloorId: directiveCommand.channelFloorId,
    })

    clearDirectives(directiveCommand.kind)

    store.addMessage({
      sender: ceoAgent?.id ?? 'ceo-01',
      senderName: `${ceoAgent?.name ?? '대표'} (${ceoAgent?.role ?? '대표'})`,
      content: directiveCommand.feedback,
      type: 'system',
      departmentIds: directiveCommand.departmentIds,
      channelFloorId: directiveCommand.channelFloorId,
    })
    return
  }

  if (directiveCommand?.action === 'set') {
    applyDirective(directiveCommand.directive)

    store.updateMessage(userMessageId, {
      departmentIds: directiveCommand.directive.departmentIds,
      channelFloorId: directiveCommand.directive.channelFloorId,
    })

    store.addMessage({
      sender: ceoAgent?.id ?? 'ceo-01',
      senderName: `${ceoAgent?.name ?? '대표'} (${ceoAgent?.role ?? '대표'})`,
      content: buildDirectiveRegistrationMessage(directiveCommand.directive),
      type: 'system',
      departmentIds: directiveCommand.directive.departmentIds,
      channelFloorId: directiveCommand.directive.channelFloorId,
    })

    if (directiveCommand.skipExecution) {
      return
    }
  }

  const routingPrompt = buildTaskPrompt(trimmedMessage, attachments, 'summary')

  const { sessionContext, tasks: allTasks } = useAgentStore.getState()
  const resolvedThreadId: string | undefined = threadId ?? useAgentStore.getState().activeThreadId ?? undefined
  const threadContext = resolvedThreadId
    ? buildThreadContext(allTasks, resolvedThreadId)
    : sessionContext
  const baseExecutionPrompt = buildTaskPrompt(trimmedMessage, attachments, 'full', threadContext)
  const approvalReasons = evaluateApprovalReasons({
    userMessage: trimmedMessage,
    attachments,
    approvalRequired: store.approvalRequired,
    approvalPolicies: store.approvalPolicies,
  })

  const rootId = options?.revisionOf
  const revisionNumber = rootId
    ? store.tasks.filter((t) => (t.revisionOf ?? t.id) === rootId).length + 2
    : 1

  store.addTask({
    id: taskId,
    title: buildTaskTitle(trimmedMessage, attachments),
    description: baseExecutionPrompt,
    attachments,
    assignedTo: [],
    status: 'pending',
    approvalReasons,
    threadId: resolvedThreadId,
    revisionOf: rootId,
    revisionNumber,
  })

  beginTaskTokenTracking(taskId)

  // routeByLLM과 메모리 검색 병렬 실행
  const [assignedDepts, relevantMemories] = meetingPlan
    ? await Promise.all([
        Promise.resolve(meetingPlan.departmentIds),
        searchRelevantMemories(trimmedMessage, meetingPlan.departmentIds),
      ])
    : await (async () => {
        const depts = await routeByLLM(routingPrompt)
        const memories = await searchRelevantMemories(trimmedMessage, depts)
        return [depts, memories] as const
      })()
  const scopedDepartments = uniqueDepartments(['ceo', ...assignedDepts])
  const memoryContext = buildMemoryContext(relevantMemories)
  const executionPrompt = memoryContext
    ? `${baseExecutionPrompt}\n\n${memoryContext}`
    : baseExecutionPrompt

  store.updateMessage(userMessageId, {
    departmentIds: scopedDepartments,
    channelFloorId: meetingPlan?.channelFloorId,
  })

  const coordinatorLines = [buildCoordinatorMessage(assignedDepts, attachments.length, meetingPlan)]
  if (relevantMemories.length > 0) {
    coordinatorLines.push(
      `[메모리 참고] 과거 관련 업무 ${relevantMemories.length}건을 참고합니다: ${relevantMemories.map((m) => m.title).join(', ')}`,
    )
  }

  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '대표'} (${ceoAgent?.role ?? 'CEO (대표)'})`,
    content: coordinatorLines.join('\n'),
    type: 'system',
    taskId,
    departmentIds: scopedDepartments,
    channelFloorId: meetingPlan?.channelFloorId,
  })

  if (ceoAgent) {
    store.updateAgentStatus(ceoAgent.id, 'idle')
  }
  store.updateTask(taskId, { assignedTo: assignedDepts, status: 'in_progress' })

  const chain: ChainResult[] = []
  let interruptedByDirective = false
  const taskSavedFiles: string[] = []

  for (const deptId of assignedDepts) {
    const chainContext = buildChainContext(chain)
    const teamResult = await executeDepartmentTeam({
      deptId,
      executionPrompt,
      chainContext,
      taskId,
      channelFloorId: meetingPlan?.channelFloorId,
      hasAttachments: attachments.length > 0,
      priorTaskFiles: [...taskSavedFiles],
    })

    if (teamResult.interrupted) {
      interruptedByDirective = true
    }

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
  const finalResult = succeeded
    ? chain.map((item) => item.content).join('\n\n---\n\n')
    : interruptedByDirective
      ? '회의 지시가 우선 적용되어 기존 작업이 중단되었습니다.'
      : undefined

  const { approvalRequired, approvalPolicies } = useAgentStore.getState()
  const outputApprovalReasons = finalResult
    ? evaluateOutputApprovalReasons(finalResult, approvalPolicies, approvalReasons)
    : []
  const allApprovalReasons = [...approvalReasons, ...outputApprovalReasons]

  const finalStatus = succeeded
    ? (approvalRequired || allApprovalReasons.length > 0 ? 'awaiting_approval' : 'completed')
    : 'failed'

  store.updateTask(taskId, {
    status: finalStatus,
    result: finalResult,
    approvalReasons: allApprovalReasons,
    departmentResults: chain.map((c) => ({ deptId: c.dept, agentName: c.agentName, content: c.content })),
    tokenUsage: finishTaskTokenTracking(taskId) ?? undefined,
  })

  if (finalStatus === 'awaiting_approval') {
    fireApprovalToast(store, taskId, allApprovalReasons)
  }

  syncDirectiveAgentMessages()

  if (succeeded) {
    const completedTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
    if (completedTask) {
      extractAndSaveMemory(completedTask).catch((err) => {
        console.warn('[agentOrchestrator] 메모리 저장 실패:', err)
        useAgentStore.getState().addToast('warn', '메모리 저장 실패', err instanceof Error ? err.message : '재시도하거나 메모리를 비활성화하세요.', 5000)
      })

      const ctxLines = chain.slice(-2).map(
        (c) => `• ${DEPARTMENTS[c.dept].name}: ${c.content.slice(0, 300)}${c.content.length > 300 ? '\n...(이하 생략)' : ''}`,
      )
      if (ctxLines.length > 0) {
        useAgentStore.getState().setSessionContext(
          `이전 요청: "${completedTask.title}"\n${ctxLines.join('\n')}`,
        )
      }
    }
  }

  if (succeeded && finalResult) {
    fireTriggers(taskId, assignedDepts, finalResult, taskSavedFiles)
  }

  fireWebhookAndNotion(taskId, finalStatus)

  // 비서 AI 보고: 에이전트 원문 대신 핵심 요약을 CEO에게 전달
  if (succeeded && finalResult) {
    const completedTaskTitle = useAgentStore.getState().tasks.find((t) => t.id === taskId)?.title ?? ''
    fireBriefingSummary(taskId, completedTaskTitle, finalResult, assignedDepts, finalStatus === 'awaiting_approval')
  }
}

