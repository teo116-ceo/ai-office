/** HH:MM format for headers and recent activity. */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

/** HH:MM:SS format for execution logs. */
export function formatTimeWithSeconds(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** MM/DD HH:MM format for list cards. */
export function formatShortDateTime(date: Date): string {
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Short localized file timestamp. */
export function formatFileDate(date: Date): string {
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Full localized date and time. */
export function formatFullDateTime(date: Date): string {
  return date.toLocaleString('ko-KR')
}
