import { useAgentStore } from '@/store/agentStore'
import type { Agent, DepartmentId, FloorId } from '@/types'
import { DEPARTMENTS } from '@/types'
import {
  shouldInterruptAgentWork,
  syncDirectiveAgentMessages,
} from './directives'
import { callLLMStream, type LLMMessage } from './multiProviderApi'
import { setStreamingContent, clearStreamingContent } from './streamingCache'
import {
  buildTeamPlan,
  formatAssignmentRoster,
  getCoordinatorLabel,
  formatParticipantRoster,
  type TeamAssignment,
  type TeamPlan,
} from './teamCollaboration'
import { callLLMWithTools, formatToolUsageSummary, fetchOutputFiles, fetchOutputFileContent } from './agentTools'
import { callLLM } from './multiProviderApi'
import { formatAgentDisplayName } from '@/utils/agentRoleMeta'
import {
  buildAgentSystemPrompt,
  buildContributorTaskPrompt,
  buildTeamSummaryPrompt,
  truncate,
} from './taskExecutionPrompts'
import { recordError } from './errorLog'

// ─── 내부 타입 (agentOrchestrator.ts 와 triggerEngine.ts에서도 사용) ─────────────────
export type ChainResult = {
  dept: DepartmentId
  agentName: string
  content: string
}

export type TeamContribution = {
  agent: Agent
  content: string
}

// ─── 컨텍스트 윈도우 관리 상수 ──────────────────────────────────────────────────
const THREAD_RECENT_COUNT = 2   // 전문 포함 태스크 수
const THREAD_COMPRESS_AT = 5   // 이 수 초과 시 오래된 것 압축
const STREAM_MAX_TOKENS = 16000
const MAX_AUTO_CONTINUE_ROUNDS = 4
const TRUNCATED_STOP_REASONS = new Set(['length', 'max_tokens', 'MAX_TOKENS'])
const AUTO_CONTINUE_PROMPT = '이전 답변이 출력 한도 때문에 중간에서 멈췄습니다. 이미 작성한 내용을 반복하지 말고 마지막 문장 바로 다음부터 계속 작성하세요. 번호, 표, 문단 흐름을 유지하세요.'
const AUTO_CONTINUE_LIMIT_NOTICE = '\n\n[출력 중단 안내] 자동 이어쓰기를 여러 번 시도했지만 제공사 출력 한도에 다시 도달했습니다. 같은 스레드에서 "이어서 계속"을 요청하면 남은 내용을 이어서 작성할 수 있습니다.'

function hasOutputLimitStop(stopReason?: string | null) {
  return Boolean(stopReason && TRUNCATED_STOP_REASONS.has(stopReason))
}

function notifyOutputLimitReached(stopReason?: string | null) {
  if (!hasOutputLimitStop(stopReason)) return
  useAgentStore.getState().addToast(
    'warn',
    'AI 결과 자동 이어쓰기 한계 도달',
    '제공사 출력 한도에 여러 번 도달했습니다. 같은 스레드에서 "이어서 계속"을 요청하세요.',
    8000,
  )
}

function buildContinuationMessages(baseMessages: LLMMessage[], content: string): LLMMessage[] {
  return [
    ...baseMessages,
    { role: 'assistant', content },
    { role: 'user', content: AUTO_CONTINUE_PROMPT },
  ]
}

