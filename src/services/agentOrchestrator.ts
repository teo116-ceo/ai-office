import { useAgentStore } from '@/store/agentStore'
import type { DepartmentId, UploadedFile } from '@/types'
import { DEPARTMENTS } from '@/types'
import {
  applyDirective,
  buildDirectiveRegistrationMessage,
  clearDirectives,
  resolveDirectiveCommand,
  resolveDepartmentFloor,
  syncDirectiveAgentMessages,
} from './directives'
import {
  buildWebhookSettings,
  buildTaskWebhookPayload,
  sendWebhook,
  sendBrowserNotification,
} from './webhookService'
import { buildNotionSettings, createNotionPage } from './notionService'
import { evaluateApprovalReasons } from './approvalPolicy'
import { extractAndSaveMemory, searchRelevantMemories, buildMemoryContext } from './memoryService'
import {
  buildCoordinatorMessage,
  resolveByKeyword,
  resolveMeetingPlan,
} from './taskRouting'
import { evaluateOutputApprovalReasons } from './approvalPolicy'
import { buildTaskTitle } from '@/utils/taskTitle'
import { callLLM } from './multiProviderApi'
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
import { evaluateAndFireTriggers } from './triggerEngine'

const DEBATE_TAG = '@토론'
const DEBATE_PREFIX = '토론:'

// CEO LLM 라우팅: 사용자 메시지를 분석해 담당 부서 목록 반환
async function routeByLLM(message: string): Promise<DepartmentId[]> {
  const store = useAgentStore.getState()
  const ceoAgent = store.agents.find((agent) => agent.departmentId === 'ceo')

  if (ceoAgent) {
    store.updateAgentStatus(ceoAgent.id, 'thinking', '요청을 분석해 담당 부서를 정하는 중...')
  }

  try {
    const deptDescriptions = [
      'ceo: 대표/총괄·우선순위·최종 통합·의사결정',
      'executive: 전략/비서·대표 일정·미팅·사업 포트폴리오',
      'security: R&D 관리·ICRU 기질진단·조직 진단·창업자 진단·문항/척도',
      'compliance: 데이터 관리·진단 결과·통계·리포트 자동화·기관 결과보고',
      'management: 경영지원·회계·매출/비용·세무·행정·계약',
      'development: 자동화개발·리포트 자동화·데이터 파이프라인·내부 도구·API',
      'qa: 오류대응/검증·진단 오류·재현·분류·해결 트래킹',
      'devops: 운영자동화·기관 라이선스·백업·권한·알림·운영 프로세스',
      'planning: 제품기획·개인/기관/조직/창업자 진단·로드맵·상용화',
      'support: 교육운영·전문 강사·강의 이력·자격증·자격 시험',
      'sales: 세일즈·리드·기관 라이선스·계약·제안서·파이프라인',
      'presales: 리서치/인사이트·HR·창업·AI·경제/시사 트렌드',
      'marketing: 마케팅·콘텐츠·캠페인·타겟 분석·브랜드·홍보',
    ].join('\n')

    const raw = await callLLM({
      model: ceoAgent?.model ?? 'claude-opus-4-6',
      maxTokens: 128,
      system: [
        '당신은 AI 오피스의 업무 라우팅 담당입니다.',
        '사용자 요청을 처리할 부서 ID를 JSON 배열로만 반환하세요. 설명 없이 배열만 출력합니다.',
        '각 부서 역할:\n' + deptDescriptions,
        '규칙: 요청과 직접 관련된 부서만 선택. 관련 없는 부서는 포함하지 마세요.',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: `다음 요청을 처리할 부서를 선택하세요.\n\n${message}`,
      }],
    })

    const match = raw.match(/\[[\s\S]*?\]/)
    if (match) {
      const parsed: unknown = JSON.parse(match[0])
      // 유효한 DepartmentId 값만 필터링해 타입 안전성 보장
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validDeptIds = new Set(Object.keys(DEPARTMENTS))
        const filtered = parsed.filter(
          (item): item is DepartmentId => typeof item === 'string' && validDeptIds.has(item)
        )
        if (filtered.length > 0) return filtered
      }
    }
  } catch {
    // 아래 키워드 라우팅으로 대체
  }

  return resolveByKeyword(message)
}

