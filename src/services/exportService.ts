import type { Message, Task } from '@/types'
import { DEPARTMENTS } from '@/types'

// ─── 코드 블록 언어 → 파일 확장자 ────────────────────────────────────────────
const LANG_EXT: Record<string, string> = {
  typescript: 'ts', ts: 'ts',
  javascript: 'js', js: 'js',
  tsx: 'tsx', jsx: 'jsx',
  python: 'py', py: 'py',
  java: 'java', kotlin: 'kt',
  go: 'go', rust: 'rs',
  bash: 'sh', shell: 'sh', sh: 'sh',
  sql: 'sql', yaml: 'yaml', yml: 'yml',
  json: 'json', html: 'html', css: 'css',
  markdown: 'md', md: 'md',
  cpp: 'cpp', c: 'c',
}

function detectPrimaryCodeLang(content: string): string | null {
  const match = content.match(/```(\w+)/)
  if (!match) return null
  return LANG_EXT[match[1].toLowerCase()] ?? null
}

function buildDownloadFilename(senderName: string, ext: string): string {
  const sanitized = senderName.replace(/[^\w가-힣]/g, '_').slice(0, 24)
  return `${sanitized}_${formatDateFilename(new Date())}.${ext}`
}

// ─── 단일 메시지 내보내기 ─────────────────────────────────────────────────────
export function exportMessage(message: Message) {
  const codeExt = detectPrimaryCodeLang(message.content)
  const ext = codeExt ?? 'md'

  let body: string
  if (codeExt) {
    // 코드 블록이 주인 경우: 첫 번째 코드 블록 내용만 추출, 없으면 전체
    const codeMatch = message.content.match(/```\w*\n?([\s\S]*?)```/)
    body = codeMatch ? codeMatch[1] : message.content
  } else {
    // 마크다운 문서로 내보내기
    body = [
      `# ${message.senderName}`,
      `*${formatDateTime(message.timestamp)}*`,
      '',
      message.content,
    ].join('\n')
  }

  downloadText(body, buildDownloadFilename(message.senderName, ext))
}

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
    awaiting_approval: '승인 대기',
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

  if (task.approvalReasons && task.approvalReasons.length > 0) {
    lines.push('', '## 승인 사유', '')
    for (const reason of task.approvalReasons) {
      lines.push(`- **${reason.label}**: ${reason.description}`)
    }
  }

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
      pending: '대기', in_progress: '진행 중', completed: '완료', awaiting_approval: '승인 대기', failed: '실패',
    }
    lines.push(
      '',
      `## ${task.title}`,
      '',
      `**상태:** ${statusMap[task.status]} | **담당:** ${deptNames || '미배정'} | **시각:** ${formatDateTime(task.createdAt)}`,
      '',
    )
    if (task.approvalReasons && task.approvalReasons.length > 0) {
      lines.push(`**승인 사유:** ${task.approvalReasons.map((reason) => reason.label).join(', ')}`, '')
    }
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
