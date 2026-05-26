import type { Task } from '@/types'

export type TaskFilter = 'all' | Task['status']

export const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '대기' },
  { id: 'in_progress', label: '진행 중' },
  { id: 'awaiting_approval', label: '승인 대기' },
  { id: 'completed', label: '완료' },
  { id: 'failed', label: '실패' },
]

export const STATUS_LABEL: Record<Task['status'], string> = {
  pending: '대기',
  in_progress: '진행 중',
  awaiting_approval: '승인 대기',
  completed: '완료',
  failed: '실패',
}

export const STATUS_COLOR: Record<Task['status'], { border: string; bg: string; text: string; dot: string }> = {
  pending:           { border: 'border-l-office-text/30', bg: 'bg-office-text/5',   text: 'text-office-text/60',  dot: 'bg-office-text/40' },
  in_progress:       { border: 'border-l-office-active',  bg: 'bg-office-active/10', text: 'text-office-active',   dot: 'bg-office-active' },
  awaiting_approval: { border: 'border-l-yellow-400',     bg: 'bg-yellow-500/10',    text: 'text-yellow-400',      dot: 'bg-yellow-400' },
  completed:         { border: 'border-l-emerald-400',    bg: 'bg-emerald-500/10',   text: 'text-emerald-400',     dot: 'bg-emerald-400' },
  failed:            { border: 'border-l-red-400',        bg: 'bg-red-500/10',       text: 'text-red-400',         dot: 'bg-red-400' },
}

export const STEPS: Task['status'][] = ['pending', 'in_progress', 'awaiting_approval', 'completed']

export function stepIndex(status: Task['status']): number {
  if (status === 'failed') return -1
  return STEPS.indexOf(status)
}