async function streamWithAutoContinuation({
  model,
  system,
  messages,
  initialContent = '',
  onContent,
  taskId,
}: {
  model: Agent['model']
  system: string
  messages: LLMMessage[]
  initialContent?: string
  onContent: (content: string) => void
  taskId?: string
}) {
  let content = initialContent
  let currentMessages = initialContent ? buildContinuationMessages(messages, content) : messages
  let stopReason: string | null | undefined = null

  for (let round = 0; round <= MAX_AUTO_CONTINUE_ROUNDS; round += 1) {
    const streamResult = await callLLMStream(
      { model, maxTokens: STREAM_MAX_TOKENS, system, messages: currentMessages },
      (delta) => {
        content += delta
        onContent(content)
      },
      taskId,
    )

    stopReason = streamResult.stopReason
    if (!hasOutputLimitStop(stopReason)) {
      return { content, stopReason, reachedAutoContinueLimit: false }
    }

    if (round === MAX_AUTO_CONTINUE_ROUNDS) {
      notifyOutputLimitReached(stopReason)
      return {
        content: `${content}${AUTO_CONTINUE_LIMIT_NOTICE}`,
        stopReason,
        reachedAutoContinueLimit: true,
      }
    }

    currentMessages = buildContinuationMessages(messages, content)
  }

  return { content, stopReason, reachedAutoContinueLimit: false }
}

export function buildThreadContext(tasks: import('@/types').Task[], threadId: string): string {
  const threadTasks = tasks
    .filter((t) => (t.threadId === threadId || t.id === threadId) && t.result)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  if (threadTasks.length === 0) return ''

  const store = useAgentStore.getState()
  const recent = threadTasks.slice(-THREAD_RECENT_COUNT)
  const older = threadTasks.slice(0, -THREAD_RECENT_COUNT)

  const lines: string[] = [`[스레드 이전 업무 (총 ${threadTasks.length}건)]`]

  if (older.length > 0) {
    // 오래된 것: 캐시된 요약이 있으면 사용, 없으면 제목만 나열
    const cachedSummary = store.threadSummaries[threadId]
    if (cachedSummary) {
      lines.push(`[초반 업무 요약]\n${cachedSummary}`)
    } else if (older.length >= THREAD_COMPRESS_AT - THREAD_RECENT_COUNT) {
      // 비동기 LLM 요약을 비차단으로 트리거 (다음 호출부터 캐시 사용)
      void generateAndCacheThreadSummary(threadId, older)
      lines.push(`[초반 업무 목록] ${older.map((t) => `"${t.title}"`).join(' → ')}`)
    } else {
      lines.push(`[이전 업무] ${older.map((t) => `"${t.title}"`).join(' → ')}`)
    }
  }

  for (const t of recent) {
    lines.push(`• "${t.title}": ${truncate(t.result ?? '', 300)}`)
  }

  lines.push('위 스레드 흐름과 연속선상에서 현재 요청을 처리하세요.')
  return lines.join('\n')
}

async function generateAndCacheThreadSummary(
  threadId: string,
  tasks: import('@/types').Task[],
): Promise<void> {
  const store = useAgentStore.getState()
  if (store.threadSummaries[threadId]) return // 이미 캐시됨

  const ceoAgent = store.agents.find((a) => a.departmentId === 'ceo')
  if (!ceoAgent) return

  try {
    const input = tasks
      .map((t) => `업무: ${t.title}\n결과 요약: ${truncate(t.result ?? '', 200)}`)
      .join('\n\n')

    const summary = await callLLM({
      model: ceoAgent.model,
      maxTokens: 300,
      system: '아래 완료된 업무들을 3~5문장으로 압축 요약하세요. 핵심 결정사항과 산출물만 포함하세요.',
      messages: [{ role: 'user', content: input }],
    })

    useAgentStore.getState().setThreadSummary(threadId, summary)
  } catch {
    // 실패해도 무시 — 다음 호출에 재시도
  }
}

