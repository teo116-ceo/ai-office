import { useAgentStore } from '@/store/agentStore'
import type { DepartmentId } from '@/types'

const CONTINUATION_KEYWORDS = [
  '이어서',
  '이어줘',
  '계속',
  '계속해',
  '계속 작성',
  '나머지',
  '다음부터',
  '끊긴',
  '마저',
]

export function looksLikeContinuationRequest(message: string): boolean {
  const compact = message.replace(/\s+/g, '').toLowerCase()
  return CONTINUATION_KEYWORDS.some((kw) => compact.includes(kw.replace(/\s+/g, '').toLowerCase()))
}

export function findContinuationTargetTask(deptId: DepartmentId) {
  const store = useAgentStore.getState()
  const activeThreadId = store.activeThreadId
  const candidates = [...store.tasks]
    .filter((task) => task.result && task.assignedTo.includes(deptId))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())

  if (activeThreadId) {
    const active = candidates.find(
      (task) => task.id === activeThreadId || task.threadId === activeThreadId,
    )
    if (active) return active
  }

  return candidates[0] ?? null
}

export function buildManualContinuationPrompt(
  target: NonNullable<ReturnType<typeof findContinuationTargetTask>>,
  userMessage: string,
): string {
  return [
    '[이어쓰기 요청]',
    '사용자가 이전 결과가 글자 수 제한 때문에 끊겼다고 보고, 같은 업무의 남은 내용을 이어서 작성해 달라고 요청했습니다.',
    '',
    '[중요 지시]',
    '- 아래 이전 결과는 이미 사용자에게 표시된 내용입니다.',
    '- 이전 결과를 요약하거나 처음부터 다시 작성하지 마세요.',
    '- 마지막 문장 바로 다음부터 자연스럽게 이어서 작성하세요.',
    '- 표, 번호, 문단 흐름이 있으면 그대로 유지하세요.',
    '- 새 검토 시작 문구, 참여 인원 안내, 역할 분업 안내를 출력하지 마세요.',
    '- 이어지는 본문만 출력하세요.',
    '',
    `[사용자 요청]\n${userMessage}`,
    '',
    `[이전 업무 제목]\n${target.title}`,
    '',
    `[이전 결과 전체]\n${target.result ?? ''}`,
  ].join('\n')
}
