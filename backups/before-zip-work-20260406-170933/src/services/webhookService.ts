import type { Task } from '@/types'
import { DEPARTMENTS } from '@/types'
import { useAgentStore } from '@/store/agentStore'

export interface WebhookSettings {
  url: string
  enabled: boolean
  onTaskComplete: boolean
  onTaskFail: boolean
  onDailyBriefing: boolean
}

const STATUS_EMOJI: Record<Task['status'], string> = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  failed: '❌',
}

export async function sendWebhook(settings: WebhookSettings, payload: object): Promise<void> {
  if (!settings.enabled || !settings.url.trim()) return
  try {
    await fetch(settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.warn('[webhook] 전송 실패 (앱 동작에는 영향 없음):', err)
  }
}

export function buildTaskWebhookPayload(task: Task) {
  const deptNames = task.assignedTo.map((id) => DEPARTMENTS[id]?.name ?? id).join(', ')
  const emoji = STATUS_EMOJI[task.status]
  const resultPreview = task.result ? task.result.slice(0, 300) + (task.result.length > 300 ? '...' : '') : ''

  // Discord & Slack 모두 호환되는 형식
  return {
    // Discord embed
    embeds: [{
      title: `${emoji} ${task.title}`,
      color: task.status === 'completed' ? 0x44ff88 : 0xff4466,
      fields: [
        { name: '담당 부서', value: deptNames || '미배정', inline: true },
        { name: '상태', value: task.status === 'completed' ? '완료' : '실패', inline: true },
        ...(resultPreview ? [{ name: '결과 요약', value: resultPreview }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'AI 오피스' },
    }],
    // Slack fallback
    text: `${emoji} *${task.title}*\n담당: ${deptNames}\n${resultPreview}`,
  }
}

export function buildBriefingWebhookPayload(briefingContent: string) {
  return {
    embeds: [{
      title: '🌅 AI 오피스 일일 브리핑',
      description: briefingContent.slice(0, 4000),
      color: 0x64ffda,
      timestamp: new Date().toISOString(),
      footer: { text: 'AI 오피스 자동 브리핑' },
    }],
    text: `🌅 *AI 오피스 일일 브리핑*\n${briefingContent.slice(0, 500)}`,
  }
}

// store에서 현재 웹훅 설정 읽기
export function buildWebhookSettings(store: ReturnType<typeof useAgentStore.getState>): WebhookSettings {
  return store.webhookSettings
}

// 브라우저 알림
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function sendBrowserNotification(title: string, body: string, icon?: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  new Notification(title, {
    body,
    icon: icon ?? '/favicon.ico',
    badge: '/favicon.ico',
  })
}
