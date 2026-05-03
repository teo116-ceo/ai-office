import type { Message, Task } from '@/types'
import { DEPARTMENTS } from '@/types'

// ─── 파일 다운로드 헬퍼 ───────────────────────────────────────────────────────
function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatDateFilename(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '')
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── 작업 단건 마크다운 내보내기 ─────────────────────────────────────────────
export function exportTask(task: Task) {
  const deptNames = task.assignedTo.map((id) => DEPARTMENTS[id]?.name ?? id).join(', ')
  const statusMap: Record<Task['status'], string> = {
    pending: '대기',
    in_progress: '진행 중',
    completed: '완료',
    failed: '실패',
  }

  const lines: string[] = [
    `# ${task.title}`,
    '',
    `| 항목 | 내용 |`,
    `|------|------|`,
    `| 상태 | ${statusMap[task.status]} |`,
    `| 담당 부서 | ${deptNames || '미배정'} |`,
    `| 생성 시각 | ${formatDateTime(task.createdAt)} |`,
    '',
    '## 요청 내용',
    '',
    task.description,
  ]

  if (task.attachments && task.attachments.length > 0) {
    lines.push('', '## 첨부 파일', '')
    for (const att of task.attachments) {
      lines.push(`- **${att.name}** — ${att.summary}`)
    }
  }

  if (task.result) {
    lines.push('', '## 실행 결과', '', task.result)
  }

  const filename = `task_${formatDateFilename(task.createdAt)}_${task.title.slice(0, 20).replace(/[^\w가-힣]/g, '_')}.md`
  downloadText(lines.join('\n'), filename)
}

// ─── 전체 작업 목록 내보내기 ─────────────────────────────────────────────────
export function exportAllTasks(tasks: Task[]) {
  if (tasks.length === 0) return

  const sorted = [...tasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const lines: string[] = [
    '# AI 오피스 작업 히스토리',
    '',
    `내보낸 시각: ${formatDateTime(new Date())}  `,
    `총 ${sorted.length}개 작업`,
    '',
    '---',
  ]

  for (const task of sorted) {
    const deptNames = task.assignedTo.map((id) => DEPARTMENTS[id]?.name ?? id).join(', ')
    const statusMap: Record<Task['status'], string> = {
      pending: '대기', in_progress: '진행 중', completed: '완료', failed: '실패',
    }
    lines.push(
      '',
      `## ${task.title}`,
      '',
      `**상태:** ${statusMap[task.status]} | **담당:** ${deptNames || '미배정'} | **시각:** ${formatDateTime(task.createdAt)}`,
      '',
    )
    if (task.result) {
      lines.push('**결과:**', '', task.result, '')
    }
    lines.push('---')
  }

  downloadText(lines.join('\n'), `ai_office_tasks_${formatDateFilename(new Date())}.md`)
}

// ─── 채팅 대화 내보내기 ──────────────────────────────────────────────────────
export function exportMessages(messages: Message[], channelLabel?: string) {
  if (messages.length === 0) return

  const lines: string[] = [
    `# AI 오피스 대화 내보내기${channelLabel ? ` — ${channelLabel}` : ''}`,
    '',
    `내보낸 시각: ${formatDateTime(new Date())}  `,
    `총 ${messages.length}개 메시지`,
    '',
    '---',
    '',
  ]

  for (const msg of messages) {
    const time = formatDateTime(msg.timestamp)
    const typeLabel = msg.type === 'system' ? '🔧' : msg.type === 'debate' ? '💬' : msg.type === 'result' ? '📋' : '📨'
    lines.push(
      `### ${typeLabel} ${msg.senderName}`,
      `*${time}*`,
      '',
      msg.content,
      '',
    )
    if (msg.attachments && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        lines.push(`> 📎 **${att.name}** — ${att.summary}`)
      }
      lines.push('')
    }
    lines.push('---', '')
  }

  downloadText(lines.join('\n'), `ai_office_chat_${formatDateFilename(new Date())}.md`)
}