async function collectDepartmentContribution({
  assignment,
  executionPrompt,
  chainContext,
  priorContributions,
  taskId,
  channelFloorId,
  hasAttachments,
  teamPlan,
  priorTaskFiles,
}: {
  assignment: TeamAssignment
  executionPrompt: string
  chainContext: string
  priorContributions: TeamContribution[]
  taskId: string
  channelFloorId?: FloorId
  hasAttachments: boolean
  teamPlan: TeamPlan
  priorTaskFiles: string[]
}) {
  const { agent } = assignment
  const store = useAgentStore.getState()
  store.updateAgentStatus(agent.id, 'working', '분담 영역 검토 중...')

  // 지시 변경 감지를 위해 작업 시작 시점의 revision을 1회만 캡처
  const directiveRevisionAtStart = useAgentStore.getState().directiveRevision

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const availableFiles = await fetchOutputFiles()
      const systemPrompt = buildAgentSystemPrompt(agent, hasAttachments, 'individual', teamPlan, assignment, availableFiles, priorTaskFiles)

      // 파일 핸드오프 직접 주입: 이전 부서가 저장한 파일 내용을 LLM 의존 없이 컨텍스트에 포함
      const injectedFileBlocks = priorTaskFiles.length > 0
        ? (await Promise.all(
            priorTaskFiles.map(async (filename) => {
              try {
                const content = await fetchOutputFileContent(filename)
                if (!content) return null
                return `[파일: ${filename}]\n${content.slice(0, 1500)}${content.length > 1500 ? '\n...(이하 생략)' : ''}`
              } catch (err) {
                console.warn(`[agentExecution] 파일 핸드오프 읽기 실패: ${filename}`, err)
                return null
              }
            })
          )).filter((block): block is string => block !== null)
        : []

      const userContent = buildContributorTaskPrompt(assignment, executionPrompt, chainContext, priorContributions, injectedFileBlocks)
      const msgs = [{ role: 'user' as const, content: userContent }]

      // Claude 모델은 Tool Use 시도, 실패 시 일반 호출로 폴백
      let content: string
      let toolSummary = ''
      const savedFiles: string[] = []

      const toolResult = await callLLMWithTools({ model: agent.model, system: systemPrompt, messages: msgs, maxTokens: STREAM_MAX_TOKENS })
      if (toolResult) {
        if (hasOutputLimitStop(toolResult.stopReason)) {
          const continued = await streamWithAutoContinuation({
            model: agent.model,
            system: systemPrompt,
            messages: msgs,
            initialContent: toolResult.text,
            onContent: () => {},
            taskId,
          })
          content = continued.content
        } else {
          content = toolResult.text
        }
        toolSummary = formatToolUsageSummary(toolResult.toolCalls)
        for (const tc of toolResult.toolCalls) {
          if (tc.name === 'write_file' && tc.input.filename) savedFiles.push(tc.input.filename)
        }
      } else {
        // 스트리밍: 메시지 플레이스홀더를 Zustand에 1회 등록
        // 중간 토큰은 streamingCache에만 기록 → Zustand set() 호출 없음 → Error #185 방지
        const streamingMsgId = useAgentStore.getState().addMessage({
          sender: agent.id,
          senderName: formatAgentDisplayName(agent),
          content: '',
          type: 'result',
          taskId,
          departmentIds: [agent.departmentId],
          channelFloorId,
          streaming: true,
        })
        try {
          const streamResult = await streamWithAutoContinuation({
            model: agent.model,
            system: systemPrompt,
            messages: msgs,
            onContent: (currentContent) => {
              setStreamingContent(streamingMsgId, `[개별 검토]\n${currentContent}`)
            },
            taskId,
          })
          content = streamResult.content
        } catch (streamErr) {
          // 스트리밍 실패 시 플레이스홀더 정리 후 외부 catch로 전달
          useAgentStore.getState().updateMessage(streamingMsgId, { content: '', streaming: false })
          clearStreamingContent(streamingMsgId)
          throw streamErr
        }
        // 스트리밍 완료 — Zustand에 최종값 먼저 기록 후 캐시 제거
        // (순서 중요: 캐시를 먼저 지우면 rAF이 Zustand 업데이트보다 먼저 실행될 때
        //  streaming=true 상태에서 캐시가 없어 빈 화면이 순간 노출되는 문제 발생)
        useAgentStore.getState().updateMessage(streamingMsgId, {
          content: `[개별 검토]\n${content}`,
          streaming: false,
        })
        clearStreamingContent(streamingMsgId)
      }

      if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
        syncDirectiveAgentMessages()
        return { contribution: null as TeamContribution | null, interrupted: true, savedFiles: [] }
      }

      const contribution = { agent, content }
      // tool use 결과는 스트리밍 없이 일반 addMessage
      if (toolSummary) {
        useAgentStore.getState().addMessage({
          sender: agent.id,
          senderName: formatAgentDisplayName(agent),
          content: `[개별 검토]\n${content}\n\n${toolSummary}`,
          type: 'result',
          taskId,
          departmentIds: [agent.departmentId],
          channelFloorId,
        })
      }
      useAgentStore.getState().updateAgentStatus(agent.id, 'idle')
      return { contribution, interrupted: false, savedFiles }
    } catch (err) {
      if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
        syncDirectiveAgentMessages()
        return { contribution: null, interrupted: true, savedFiles: [] }
      }

      if (attempt === 1) {
        const detail = err instanceof Error ? err.message : '알 수 없는 오류'
        recordError({ source: '에이전트 실행', model: agent.model, message: `${agent.name}: ${detail}` })
        useAgentStore.getState().addMessage({
          sender: agent.id,
          senderName: formatAgentDisplayName(agent),
          content: `두 번 시도했지만 개별 검토 의견을 정리하지 못했습니다. (오류: ${detail})`,
          type: 'result',
          taskId,
          departmentIds: [agent.departmentId],
          channelFloorId,
        })
        useAgentStore.getState().updateAgentStatus(agent.id, 'idle')
      }
    }
  }

  return { contribution: null as TeamContribution | null, interrupted: false, savedFiles: [] }
}

