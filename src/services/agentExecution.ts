import { useAgentStore } from '@/store/agentStore'
import type { Agent, DepartmentId, FloorId } from '@/types'
import { DEPARTMENTS } from '@/types'
import {
  shouldInterruptAgentWork,
  syncDirectiveAgentMessages,
} from './directives'
import { callLLMStream } from './multiProviderApi'
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
    lines.push(`• "${t.title}": ${truncate(t.result!, 300)}`)
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

      const toolResult = await callLLMWithTools({ model: agent.model, system: systemPrompt, messages: msgs, maxTokens: 8000 })
      if (toolResult) {
        content = toolResult.text
        toolSummary = formatToolUsageSummary(toolResult.toolCalls)
        for (const tc of toolResult.toolCalls) {
          if (tc.name === 'write_file' && tc.input.filename) savedFiles.push(tc.input.filename)
        }
      } else {
        // 스트리밍: 메시지를 먼저 등록하고 토큰이 올 때마다 실시간 업데이트
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
        let streamed = ''
        await callLLMStream(
          { model: agent.model, maxTokens: 8000, system: systemPrompt, messages: msgs },
          (delta) => {
            streamed += delta
            useAgentStore.getState().updateMessage(streamingMsgId, {
              content: `[개별 검토]\n${streamed}`,
              streaming: true,
            })
          },
        )
        content = streamed
        // 스트리밍 완료 — streaming 플래그 제거
        useAgentStore.getState().updateMessage(streamingMsgId, {
          content: `[개별 검토]\n${content}`,
          streaming: false,
        })
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
    } catch {
      if (shouldInterruptAgentWork(agent.id, directiveRevisionAtStart)) {
        syncDirectiveAgentMessages()
        return { contribution: null, interrupted: true, savedFiles: [] }
      }

      if (attempt === 1) {
        useAgentStore.getState().addMessage({
          sender: agent.id,
          senderName: formatAgentDisplayName(agent),
          content: '두 번 시도했지만 개별 검토 의견을 정리하지 못했습니다.',
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

  try {
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
    let content = ''
    await callLLMStream(
      {
        model: coordinator.model,
        maxTokens: 8000,
        system: buildAgentSystemPrompt(coordinator, hasAttachments, 'lead-summary', teamPlan, teamPlan.coordinator),
        messages: [{ role: 'user', content: buildTeamSummaryPrompt(executionPrompt, chainContext, teamPlan, contributions) }],
      },
      (delta) => {
        content += delta
        useAgentStore.getState().updateMessage(summaryMsgId, {
          content: `[자동 조합 결과]\n${content}`,
          streaming: true,
        })
      },
    )
    useAgentStore.getState().updateMessage(summaryMsgId, {
      content: `[자동 조합 결과]\n${content}`,
      streaming: false,
    })

    if (shouldInterruptAgentWork(coordinator.id, directiveRevisionAtStart)) {
      syncDirectiveAgentMessages()
      return { summary: null as TeamContribution | null, interrupted: true }
    }

    const summary = { agent: coordinator, content }
    useAgentStore.getState().addMessage({
      sender: coordinator.id,
      senderName: formatAgentDisplayName(coordinator),
      content: `[자동 조합 결과]\n${content}`,
      type: 'result',
      taskId,
      departmentIds: [teamPlan.departmentId],
      channelFloorId,
    })
    useAgentStore.getState().updateAgentStatus(coordinator.id, 'idle')
    return { summary, interrupted: false }
  } catch {
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
      '[역할 분업]',
      formatAssignmentRoster(teamPlan.assignments),
    ].join('\n'),
    type: 'system',
    taskId,
    departmentIds: [deptId],
    channelFloorId,
  })

  // 팀 내 기여를 순차 실행 — 이전 기여자 결과를 다음 기여자가 참고
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
