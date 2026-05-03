import type { Task, DepartmentId } from '@/types'
import { DEPARTMENTS, type DepartmentResult } from '@/types'
import { useAgentStore } from '@/store/agentStore'
import { validateWebhookUrl as validateSharedWebhookUrl } from '@/utils/webhookValidation'
import { apiHeaders } from '@/utils/apiHeaders'

export interface WebhookSettings {
  url: string
  enabled: boolean
  onTaskComplete: boolean
  onTaskFail: boolean
  onDailyBriefing: boolean
  departmentWebhooks: Partial<Record<DepartmentId, string>>
}

/**
 * 부서 목록을 기준으로 전송할 웹훅 URL 목록을 결정합니다.
 * - 부서별 URL이 설정된 경우 해당 URL 사용
 * - 설정 없는 부서는 기본(전체) URL로 폴백
 * - 중복 URL은 하나만 전송
 */
export function resolveWebhookUrls(
  settings: WebhookSettings,
  deptIds: DepartmentId[] = [],
): string[] {
  const urls = new Set<string>()
  const defaultUrl = settings.url.trim()

  if (deptIds.length === 0) {
    if (defaultUrl) urls.add(defaultUrl)
    return Array.from(urls)
  }

  for (const deptId of deptIds) {
    const custom = settings.departmentWebhooks?.[deptId]?.trim()
    if (custom) {
      urls.add(custom)
    } else if (defaultUrl) {
      urls.add(defaultUrl)
    }
  }

  return Array.from(urls)
}

const STATUS_LABEL: Record<Task['status'], string> = {
  pending: '[대기]',
  in_progress: '[진행]',
  completed: '[완료]',
  awaiting_approval: '[검토]',
  failed: '[실패]',
}

export function validateWebhookUrl(rawUrl: string): string | null {
  const result = validateSharedWebhookUrl(rawUrl)
  return result.ok ? null : result.message
}

export async function sendWebhook(
  settings: WebhookSettings,
  payload: object,
  deptIds: DepartmentId[] = [],
): Promise<void> {
  if (!settings.enabled) return

  const urls = resolveWebhookUrls(settings, deptIds)
  if (urls.length === 0) return

  await Promise.allSettled(
    urls.map(async (url) => {
      const validationError = validateWebhookUrl(url)
      if (validationError) {
        console.warn('[webhook] URL 허용 정책 불일치, 건너뜁니다:', url, validationError)
        return
      }
      try {
        const response = await fetch('/api/webhook-proxy', {
          method: 'POST',
          headers: apiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ url, payload }),
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: '웹훅 전송 실패' })) as { error?: string }
          throw new Error(data.error ?? '웹훅 전송 실패')
        }
      } catch (err) {
        console.warn('[webhook] 전송 실패 (앱 동작에는 영향 없음):', url, err)
      }
    }),
  )
}

function deptResultField(result: DepartmentResult) {
  const deptName = DEPARTMENTS[result.deptId]?.name ?? result.deptId
  const preview = result.content.slice(0, 200) + (result.content.length > 200 ? '...' : '')
  return { name: `${deptName} (${result.agentName})`, value: preview }
}

export function buildTaskWebhookPayload(task: Task) {
  const deptNames = task.assignedTo.map((id) => DEPARTMENTS[id]?.name ?? id).join(', ')
  const statusLabel = STATUS_LABEL[task.status]
  const color = task.status === 'completed' ? 0x44ff88 : 0xff4466

  const resultFields = task.departmentResults && task.departmentResults.length > 0
    ? task.departmentResults.slice(0, 5).map(deptResultField)
    : task.result
      ? [{ name: '결과 요약', value: task.result.slice(0, 300) + (task.result.length > 300 ? '...' : '') }]
      : []

  const slackBody = task.departmentResults && task.departmentResults.length > 0
    ? task.departmentResults.slice(0, 5)
        .map((result) => `*${DEPARTMENTS[result.deptId]?.name ?? result.deptId}*\n${result.content.slice(0, 150)}`)
        .join('\n\n')
    : task.result?.slice(0, 300) ?? ''

  // Discord: embeds + content(fallback), Slack: text
  // 두 필드를 모두 포함 — Discord는 embeds를 사용하고 text를 무시, Slack은 text를 사용
  return {
    embeds: [{
      title: `${statusLabel} ${task.title}`,
      color,
      fields: [
        { name: '담당 부서', value: deptNames || '미배정', inline: true },
        { name: '상태', value: task.status === 'completed' ? '완료' : '실패', inline: true },
        ...resultFields,
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'AI 오피스' },
    }],
    content: `${statusLabel} **${task.title}** — 담당: ${deptNames || '미배정'}`,
    text: `${statusLabel} *${task.title}*\n담당: ${deptNames || '미배정'}\n${slackBody}`,
  }
}

export function buildBriefingWebhookPayload(briefingContent: string) {
  return {
    embeds: [{
      title: 'AI 오피스 일일 브리핑',
      description: briefingContent.slice(0, 4000),
      color: 0x64ffda,
      timestamp: new Date().toISOString(),
      footer: { text: 'AI 오피스 자동 브리핑' },
    }],
    content: '📋 AI 오피스 일일 브리핑이 도착했습니다.',
    text: `*AI 오피스 일일 브리핑*\n${briefingContent.slice(0, 500)}`,
  }
}

export function buildWebhookSettings(store: ReturnType<typeof useAgentStore.getState>): WebhookSettings {
  return store.webhookSettings
}

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