// 승인: 완료 처리 + Webhook/Notion/트리거/알림 실행
export async function approveAndFinalize(taskId: string): Promise<void> {
  const store = useAgentStore.getState()
  store.approveTask(taskId)

  const task = store.tasks.find((t) => t.id === taskId)
  if (!task || !task.result) return

  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')

  // 승인 완료 메시지를 담당 부서 채널에 게시
  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '임태오'} (승인)`,
    content: `✅ "${task.title}" 작업이 승인되어 완료 처리되었습니다.`,
    type: 'system',
    taskId,
    departmentIds: task.assignedTo,
  })

  // 웹훅 + 브라우저 알림
  const ws = buildWebhookSettings(store)
  if (ws.onTaskComplete) {
    sendWebhook(ws, buildTaskWebhookPayload(task), task.assignedTo).catch((err) => {
      console.error('[agentOrchestrator] 승인 웹훅 전송 실패:', err)
      useAgentStore.getState().addToast('error', '웹훅 전송 실패', err instanceof Error ? err.message : '설정 > 알림에서 URL을 확인하세요.', 5000)
    })
    sendBrowserNotification(`✅ 승인 완료: ${task.title}`, task.result?.slice(0, 80) ?? '')
  }

  // Notion 저장
  const ns = buildNotionSettings(store)
  if (ns.enabled && ns.onTaskComplete) {
    createNotionPage(task, ns).catch((err) => {
      console.error('[agentOrchestrator] Notion 전송 실패:', err)
      useAgentStore.getState().addToast('error', 'Notion 저장 실패', err instanceof Error ? err.message : '설정 > Notion에서 연결을 확인하세요.', 5000)
    })
  }

  // 자율 트리거 평가 (승인 후 다음 부서 연쇄 실행)
  evaluateAndFireTriggers(taskId, task.assignedTo, task.result, []).catch((e: unknown) => {
    console.warn('[agentOrchestrator] 승인 후 트리거 평가 실패:', e)
  })
}

// 거절: 실패 처리 + 담당 부서 채널에 거절 사유 전달
export async function rejectAndNotify(taskId: string, reason?: string): Promise<void> {
  const store = useAgentStore.getState()
  store.rejectTask(taskId)

  const task = store.tasks.find((t) => t.id === taskId)
  if (!task) return

  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')
  const reasonText = reason?.trim()

  // 거절 메시지를 담당 부서 채널에 게시
  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '임태오'} (거절)`,
    content: [
      `❌ "${task.title}" 작업이 거절되어 실패 처리되었습니다.`,
      reasonText ? `거절 사유: ${reasonText}` : '',
    ].filter(Boolean).join('\n'),
    type: 'system',
    taskId,
    departmentIds: task.assignedTo,
  })

  // 웹훅 + 브라우저 알림
  const ws = buildWebhookSettings(store)
  if (ws.onTaskFail) {
    sendWebhook(ws, buildTaskWebhookPayload(task), task.assignedTo).catch((err) => {
      console.error('[agentOrchestrator] 거절 웹훅 전송 실패:', err)
    })
    sendBrowserNotification(`❌ 거절: ${task.title}`, reasonText ?? '사용자가 거절했습니다.')
  }

  // Notion 실패 기록
  const ns = buildNotionSettings(store)
  if (ns.enabled && ns.onTaskFail) {
    createNotionPage(task, ns).catch((err) => {
      console.error('[agentOrchestrator] Notion 실패 기록 전송 실패:', err)
    })
  }
}

// ── 부서별 관련 부서 맵 ────────────────────────────────────────────────────────
const RELATED_DEPTS: Partial<Record<DepartmentId, DepartmentId[]>> = {
  sales:       ['legal', 'finance'],
  b2g:         ['legal', 'compliance'],
  expertsales: ['sales', 'support'],
  global:      ['sales', 'legal'],
  marketing:   ['planning', 'sales'],
  presales:    ['sales', 'hr'],
  trend:       ['marketing', 'planning'],
  development: ['qa', 'devops'],
  qa:          ['development', 'devops'],
  devops:      ['development', 'qa'],
  security:    ['compliance', 'development'],
  planning:    ['development', 'sales'],
  compliance:  ['legal', 'development'],
  finance:     ['management', 'legal'],
  hr:          ['management', 'legal'],
  legal:       ['management', 'compliance'],
  management:  ['finance', 'hr'],
  support:     ['customer', 'hr'],
  customer:    ['support', 'sales'],
  ceo:         [],
  executive:   [],
}

/**
 * 관련 부서가 팀 채널에 짧게 반응하도록 비동기 트리거
 * - 주담당 부서 응답 후 1~2개 관련 부서가 자신의 관점에서 2~3문장 코멘트
 * - 같은 채널(channelFloorId)에 메시지를 남김
 */