async function summarizeDepartmentTeam({
  teamPlan,
  executionPrompt,
  chainContext,
  contributions,
  taskId,
  channelFloorId,
  hasAttachments,
}: {
  teamPlan: TeamPlan
  executionPrompt: string
  chainContext: string
  contributions: TeamContribution[]
  taskId: string
  channelFloorId?: FloorId
  hasAttachments: boolean
}) {
  const coordinator = teamPlan.coordinator.agent
  const store = useAgentStore.getState()
  store.updateAgentStatus(coordinator.id, 'thinking', '팀 의견 자동 조합 중...')
  const directiveRevisionAtStart = store.directiveRevision

  const summaryMsgId = useAgentStore.getState().addMessage({
    sender: coordinator.id,
    senderName: formatAgentDisplayName(coordinator),
    content: '',
    type: 'result',
    taskId,
    departmentIds: [teamPlan.departmentId],
    channelFloorId,
    streaming: true,
  })

  try {
    const summarySystemPrompt = buildAgentSystemPrompt(coordinator, hasAttachments, 'lead-summary', teamPlan, teamPlan.coordinator)
    const summaryMessages = [{ role: 'user' as const, content: buildTeamSummaryPrompt(executionPrompt, chainContext, teamPlan, contributions) }]
    const streamResult = await streamWithAutoContinuation({
      model: coordinator.model,
      system: summarySystemPrompt,
      messages: summaryMessages,
      onContent: (currentContent) => {
        setStreamingContent(summaryMsgId, `[자동 조합 결과]\n${currentContent}`)
      },
    })
    const content = streamResult.content
    useAgentStore.getState().updateMessage(summaryMsgId, {
      content: `[자동 조합 결과]\n${content}`,
      streaming: false,
    })
    clearStreamingContent(summaryMsgId)

    if (shouldInterruptAgentWork(coordinator.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return { summary: null as TeamContribution | null, interrupted: true }
    }

    const summary = { agent: coordinator, content }
    useAgentStore.getState().updateAgentStatus(coordinator.id, 'idle')
    return { summary, interrupted: false }
  } catch {
    // 스트리밍 실패 시 플레이스홀더 정리
    useAgentStore.getState().updateMessage(summaryMsgId, { content: '', streaming: false })
    clearStreamingContent(summaryMsgId)

    if (shouldInterruptAgentWork(coordinator.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return { summary: null, interrupted: true }
    }

    useAgentStore.getState().updateAgentStatus(coordinator.id, 'idle')
    return { summary: null, interrupted: false }
  }
}

export async function executeDepartmentTeam({
  deptId,
  executionPrompt,
  chainContext,
  taskId,
  channelFloorId,
  hasAttachments,
  priorTaskFiles,
}: {
  deptId: DepartmentId
  executionPrompt: string
  chainContext: string
  taskId: string
  channelFloorId?: FloorId
  hasAttachments: boolean
  priorTaskFiles: string[]
}) {
  const store = useAgentStore.getState()
  const teamPlan = buildTeamPlan(store.agents, deptId, 'task')
  if (teamPlan.participants.length === 0) {
    return { summary: null as TeamContribution | null, interrupted: false, savedFiles: [] }
  }

  store.addMessage({
    sender: teamPlan.coordinator.agent.id,
    senderName: formatAgentDisplayName(teamPlan.coordinator.agent),
    content: [
      `${DEPARTMENTS[deptId].name} 팀 검토를 시작합니다.`,
      `참여 인원: ${formatParticipantRoster(teamPlan.participants)}`,
      `조정 방식: ${getCoordinatorLabel(teamPlan)} (${teamPlan.coordinator.agent.name})`,
      '[결과 표시 순서]',
      '1. 아래 역할에 따라 담당자가 차례대로 [개별 검토]를 올립니다.',
      '2. 팀원이 여러 명이면 마지막에 [자동 조합 결과]가 부서 공식 결과로 제시됩니다.',
      '[역할 분업]',
      formatAssignmentRoster(teamPlan.assignments, teamPlan.mode),
    ].join('\n'),
    type: 'system',
    taskId,
    departmentIds: [deptId],
    channelFloorId,
  })

  // 팀 내 기여를 순차 실행 — 이전 기여자 결과를 다음 기여자가 참고
  // (collectDepartmentContribution 내부에서 스트리밍 플레이스홀더를 생성하므로
  //  예외 시 해당 함수가 직접 정리합니다)
  const contributionResults: Array<{ contribution: TeamContribution | null; interrupted: boolean; savedFiles: string[] }> = []
  const priorContributions: TeamContribution[] = []

  for (const assignment of teamPlan.assignments) {
    const result = await collectDepartmentContribution({
      assignment,
      executionPrompt,
      chainContext,
      priorContributions: [...priorContributions],
      taskId,
      channelFloorId,
      hasAttachments,
      teamPlan,
      priorTaskFiles,
    })
    contributionResults.push(result)
    if (result.contribution) priorContributions.push(result.contribution)
    if (result.interrupted) break
  }

  const interrupted = contributionResults.some((result) => result.interrupted)
  const savedFiles = contributionResults.flatMap((r) => r.savedFiles)
  const successful = contributionResults
    .map((result) => result.contribution)
    .filter(Boolean) as TeamContribution[]

  if (interrupted) {
    return { summary: null as TeamContribution | null, interrupted: true, savedFiles }
  }

  if (successful.length === 0) {
    return { summary: null, interrupted, savedFiles }
  }

  if (teamPlan.participants.length === 1) {
    return { summary: successful[0], interrupted, savedFiles }
  }

  const summary = await summarizeDepartmentTeam({
    teamPlan,
    executionPrompt,
    chainContext,
    contributions: successful,
    taskId,
    channelFloorId,
    hasAttachments,
  })

  return {
    summary: summary.interrupted ? null : (summary.summary ?? successful[0]),
    interrupted: summary.interrupted,
    savedFiles,
  }
}
