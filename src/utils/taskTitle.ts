import type { Task, UploadedFile } from '@/types'

const DEFAULT_TASK_TITLE_LIMIT = 80
const LEGACY_TASK_TITLE_LIMIT = 40
const AUTO_TASK_PREFIX = '[자동] '

function normalizeTitleText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

export function summarizeTaskTitleText(text: string, max = DEFAULT_TASK_TITLE_LIMIT) {
  const normalized = normalizeTitleText(text)
  if (!normalized) return ''
  if (normalized.length <= max) return normalized

  const sentenceBreaks = Array.from(normalized.matchAll(/[.!?]/g))
    .map((match) => match.index ?? -1)
    .filter((index) => index >= Math.min(15, max / 2) && index < max)

  if (sentenceBreaks.length > 0) {
    return normalized.slice(0, sentenceBreaks[0] + 1).trim()
  }

  return `${normalized.slice(0, Math.max(1, max - 3)).trimEnd()}...`
}

export function buildTaskTitle(userMessage: string, attachments: UploadedFile[], max = DEFAULT_TASK_TITLE_LIMIT) {
  const summarizedMessage = summarizeTaskTitleText(userMessage, max)
  if (summarizedMessage.length > 0) {
    return summarizedMessage
  }

  if (attachments.length === 1) {
    return `${attachments[0].name} 분석`
  }

  return `업로드 파일 ${attachments.length}개 분석`
}

export function buildTriggeredTaskTitle(message: string, max = DEFAULT_TASK_TITLE_LIMIT) {
  return `${AUTO_TASK_PREFIX}${summarizeTaskTitleText(message, max)}`
}

export function repairLegacyTaskTitle(task: Task, max = DEFAULT_TASK_TITLE_LIMIT) {
  const description = normalizeTitleText(task.description)
  if (!description) {
    return task
  }

  if (task.title.startsWith(AUTO_TASK_PREFIX)) {
    const titleBody = normalizeTitleText(task.title.slice(AUTO_TASK_PREFIX.length))
    if (titleBody.length === LEGACY_TASK_TITLE_LIMIT && description.startsWith(titleBody)) {
      return {
        ...task,
        title: buildTriggeredTaskTitle(description, max),
      }
    }
    return task
  }

  const titleBody = normalizeTitleText(task.title)
  if (titleBody.length === LEGACY_TASK_TITLE_LIMIT && description.startsWith(titleBody)) {
    return {
      ...task,
      title: summarizeTaskTitleText(description, max),
    }
  }

  return task
}