async function fireRelatedReactions(
  mainDeptId: DepartmentId,
  userMessage: string,
  mainResult: string,
  channelFloorId: import('@/types').FloorId,
  taskId: string,
): Promise<void> {
  const related = (RELATED_DEPTS[mainDeptId] ?? []).slice(0, 2)
  if (related.length === 0) return

  const store = useAgentStore.getState()

  for (const relDeptId of related) {
    // 약간의 텀을 두어 자연스럽게 순차 등장
    await new Promise((r) => setTimeout(r, 1200))

    const relAgent = store.agents.find((a) => a.departmentId === relDeptId)
    if (!relAgent) continue

    const dept = DEPARTMENTS[relDeptId]
    const systemPrompt = `당신은 주식회사 지음과깃듬 ${dept.name}의 ${relAgent.name}입니다.
팀 채팅에서 동료 부서의 업무 결과를 보고 당신의 전문 영역 관점에서 짧게 코멘트합니다.
- 반드시 2~3문장 이내
- 구어체, 자연스러운 직장 동료 말투
- 불필요한 인사말 없이 바로 핵심만
- 필요하면 협조 요청이나 추가 확인 사항을 제안`

    const userPrompt = `[팀 채팅 상황]
사용자 요청: ${userMessage.slice(0, 300)}

[${DEPARTMENTS[mainDeptId].name}팀 응답 요약]
${mainResult.slice(0, 600)}

위 내용에 대해 ${dept.name} 입장에서 짧게 코멘트해주세요.`

    try {
      store.updateAgentStatus(relAgent.id, 'thinking', '채팅 내용 검토 중...')

      const comment = await callLLM({
        model: relAgent.model ?? 'claude-3-5-haiku-20241022',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 200,
      })

      if (comment.trim()) {
        store.addMessage({
          sender: relAgent.id,
          senderName: `${relAgent.name} (${dept.name})`,
          content: comment.trim(),
          type: 'result',
          taskId,
          departmentIds: [mainDeptId],
          channelFloorId,
        })
      }
    } catch (e) {
      console.warn(`[fireRelatedReactions] ${relDeptId} 반응 실패:`, e)
    } finally {
      store.updateAgentStatus(relAgent.id, 'idle')
    }
  }
}

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

  const executionPrompt = buildTaskPrompt(trimmed, attachments, 'full')

  store.addTask({
    id: taskId,
    title: buildTaskTitle(trimmed, attachments),
    description: executionPrompt,
    attachments,
    assignedTo: [deptId],
    status: 'in_progress',
    approvalReasons: [],
  })

  const approvalReasons = evaluateApprovalReasons({
    userMessage: trimmed,
    attachments,
    approvalRequired: store.approvalRequired,
    approvalPolicies: store.approvalPolicies,
  })

  store.updateTask(taskId, { approvalReasons })

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

  store.updateTask(taskId, {
    status: finalStatus,
    result,
    approvalReasons: allApprovalReasons,
  })
  syncDirectiveAgentMessages()

  if (finalStatus === 'awaiting_approval') {
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

  // 웹훅 + 브라우저 알림 + Notion 연동
  const finalTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
  if (finalTask) {
    const currentState = useAgentStore.getState()
    const ws = buildWebhookSettings(currentState)
    const isEffectivelyComplete = finalStatus === 'completed' || finalStatus === 'awaiting_approval'
    const shouldNotify = isEffectivelyComplete ? ws.onTaskComplete : ws.onTaskFail
    if (shouldNotify) {
      sendWebhook(ws, buildTaskWebhookPayload(finalTask), finalTask.assignedTo).catch((err) => {
        console.error('[agentOrchestrator] 채널 메시지 웹훅 전송 실패:', err)
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
        console.error('[agentOrchestrator] 채널 메시지 Notion 전송 실패:', err)
        useAgentStore.getState().addToast('error', 'Notion 저장 실패', err instanceof Error ? err.message : '설정 > Notion에서 연결을 확인하세요.', 5000)
      })
    }
  }

  // 자율 트리거 평가
  if (teamResult.summary && result) {
    evaluateAndFireTriggers(taskId, [deptId], result, teamResult.savedFiles ?? []).catch((e: unknown) => {
      console.warn('[agentOrchestrator] 채널 메시지 트리거 평가 실패:', e)
    })
  }

  // 관련 부서 자동 반응 (비동기 — 주담당 응답 후 자연스럽게 등장)
  if (teamResult.summary && result) {
    fireRelatedReactions(deptId, trimmed, result, channelFloorId, taskId).catch((e: unknown) => {
      console.warn('[agentOrchestrator] 관련 부서 반응 실패:', e)
    })
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

  // @토론 태그 = 명시적 복합 토론 요청 → 항상 complex 3레이어로 처리
  const isExplicitDebate = trimmedMessage.includes(DEBATE_TAG) || trimmedMessage.toLowerCase().startsWith(DEBATE_PREFIX.toLowerCase())

  // 복잡도 분류: @토론 태그 시 강제 complex, 아니면 자동 분류
  const { classifyComplexity } = await import('./taskComplexity')
  const complexity = isExplicitDebate ? ('complex' as const) : classifyComplexity(trimmedMessage)

  const { debateEnabled } = useAgentStore.getState()
  if (debateEnabled && complexity !== 'simple') {
    const { runModelDebate } = await import('./modelDebate')
    const { runDeptInternalDebate, synthesizeDeptOpinions } = await import('./debateService')
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

    store0.addTask({
      id: debateTaskId,
      title: buildTaskTitle(trimmedMessage, attachments),
      description: trimmedMessage,
      attachments,
      assignedTo: ['ceo'],
      status: 'in_progress',
      approvalReasons: [],
      threadId: resolvedThreadId0,
      revisionOf: options?.revisionOf,
    })

    // ── Layer 1: 부서 라우팅 + 각 부서 내부 토론 ───────────────────────────
    const routingTopic = buildTaskPrompt(trimmedMessage, attachments, 'summary')
    const assignedDepts0 = await routeByLLM(routingTopic)

    store0.updateTask(debateTaskId, { assignedTo: assignedDepts0 })

    const tierLabel = complexity === 'complex'
      ? 'Claude · GPT · Gemini 3자 토론'
      : 'Claude · GPT 2자 토론'

    store0.addMessage({
      sender: ceo0?.id ?? 'ceo-01',
      senderName: `${ceo0?.name ?? '임태오'} (CEO)`,
      content: [
        `[${complexity === 'complex' ? '복합' : '중간'} 난이도] ${tierLabel} 프로세스를 시작합니다.`,
        `담당 부서: ${assignedDepts0.map((d) => DEPARTMENTS[d].name).join(', ')}`,
        '1단계: 각 부서 내부 검토 → 2단계: 부서 간 쟁점 정리 → 3단계: 모델 토론',
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

    // ── Layer 2: 부서 간 쟁점 종합 (complex 전용) ──────────────────────────
    let crossDeptSynthesis: string | null = null
    if (complexity === 'complex' && deptOpinions.length >= 2) {
      crossDeptSynthesis = await synthesizeDeptOpinions(routingTopic, deptOpinions)
    }

    // ── Layer 3: 모델 토론 (부서 분석 결과를 컨텍스트로 전달) ──────────────
    const deptContextLines: string[] = []
    for (const { dept, content } of deptOpinions) {
      deptContextLines.push(`[${DEPARTMENTS[dept].name}]\n${content.slice(0, 500)}${content.length > 500 ? '\n...' : ''}`)
    }
    if (crossDeptSynthesis) {
      deptContextLines.push(`[부서 간 종합]\n${crossDeptSynthesis.slice(0, 600)}`)
    }
    const deptContext = deptContextLines.length > 0 ? deptContextLines.join('\n\n') : undefined

    const debateResult = await runModelDebate(trimmedMessage, attachments, complexity, debateTaskId, deptContext)

    store0.updateTask(debateTaskId, {
      status: debateResult ? 'awaiting_approval' : 'failed',
      result: debateResult,
      departmentResults: deptOpinions.map(({ dept, content }) => ({
        deptId: dept,
        agentName: DEPARTMENTS[dept].name,
        content,
      })),
    })
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

  const userMessageId = store.addMessage({
    sender: 'user',
    senderName: '사용자',
    content: submittedContent,
    type: 'task',
    attachments,
    taskId,
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

  // 스레드 컨텍스트: 같은 스레드 내 이전 태스크 결과를 세션 컨텍스트로 구성
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

  // 버전 번호 계산: 원본=1, 수정본은 같은 루트의 기존 수정본 수+2
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

  // routeByLLM과 메모리 검색을 병렬 실행 (독립적인 비동기 작업)
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
      `[메모리 참고] 과거 관련 업무 ${relevantMemories.length}건을 참고합니다: ${relevantMemories.map((m) => m.title).join(', ')}`
    )
  }

  store.addMessage({
    sender: ceoAgent?.id ?? 'ceo-01',
    senderName: `${ceoAgent?.name ?? '임태오'} (${ceoAgent?.role ?? 'CEO (대표)'})`,
    content: coordinatorLines.join('\n'),
    type: 'system',
    taskId,
    departmentIds: scopedDepartments,
    channelFloorId: meetingPlan?.channelFloorId,
  })

  if (ceoAgent) {
    store.updateAgentStatus(ceoAgent.id, 'idle')
  }
  // assignedTo 확정 즉시 단 1회 업데이트 (status는 완료 시 덮어씀)
  store.updateTask(taskId, { assignedTo: assignedDepts, status: 'in_progress' })

  const chain: ChainResult[] = []
  let interruptedByDirective = false
  const taskSavedFiles: string[] = [] // 이번 태스크 중 에이전트가 저장한 파일 누적

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

  // AI 출력 기반 추가 승인 검사: 사용자 메시지에 없었던 민감 키워드가 AI 답변에 있으면 승인 요청
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
  })

  if (finalStatus === 'awaiting_approval') {
    const pendingTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
    store.addToast('approval', pendingTask?.title ?? '업무 결과 검토 필요', '승인하면 외부 알림·저장·자동 후속이 실행됩니다.', undefined, taskId, allApprovalReasons)
  }

  syncDirectiveAgentMessages()

  // 완료 태스크 메모리 저장 + 세션 컨텍스트 갱신
  if (succeeded) {
    const completedTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
    if (completedTask) {
      extractAndSaveMemory(completedTask).catch((err) => {
        console.warn('[agentOrchestrator] 메모리 저장 실패:', err)
        useAgentStore.getState().addToast('warn', '메모리 저장 실패', err instanceof Error ? err.message : '재시도하거나 메모리를 비활성화하세요.', 5000)
      })

      // 세션 컨텍스트: 직전 2개 부서 결과 요약 (각 300자)
      const ctxLines = chain.slice(-2).map(
        (c) => `• ${DEPARTMENTS[c.dept].name}: ${c.content.slice(0, 300)}${c.content.length > 300 ? '\n...(이하 생략)' : ''}`
      )
      if (ctxLines.length > 0) {
        useAgentStore.getState().setSessionContext(
          `이전 요청: "${completedTask.title}"\n${ctxLines.join('\n')}`
        )
      }
    }
  }

  // 자율 트리거 평가 — 태스크 완료 시 조건에 맞는 트리거 실행
  if (succeeded && finalResult) {
    evaluateAndFireTriggers(taskId, assignedDepts, finalResult, taskSavedFiles).catch((e: unknown) => {
      console.warn('[agentOrchestrator] 트리거 평가 실패:', e)
      useAgentStore.getState().addToast('warn', '자율 트리거 실패', e instanceof Error ? e.message : '트리거 평가 중 오류 발생', 4000)
    })
  }

  // 웹훅 + 브라우저 알림 + Notion 연동
  const finalTask = useAgentStore.getState().tasks.find((t) => t.id === taskId)
  if (finalTask) {
    const currentState = useAgentStore.getState()
    const ws = buildWebhookSettings(currentState)
    const isEffectivelyComplete = finalStatus === 'completed' || finalStatus === 'awaiting_approval'
    const shouldNotify = isEffectivelyComplete ? ws.onTaskComplete : ws.onTaskFail
    if (shouldNotify) {
      sendWebhook(ws, buildTaskWebhookPayload(finalTask), finalTask.assignedTo).catch((err) => {
        console.error('[agentOrchestrator] 웹훅 전송 실패:', err)
        useAgentStore.getState().addToast('error', '웹훅 전송 실패', err instanceof Error ? err.message : '설정 > 알림에서 URL을 확인하세요.', 5000)
      })
      sendBrowserNotification(
        isEffectivelyComplete ? `✅ 완료: ${finalTask.title}` : `❌ 실패: ${finalTask.title}`,
        finalTask.result?.slice(0, 80) ?? '',
      )
    }

    // Notion 페이지 생성
    const ns = buildNotionSettings(currentState)
    const shouldNotion = isEffectivelyComplete ? ns.onTaskComplete : ns.onTaskFail
    if (ns.enabled && shouldNotion) {
      createNotionPage(finalTask, ns).catch((err) => {
        console.error('[agentOrchestrator] Notion 전송 실패:', err)
        useAgentStore.getState().addToast('error', 'Notion 저장 실패', err instanceof Error ? err.message : '설정 > Notion에서 연결을 확인하세요.', 5000)
      })
    }
  }
}
